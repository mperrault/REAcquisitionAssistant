import { z } from "zod";

const nullableNumberSchema = z.number().nonnegative().nullable().optional();
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();

export const browserCapturePayloadSchema = z
  .object({
    pageUrl: z.string().min(1),
    title: z.string().optional().default(""),
    sourceSite: z.string().optional().default(""),
    addressFull: z.string().optional().default(""),
    addressLine1: z.string().optional().default(""),
    city: z.string().optional().default(""),
    state: z.string().optional().default(""),
    postalCode: z.string().optional().default(""),
    listingRemarks: z.string().optional().default(""),
    askingPrice: nullableIntegerSchema,
    bedrooms: nullableNumberSchema,
    bathrooms: nullableNumberSchema,
    livingSqft: nullableIntegerSchema,
    photoUrls: z.array(z.string()).optional().default([])
  })
  .passthrough();

export type BrowserCapturePayload = z.infer<typeof browserCapturePayloadSchema>;

export const browserCaptureRecordSchema = browserCapturePayloadSchema.extend({
  id: z.string().min(1),
  capturedAt: z.string().datetime(),
  sourceSite: z.string(),
  addressLine1: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  photoUrls: z.array(z.string())
});

export type BrowserCaptureRecord = z.infer<typeof browserCaptureRecordSchema>;

export const browserCaptureListResponseSchema = z.object({
  captures: z.array(browserCaptureRecordSchema)
});

export const browserCapturePostResponseSchema = z.object({
  capture: browserCaptureRecordSchema
});

const addressPattern =
  /(\d{1,6}\s+[A-Za-z0-9 .'-]+?(?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Circle|Cir\.?|Trail|Terrace|Ter\.?|Way|Place|Pl\.?|Boulevard|Blvd\.?|Highway|Hwy\.?))\s*,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

export function createBrowserCaptureRecord(
  payload: unknown,
  capturedAt = new Date().toISOString(),
  createId = createCaptureId
): BrowserCaptureRecord {
  const parsed = browserCapturePayloadSchema.parse(payload);
  const address = parseAddressParts(
    [
      parsed.addressFull,
      parsed.addressLine1 && parsed.city && parsed.state
        ? `${parsed.addressLine1}, ${parsed.city}, ${parsed.state} ${parsed.postalCode}`
        : "",
      parsed.title
    ].join("\n")
  );

  return browserCaptureRecordSchema.parse({
    ...parsed,
    id: createId(),
    capturedAt,
    sourceSite: parsed.sourceSite || getSourceSite(parsed.pageUrl),
    addressLine1: parsed.addressLine1 || address.addressLine1,
    city: parsed.city || address.city,
    state: (parsed.state || address.state).toUpperCase(),
    postalCode: parsed.postalCode || address.postalCode,
    listingRemarks: compactWhitespace(parsed.listingRemarks).slice(0, 8000),
    photoUrls: normalizePhotoUrls(parsed.photoUrls).slice(0, 80)
  });
}

export function normalizePhotoUrls(urls: string[]) {
  return Array.from(
    new Set(
      urls
        .map((url) => url.trim())
        .filter(Boolean)
        .filter((url) => /^https?:\/\//i.test(url))
        .filter((url) => !isNonPropertyPhotoUrl(url))
    )
  );
}

export function getSourceSite(pageUrl: string) {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseAddressParts(value: string) {
  const match = value.match(addressPattern);

  if (!match) {
    return {
      addressLine1: "",
      city: "",
      state: "",
      postalCode: ""
    };
  }

  return {
    addressLine1: compactWhitespace(match[1] ?? ""),
    city: compactWhitespace(match[2] ?? ""),
    state: (match[3] ?? "").toUpperCase(),
    postalCode: match[4] ?? ""
  };
}

function isNonPropertyPhotoUrl(url: string) {
  const normalized = url.toLowerCase();

  return (
    normalized.startsWith("data:") ||
    normalized.includes("z-logo") ||
    normalized.includes("zillow_web") ||
    normalized.includes("app-store-badge") ||
    normalized.includes("google-play-badge") ||
    normalized.includes("footer-art") ||
    normalized.includes("staticmap") ||
    normalized.includes("/agents/") ||
    normalized.includes("agent")
  );
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createCaptureId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `capture-${Date.now()}`;
}
