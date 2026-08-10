import { afterEach, describe, expect, it } from "vitest";

import { pollImapListingAlerts } from "@/lib/listing-alerts/imap-poller";
import { createListingAlertSource } from "@/lib/listing-alerts/listing-alert-persistence";

const passwordEnvVar = "REA_TEST_IMAP_PASSWORD";
const originalPassword = process.env[passwordEnvVar];

afterEach(() => {
  if (originalPassword === undefined) {
    delete process.env[passwordEnvVar];
  } else {
    process.env[passwordEnvVar] = originalPassword;
  }
});

describe("IMAP listing alert poller", () => {
  it("requires the configured server-side password secret", async () => {
    delete process.env[passwordEnvVar];

    const source = createListingAlertSource({
      provider: "imap_mailbox",
      connectorConfig: {
        gmailAccountHint: "",
        imapHost: "mail.example.com",
        imapPort: 993,
        imapSecurity: "ssl_tls",
        imapUsername: "alerts@example.com",
        imapMailbox: "INBOX",
        credentialEnvVar: passwordEnvVar
      }
    });

    await expect(
      pollImapListingAlerts({
        source,
        since: null,
        maxMessages: 20
      })
    ).rejects.toThrow(`Missing IMAP password environment variable: ${passwordEnvVar}`);
  });
});

