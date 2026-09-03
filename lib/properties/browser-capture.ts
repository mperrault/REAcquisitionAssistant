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
    photoDetails: z
      .array(
        z.object({
          url: z.string(),
          alt: z.string().optional().default(""),
          index: z.number().int().nonnegative().optional().default(0)
        })
      )
      .optional()
      .default([]),
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
  /(\d{1,6}[ \t]+[A-Za-z0-9 .'-]+?(?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Circle|Cir\.?|Trail|Terrace|Ter\.?|Way|Place|Pl\.?|Boulevard|Blvd\.?|Highway|Hwy\.?))\s*,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

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

  const sourceSite = parsed.sourceSite || getSourceSite(parsed.pageUrl);
  const photoUrls = selectCapturePhotoUrls({
    sourceSite,
    addressLine1: parsed.addressLine1 || address.addressLine1,
    photoDetails: parsed.photoDetails,
    photoUrls: parsed.photoUrls
  });

  return browserCaptureRecordSchema.parse({
    ...parsed,
    id: createId(),
    capturedAt,
    sourceSite,
    addressLine1: parsed.addressLine1 || address.addressLine1,
    city: parsed.city || address.city,
    state: (parsed.state || address.state).toUpperCase(),
    postalCode: parsed.postalCode || address.postalCode,
    listingRemarks: compactWhitespace(parsed.listingRemarks).slice(0, 8000),
    photoUrls
  });
}

export function normalizePhotoUrls(urls: string[]) {
  const photosByIdentity = new Map<string, string>();

  for (const url of urls) {
    const normalizedUrl = url.trim();

    if (
      !normalizedUrl ||
      !/^https?:\/\//i.test(normalizedUrl) ||
      isNonPropertyPhotoUrl(normalizedUrl)
    ) {
      continue;
    }

    const identity = getPhotoIdentity(normalizedUrl);

    if (!photosByIdentity.has(identity)) {
      photosByIdentity.set(identity, normalizedUrl);
    }
  }

  return Array.from(photosByIdentity.values());
}

export function summarizeCapturePhotoSelection({
  sourceSite,
  addressLine1,
  photoDetails,
  photoUrls
}: {
  sourceSite: string;
  addressLine1: string;
  photoDetails: BrowserCapturePayload["photoDetails"];
  photoUrls: string[];
}) {
  const detectedCount =
    photoDetails.length > 0 ? photoDetails.length : photoUrls.length;
  const acceptedUrls = selectCapturePhotoUrls({
    sourceSite,
    addressLine1,
    photoDetails,
    photoUrls
  });

  return {
    detectedCount,
    acceptedCount: acceptedUrls.length,
    rejectedCount: Math.max(0, detectedCount - acceptedUrls.length),
    acceptedUrls
  };
}

export function selectCapturePhotoUrls({
  sourceSite,
  addressLine1,
  photoDetails,
  photoUrls
}: {
  sourceSite: string;
  addressLine1: string;
  photoDetails: BrowserCapturePayload["photoDetails"];
  photoUrls: string[];
}) {
  const normalizedDetails = photoDetails
    .map((photo, index) => ({
      url: photo.url,
      alt: photo.alt ?? "",
      index: photo.index ?? index
    }))
    .filter((photo) => photo.url);
  const sourceUrls =
    normalizedDetails.length > 0
      ? normalizedDetails.map((photo) => photo.url)
      : photoUrls;
  const normalizedUrls = normalizePhotoUrls(sourceUrls);
  const normalizedSourceSite = sourceSite.toLowerCase();

  if (!normalizedSourceSite.includes("zillow")) {
    return normalizedUrls.slice(0, 80);
  }

  if (normalizedDetails.length === 0) {
    return [];
  }

  const addressTokens = getAddressTokens(addressLine1);

  if (addressTokens.length === 0) {
    return normalizedUrls.slice(0, 12);
  }

  const acceptedUrls = normalizedDetails
    .filter((photo) => normalizedUrls.includes(photo.url))
    .filter((photo) => isTargetListingPhoto(photo, addressTokens))
    .map((photo) => photo.url);

  return Array.from(new Set(acceptedUrls)).slice(0, 40);
}

export function getSourceSite(pageUrl: string) {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseAddressParts(value: string) {
  const lines = value
    .split(/\n+/)
    .map((line) => compactWhitespace(line))
    .filter(Boolean);
  const candidates = (lines.length > 0 ? lines : [compactWhitespace(value)])
    .map((line) => line.match(addressPattern))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .sort((a, b) => scoreAddressMatch(b) - scoreAddressMatch(a));
  const match = candidates[0];

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
  const pathname = getUrlPathname(normalized);

  return (
    normalized.startsWith("data:") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".gif") ||
    normalized.includes("z-logo") ||
    normalized.includes("zillow_web") ||
    normalized.includes("app-store-badge") ||
    normalized.includes("google-play-badge") ||
    normalized.includes("footer-art") ||
    normalized.includes("staticmap") ||
    normalized.includes("static.rdc.moveaws.com") ||
    normalized.includes("/rdc-ui/") ||
    normalized.includes("/logos/") ||
    normalized.includes("/icons/") ||
    normalized.includes("/pictos/") ||
    normalized.includes("app-promotion") ||
    normalized.includes("download-badge") ||
    normalized.includes("vu-logo") ||
    getUrlHostname(normalized) === "p.rdcpix.com" ||
    normalized.includes("/agents/") ||
    normalized.includes("agent")
  );
}

function getUrlHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getUrlPathname(url: string) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url;
  }
}

function getPhotoIdentity(url: string) {
  const zillowMatch = url.match(/photos\.zillowstatic\.com\/fp\/([a-f0-9]+)-/i);

  if (zillowMatch?.[1]) {
    return `zillow:${zillowMatch[1]}`;
  }

  const realtorMatch = url.match(
    /ap\.rdcpix\.com\/([^/?#]+?l-m\d+)(?:rd)?(?:-[^/?#]+)?\.(?:jpe?g|png|webp)/i
  );

  if (realtorMatch?.[1]) {
    return `realtor:${realtorMatch[1].toLowerCase()}`;
  }

  return url;
}

function isTargetListingPhoto(
  photo: { alt: string; url: string; index: number },
  addressTokens: string[]
) {
  const alt = compactWhitespace(photo.alt).toLowerCase();
  const url = photo.url.toLowerCase();

  if (!url.includes("photos.zillowstatic.com/fp/")) {
    return false;
  }

  if (alt && addressTokens.every((token) => alt.includes(token))) {
    return true;
  }

  return false;
}

function getAddressTokens(addressLine1: string) {
  const normalized = compactWhitespace(addressLine1)
    .toLowerCase()
    .replace(/\b(rd|st|ave|ln|dr|ct|cir|ter|pl|blvd|hwy)\.?\b/g, (value) => {
      const expansions: Record<string, string> = {
        rd: "road",
        st: "street",
        ave: "avenue",
        ln: "lane",
        dr: "drive",
        ct: "court",
        cir: "circle",
        ter: "terrace",
        pl: "place",
        blvd: "boulevard",
        hwy: "highway"
      };

      return expansions[value.replace(".", "")] ?? value;
    });

  return normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
    .slice(0, 4);
}

function scoreAddressMatch(match: RegExpMatchArray) {
  const addressLine = compactWhitespace(match[1] ?? "");
  const startsWithTwoNumbers = /^\d+\s+\d+\s+/.test(addressLine);

  return addressLine.length - (startsWithTwoNumbers ? 1000 : 0);
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
