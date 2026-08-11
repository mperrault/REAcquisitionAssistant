import { describe, expect, it } from "vitest";

import {
  createPropertyDraftFromListingCandidate,
  parseListingAlertText
} from "@/lib/listing-alerts/listing-alert-parser";
import {
  clearListingAlertQueue,
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

function zillowRedirectUrl(zpid: string) {
  const target = `https://www.zillow.com/routing/email/property-notifications/zpid_target/${zpid}_zpid/X1-SSabc_sse/?z&utm_campaign=emo-instantsavedsearch&utm_source=email`;

  return `https://click.mail.zillow.com/f/a/link?target=${encodeURIComponent(
    target
  )}`;
}

const zillowInstantAlertText = `New Listing: 18 Fiske Hill Rd Sturbridge, MA 01566. Your 'For Sale near Stafford Springs CT 06076' search

Latest results for your For Sale near Stafford Springs CT 06076 search.

============================================================
Zillow (r) -
https://click.mail.zillow.com/f/a/header?target=https%3A%2F%2Fwww.zillow.com%2F%3Futm_campaign%3Demo-instantsavedsearch
============================================================

New listing for sale at $400,000

This home matches your search For Sale near Stafford Springs CT 06076: $500K or less, 2+ Beds, 1+ Baths, and&nbsp;more
https://click.mail.zillow.com/f/a/search?target=https%3A%2F%2Fwww.zillow.com%2Fhomes%2Ffor_sale%2F%3FsearchQueryState%3D%257B%2522price%2522%253A%257B%2522max%2522%253A500000%257D%257D

------------------------------------------------------------
For sale by owner. NEW.

$400,000
3 bd | 2 ba | 1,404 sqft

18 Fiske Hill Rd, Sturbridge, MA

View this listing -
${zillowRedirectUrl("57651702")}

------------------------------------------------------------
Zillow Home Loans (r) -
https://click.mail.zillow.com/f/a/loan?target=https%3A%2F%2Fwww.zillow.com%2Fhomeloans%2Feligibility

Zillow, Inc.
1301 Second Avenue, Floor 36
Seattle, WA 98101

Unsubscribe from this email -
https://click.mail.zillow.com/f/a/unsub?target=https%3A%2F%2Fwww.zillow.com%2Femail%2Funsubscribe`;

const zillowDigestAlertText = `Daily results straight to your inbox.

Zillow (r) -
https://click.mail.zillow.com/f/a/header?target=https%3A%2F%2Fwww.zillow.com%2F

For Sale near Stafford Springs CT 06076 -

$500K or less, 2+ Beds, 1+ Baths...

For sale. NEW.
$419,000
3 bd | 2 ba | 2,056 sqft
289 Morgan St, South Hadley, MA

View this listing -
${zillowRedirectUrl("11111111")}

For sale.
$369,000 | Price cut: $10K (8/10)
3 bd | 1 ba | 982 sqft
50 Phelps St, Easthampton, MA

View this listing -
${zillowRedirectUrl("22222222")}

Zillow Home Loans (r) -
https://click.mail.zillow.com/f/a/loan?target=https%3A%2F%2Fwww.zillow.com%2Fhomeloans%2Feligibility

Zillow, Inc.
1301 Second Avenue, Floor 36
Seattle, WA 98101`;

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

  it("extracts a Zillow instant alert without creating URL-only candidates", () => {
    const result = parseListingAlertText(zillowInstantAlertText, {
      timestamp,
      createId: deterministicIds("fact")
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate?.addressLine1).toBe("18 Fiske Hill Rd");
    expect(candidate?.city).toBe("Sturbridge");
    expect(candidate?.state).toBe("MA");
    expect(candidate?.postalCode).toBe("01566");
    expect(candidate?.askingPrice).toBe(400000);
    expect(candidate?.bedrooms).toBe(3);
    expect(candidate?.bathrooms).toBe(2);
    expect(candidate?.livingSqft).toBe(1404);
    expect(candidate?.listingUrl).toContain("57651702_zpid");
    expect(candidate?.warnings).toEqual([]);
  });

  it("extracts Zillow daily digest cards and ignores saved-search criteria", () => {
    const result = parseListingAlertText(zillowDigestAlertText, {
      timestamp,
      createId: deterministicIds("fact")
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(
      result.candidates.map((candidate) => candidate.addressLine1)
    ).toEqual(["289 Morgan St", "50 Phelps St"]);
    expect(result.candidates.map((candidate) => candidate.askingPrice)).toEqual(
      [419000, 369000]
    );
    expect(result.candidates.map((candidate) => candidate.bedrooms)).toEqual([
      3, 3
    ]);
    expect(result.candidates.map((candidate) => candidate.bathrooms)).toEqual([
      2, 1
    ]);
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

  it("uses the alert subject when the message body omits the address", () => {
    const source = createListingAlertSource(
      {
        id: "source-subject",
        name: "Zillow Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const result = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-subject",
        subject:
          "New Listing: 18 Fiske Hill Rd Sturbridge, MA 01566. Your search",
        from: "Zillow <instant-updates@mail.zillow.com>",
        receivedAt: timestamp,
        bodyText: `For sale by owner. NEW.
$400,000
3 bd | 2 ba | 1,404 sqft
View this listing -
${zillowRedirectUrl("57651702")}`
      },
      timestamp,
      deterministicIds("subject")
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("18 Fiske Hill Rd");
    expect(result.candidates[0]?.postalCode).toBe("01566");
    expect(result.candidates[0]?.warnings).not.toContain(
      "No address or town found."
    );
  });

  it("clears the queue without removing source configuration", () => {
    const source = createListingAlertSource(
      {
        id: "source-clear",
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
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-clear",
        subject: "Alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("clear")
    );
    const cleared = clearListingAlertQueue(ingested.state);

    expect(cleared.sources).toHaveLength(1);
    expect(cleared.sources[0]?.connectorConfig.imapHost).toBe(
      "mail.example.com"
    );
    expect(cleared.candidates).toHaveLength(0);
    expect(cleared.messages).toHaveLength(0);
    expect(cleared.runs).toHaveLength(0);
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
