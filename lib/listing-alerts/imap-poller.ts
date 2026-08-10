import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser, type ParsedAddress } from "mailparser";

import {
  type ListingAlertPollRequest,
  type ListingAlertPollResponse,
  listingAlertPollResponseSchema
} from "@/lib/listing-alerts/polling-types";

const defaultLookbackDays = 30;
const maxMessageBytes = 2_000_000;

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function addressToText(address: ParsedAddress | undefined) {
  if (!address) {
    return "";
  }

  if (address.text) {
    return address.text;
  }

  return (
    address.value
      ?.map((entry) =>
        [entry.name, entry.address ? `<${entry.address}>` : ""]
          .filter(Boolean)
          .join(" ")
      )
      .join(", ") ?? ""
  );
}

function getSinceDate(value: string | null | undefined) {
  if (value) {
    return new Date(value);
  }

  return new Date(Date.now() - defaultLookbackDays * 24 * 60 * 60 * 1000);
}

function createExternalMessageId(mailbox: string, uid: number, messageId?: string) {
  return messageId || `${mailbox}:uid:${uid}`;
}

export async function pollImapListingAlerts(
  request: ListingAlertPollRequest
): Promise<ListingAlertPollResponse> {
  if (request.source.provider !== "imap_mailbox") {
    throw new Error("Only IMAP mailbox sources can use the IMAP poller.");
  }

  const config = request.source.connectorConfig;
  const password = process.env[config.credentialEnvVar];

  if (!password) {
    throw new Error(
      `Missing IMAP password environment variable: ${config.credentialEnvVar}`
    );
  }

  if (!config.imapHost || !config.imapUsername || !config.imapMailbox) {
    throw new Error("IMAP host, username, and mailbox folder are required.");
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecurity === "ssl_tls",
    auth: {
      user: config.imapUsername,
      pass: password
    },
    logger: false
  });

  const warnings: string[] = [];

  try {
    await client.connect();
    await client.mailboxOpen(config.imapMailbox, { readOnly: true });

    const searchQuery: SearchObject = {
      since: getSinceDate(request.since)
    };
    const foundUids = await client.search(searchQuery, { uid: true });
    const uids = Array.isArray(foundUids)
      ? foundUids
          .filter((uid) => Number.isFinite(uid))
          .sort((a, b) => b - a)
          .slice(0, request.maxMessages)
          .sort((a, b) => a - b)
      : [];
    const messages = [];

    for await (const message of client.fetch(
      uids,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        source: { maxLength: maxMessageBytes }
      },
      { uid: true }
    )) {
      if (!message.source) {
        warnings.push(`Message UID ${message.uid} did not include a body.`);
        continue;
      }

      const parsed = await simpleParser(message.source);
      const html = typeof parsed.html === "string" ? parsed.html : "";
      const bodyText = parsed.text || stripHtml(html);
      const receivedAt =
        parsed.date ??
        message.envelope?.date ??
        message.internalDate ??
        new Date();
      const receivedAtDate = new Date(receivedAt);

      messages.push({
        externalMessageId: createExternalMessageId(
          config.imapMailbox,
          message.uid,
          parsed.messageId ?? message.envelope?.messageId
        ),
        subject: parsed.subject ?? message.envelope?.subject ?? "",
        from: addressToText(parsed.from),
        receivedAt: Number.isNaN(receivedAtDate.getTime())
          ? new Date().toISOString()
          : receivedAtDate.toISOString(),
        bodyText,
        bodyHtml: html,
        uid: message.uid
      });
    }

    return listingAlertPollResponseSchema.parse({
      messages: messages.sort(
        (a, b) =>
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      ),
      checkedAt: new Date().toISOString(),
      warnings
    });
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
