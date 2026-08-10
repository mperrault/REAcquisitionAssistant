import { z } from "zod";

import { propertyFactSchema } from "@/lib/properties/types";

export const listingAlertSourceProviderSchema = z.enum([
  "gmail_label",
  "gmail_query",
  "imap_mailbox",
  "manual_test"
]);

export type ListingAlertSourceProvider = z.infer<
  typeof listingAlertSourceProviderSchema
>;

export const listingAlertConnectorSecuritySchema = z.enum([
  "ssl_tls",
  "starttls",
  "none"
]);

export type ListingAlertConnectorSecurity = z.infer<
  typeof listingAlertConnectorSecuritySchema
>;

export const listingAlertConnectorConfigDefaults = {
  gmailAccountHint: "",
  imapHost: "",
  imapPort: 993,
  imapSecurity: "ssl_tls" as const,
  imapUsername: "",
  imapMailbox: "INBOX",
  credentialEnvVar: "REA_LISTING_ALERT_IMAP_PASSWORD"
};

export const listingAlertConnectorConfigSchema = z
  .object({
    gmailAccountHint: z.string(),
    imapHost: z.string(),
    imapPort: z.number().int().positive(),
    imapSecurity: listingAlertConnectorSecuritySchema,
    imapUsername: z.string(),
    imapMailbox: z.string(),
    credentialEnvVar: z.string()
  })
  .default(listingAlertConnectorConfigDefaults);

export type ListingAlertConnectorConfig = z.infer<
  typeof listingAlertConnectorConfigSchema
>;

export const listingAlertSourceSchema = z.object({
  id: z.string().min(1),
  provider: listingAlertSourceProviderSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  mailboxLabel: z.string(),
  searchQuery: z.string(),
  connectorConfig: listingAlertConnectorConfigSchema,
  pollingMinutes: z.number().int().positive(),
  lastCheckedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ListingAlertSource = z.infer<typeof listingAlertSourceSchema>;

export const listingAlertMessageSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  externalMessageId: z.string().min(1),
  subject: z.string(),
  from: z.string(),
  receivedAt: z.string().datetime(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  processedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export type ListingAlertMessage = z.infer<typeof listingAlertMessageSchema>;

export type ListingAlertMessageInput = {
  externalMessageId?: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  bodyText: string;
  bodyHtml?: string;
};

export const listingCandidateStatusSchema = z.enum([
  "new",
  "imported",
  "ignored"
]);

export type ListingCandidateStatus = z.infer<
  typeof listingCandidateStatusSchema
>;

export const listingCandidateExtractSchema = z.object({
  listingUrl: z.string(),
  mlsId: z.string(),
  addressLine1: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  askingPrice: z.number().int().nonnegative().nullable(),
  bedrooms: z.number().nonnegative().nullable(),
  bathrooms: z.number().nonnegative().nullable(),
  livingSqft: z.number().int().nonnegative().nullable(),
  lotAcres: z.number().nonnegative().nullable(),
  yearBuilt: z.number().int().nonnegative().nullable(),
  listingRemarks: z.string(),
  rawText: z.string(),
  facts: z.array(propertyFactSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string())
});

export type ListingCandidateExtract = z.infer<
  typeof listingCandidateExtractSchema
>;

export const listingCandidateSchema = listingCandidateExtractSchema.extend({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  messageId: z.string().min(1),
  externalMessageId: z.string().min(1),
  status: listingCandidateStatusSchema,
  importedPropertyId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ListingCandidate = z.infer<typeof listingCandidateSchema>;

export const listingAlertRunStatusSchema = z.enum(["completed", "failed"]);

export type ListingAlertRunStatus = z.infer<typeof listingAlertRunStatusSchema>;

export const listingAlertRunSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  status: listingAlertRunStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  messagesSeen: z.number().int().nonnegative(),
  candidatesCreated: z.number().int().nonnegative(),
  candidatesUpdated: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});

export type ListingAlertRun = z.infer<typeof listingAlertRunSchema>;

export const listingAlertStateSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(listingAlertSourceSchema),
  messages: z.array(listingAlertMessageSchema),
  candidates: z.array(listingCandidateSchema),
  runs: z.array(listingAlertRunSchema)
});

export type ListingAlertState = z.infer<typeof listingAlertStateSchema>;
