import { z } from "zod";

import { listingAlertSourceSchema } from "@/lib/listing-alerts/types";

export const listingAlertPollRequestSchema = z.object({
  source: listingAlertSourceSchema,
  since: z.string().datetime().nullable().optional(),
  maxMessages: z.number().int().min(1).max(100).default(20)
});

export type ListingAlertPollRequest = z.infer<
  typeof listingAlertPollRequestSchema
>;

export const listingAlertPolledMessageSchema = z.object({
  externalMessageId: z.string().min(1),
  subject: z.string(),
  from: z.string(),
  receivedAt: z.string().datetime(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  uid: z.number().int().positive()
});

export type ListingAlertPolledMessage = z.infer<
  typeof listingAlertPolledMessageSchema
>;

export const listingAlertPollResponseSchema = z.object({
  messages: z.array(listingAlertPolledMessageSchema),
  checkedAt: z.string().datetime(),
  warnings: z.array(z.string())
});

export type ListingAlertPollResponse = z.infer<
  typeof listingAlertPollResponseSchema
>;

