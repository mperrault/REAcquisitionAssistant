import { describe, expect, it } from "vitest";

import {
  createPropertyDraftFromListingCandidate,
  parseListingAlertText
} from "@/lib/listing-alerts/listing-alert-parser";
import {
  createEmptyListingAlertState,
  createListingAlertSource,
  ingestListingAlertText,
  LISTING_ALERT_STORAGE_KEY,
  loadListingAlertState,
  upsertListingAlertSource
} from "@/lib/listing-alerts/listing-alert-persistence";

const timestamp = "2026-08-10T22:00:00.000Z";

function deterministicIds(prefix = "id") {
  let index = 0;

  return () => `${prefix}-${(index += 1)}`;
}

const alertText = `New listings matching your saved search

287 County Road, Woodstock, CT 06281
$329,900
3 beds 2 baths 1,684 sq ft
5.2 acres
Built in 1978
MLS 24012345
Open fields, barn, pastoral views, private well and septic.
https://example.com/listing/287-county-road

14 Pond View Lane, Stafford, CT 06076
$289,000
2 bd 1.5 ba 1,248 sqft
1.7 acres
Pond view, wooded privacy, oil heat.
https://example.com/listing/14-pond-view-lane`;

describe("listing alert ingestion", () => {
  it("extracts listing candidates from saved-search alert text", () => {
    const result = parseListingAlertText(alertText, {
      timestamp,
      createId: deterministicIds("fact")
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(2);

    const first = result.candidates[0];
    expect(first?.addressLine1).toBe("287 County Road");
    expect(first?.city).toBe("Woodstock");
    expect(first?.state).toBe("CT");
    expect(first?.askingPrice).toBe(329900);
    expect(first?.bedrooms).toBe(3);
    expect(first?.bathrooms).toBe(2);
    expect(first?.livingSqft).toBe(1684);
    expect(first?.lotAcres).toBe(5.2);
    expect(first?.yearBuilt).toBe(1978);
    expect(first?.mlsId).toBe("24012345");
    expect(first?.rawText).not.toContain("14 Pond View Lane");
    expect(first?.facts.map((fact) => fact.factKey)).toEqual(
      expect.arrayContaining([
        "setting.open_fields_pastoral",
        "setting.horse_property",
        "utility.well",
        "utility.septic"
      ])
    );
  });

  it("creates an editable property draft without manually entering fields", () => {
    const result = parseListingAlertText(alertText, {
      timestamp,
      createId: deterministicIds("fact")
    });
    const candidate = result.candidates[0];

    expect(candidate).toBeDefined();

    const property = createPropertyDraftFromListingCandidate(
      candidate!,
      timestamp,
      deterministicIds("property")
    );

    expect(property.addressLine1).toBe("287 County Road");
    expect(property.city).toBe("Woodstock");
    expect(property.listingUrl).toBe(
      "https://example.com/listing/287-county-road"
    );
    expect(property.askingPrice).toBe(329900);
    expect(property.listingRemarks).toContain("Open fields");
    expect(property.facts.every((fact) => fact.sourceType === "listing")).toBe(
      true
    );
    expect(property.facts.every((fact) => fact.verified === false)).toBe(true);
  });

  it("deduplicates repeated alerts by listing identity", () => {
    const source = createListingAlertSource(
      {
        id: "source-1",
        name: "Saved Search Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const firstRun = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-1",
        subject: "First alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("first")
    );
    const secondRun = ingestListingAlertText(
      firstRun.state,
      source.id,
      {
        externalMessageId: "message-2",
        subject: "Second alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("second")
    );

    expect(firstRun.run.candidatesCreated).toBe(2);
    expect(secondRun.run.candidatesCreated).toBe(0);
    expect(secondRun.run.candidatesUpdated).toBe(2);
    expect(secondRun.state.candidates).toHaveLength(2);
    expect(secondRun.state.messages).toHaveLength(2);
  });

  it("stores IMAP connector settings without storing a password", () => {
    const source = createListingAlertSource(
      {
        id: "source-imap",
        name: "MilestoneSW Listing Alerts",
        provider: "imap_mailbox",
        connectorConfig: {
          gmailAccountHint: "",
          imapHost: "mail.example.com",
          imapPort: 993,
          imapSecurity: "ssl_tls",
          imapUsername: "alerts@example.com",
          imapMailbox: "INBOX",
          credentialEnvVar: "REA_LISTING_ALERT_IMAP_PASSWORD"
        }
      },
      timestamp,
      deterministicIds("source")
    );

    expect(source.connectorConfig.imapHost).toBe("mail.example.com");
    expect(source.connectorConfig.imapPort).toBe(993);
    expect(source.connectorConfig.imapSecurity).toBe("ssl_tls");
    expect(source.connectorConfig.credentialEnvVar).toBe(
      "REA_LISTING_ALERT_IMAP_PASSWORD"
    );
    expect(Object.keys(source.connectorConfig)).not.toContain("password");
    expect(Object.keys(source.connectorConfig)).not.toContain("imapPassword");
  });

  it("backfills connector defaults for older saved alert sources", () => {
    const source = createListingAlertSource(
      {
        id: "source-legacy",
        name: "Legacy Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const legacySource: Record<string, unknown> = { ...source };
    delete legacySource.connectorConfig;
    const storage = {
      getItem: (key: string) =>
        key === LISTING_ALERT_STORAGE_KEY
          ? JSON.stringify({
              schemaVersion: 1,
              sources: [legacySource],
              messages: [],
              candidates: [],
              runs: []
            })
          : null,
      setItem: () => undefined
    };

    const result = loadListingAlertState(storage);

    expect(result.source).toBe("storage");
    expect(result.state.sources[0]?.connectorConfig.imapPort).toBe(993);
    expect(result.state.sources[0]?.connectorConfig.imapMailbox).toBe("INBOX");
  });
});
