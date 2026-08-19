import { z } from "zod";

import type { ListingCandidate } from "@/lib/listing-alerts/types";

const requestCandidateSchema = z.object({
  id: z.string().min(1),
  listingUrl: z.string().url(),
  addressLine1: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  askingPrice: z.number().int().nonnegative().nullable(),
  primaryPhotoUrl: z.string(),
  photoUrls: z.array(z.string()),
  houseStyle: z.string().default(""),
  listingRemarks: z.string().default(""),
  inferStyle: z.boolean().default(false)
});

export const listingCandidateEnrichmentRequestSchema = z.object({
  candidate: requestCandidateSchema
});

export const listingCandidateEnrichmentResponseSchema = z.object({
  candidateId: z.string().min(1),
  listingUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  updates: z.object({
    askingPrice: z.number().int().nonnegative().nullable(),
    primaryPhotoUrl: z.string(),
    photoUrls: z.array(z.string()),
    houseStyle: z.string(),
    styleFactKey: z.string(),
    styleConfidence: z.number().min(0).max(1).nullable(),
    styleEvidence: z.string(),
    styleSource: z.enum(["", "listing_text", "photo_inference"])
  }),
  warnings: z.array(z.string())
});

export type ListingCandidateEnrichmentResponse = z.infer<
  typeof listingCandidateEnrichmentResponseSchema
>;

type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "text" | "json">>;

type Metadata = {
  askingPrice: number | null;
  photoUrls: string[];
  pageText: string;
};

type StyleInference = {
  houseStyle: string;
  styleFactKey: string;
  confidence: number;
  evidence: string;
  source: "listing_text" | "photo_inference";
};

const styleDefinitions = [
  {
    houseStyle: "Cape",
    styleFactKey: "style.cape",
    patterns: [/\bcape cod\b/i, /\bcape\b/i]
  },
  {
    houseStyle: "Cottage",
    styleFactKey: "style.cottage",
    patterns: [/\bcottage\b/i, /\bbungalow\b/i]
  },
  {
    houseStyle: "Farmhouse",
    styleFactKey: "style.farmhouse",
    patterns: [/\bfarmhouse\b/i, /\bfarm house\b/i]
  },
  {
    houseStyle: "Ranch",
    styleFactKey: "style.ranch",
    patterns: [/\branch\b/i, /\bone[-\s]level\b/i]
  },
  {
    houseStyle: "Colonial",
    styleFactKey: "style.colonial",
    patterns: [/\bcolonial\b/i]
  },
  {
    houseStyle: "Contemporary",
    styleFactKey: "style.contemporary",
    patterns: [/\bcontemporary\b/i, /\bmodern\b/i]
  },
  {
    houseStyle: "Log Home",
    styleFactKey: "style.log_home",
    patterns: [/\blog home\b/i, /\blog cabin\b/i]
  }
] as const;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getStyleUpdate(style: StyleInference | null) {
  return {
    houseStyle: style?.houseStyle ?? "",
    styleFactKey: style?.styleFactKey ?? "",
    styleConfidence: style?.confidence ?? null,
    styleEvidence: style?.evidence ?? "",
    styleSource: style?.source ?? ""
  };
}

function emptyUpdates() {
  return {
    askingPrice: null,
    primaryPhotoUrl: "",
    photoUrls: [],
    ...getStyleUpdate(null)
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeEscapedUrl(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function htmlToText(value: string) {
  return normalizeText(
    decodeHtmlEntities(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|article|section|tr|td|h\d|li)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function getHtmlAttribute(tag: string, attributeName: string) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = tag.match(pattern);

  return match?.[1] ? decodeEscapedUrl(match[1]) : "";
}

function extractPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 1000) {
    return Math.round(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/\$?\s*([1-9]\d{1,2}(?:,\d{3})+|[1-9]\d{5,8})/);

  if (!match?.[1]) {
    return null;
  }

  const price = Number.parseInt(match[1].replace(/,/g, ""), 10);

  return Number.isFinite(price) && price > 1000 ? price : null;
}

function isLikelyListingImageUrl(value: string) {
  const url = decodeEscapedUrl(value).trim();
  const normalized = url.toLowerCase();

  return (
    /^https?:\/\//.test(url) &&
    !normalized.includes("logo") &&
    !normalized.includes("icon") &&
    !normalized.includes("sprite") &&
    !normalized.includes("map") &&
    !normalized.endsWith(".svg") &&
    /\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(normalized)
  );
}

function isEligibleVisionImageUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      !isBlockedFetchHost(url) &&
      isLikelyListingImageUrl(value)
    );
  } catch {
    return false;
  }
}

function getTextEvidence(text: string, pattern: RegExp) {
  const match = text.match(pattern);

  if (!match?.index) {
    return match?.[0] ?? "";
  }

  const start = Math.max(0, match.index - 50);
  const end = Math.min(text.length, match.index + match[0].length + 50);

  return normalizeText(text.slice(start, end));
}

function inferHouseStyleFromText(text: string): StyleInference | null {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  for (const definition of styleDefinitions) {
    for (const pattern of definition.patterns) {
      if (pattern.test(normalized)) {
        return {
          houseStyle: definition.houseStyle,
          styleFactKey: definition.styleFactKey,
          confidence: 0.85,
          evidence: getTextEvidence(normalized, pattern),
          source: "listing_text"
        };
      }
    }
  }

  return null;
}

function parseStyleLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");

  return (
    styleDefinitions.find((definition) =>
      [
        definition.houseStyle.toLowerCase(),
        definition.styleFactKey.replace("style.", "").replace(/_/g, " ")
      ].includes(normalized)
    ) ?? null
  );
}

function extractResponseOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string") {
    return record.output_text;
  }

  const output = record.output;

  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const content = (item as Record<string, unknown>).content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content
        .map((part) =>
          part && typeof part === "object"
            ? (part as Record<string, unknown>).text
            : null
        )
        .filter((part): part is string => typeof part === "string");
    })
    .join(" ");
}

function parseVisionStyleInference(text: string): StyleInference | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const definition = parseStyleLabel(parsed.houseStyle);
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    if (!definition || confidence < 0.55) {
      return null;
    }

    return {
      houseStyle: definition.houseStyle,
      styleFactKey: definition.styleFactKey,
      confidence,
      evidence:
        typeof parsed.evidence === "string"
          ? normalizeText(parsed.evidence).slice(0, 240)
          : "Exterior photo inference",
      source: "photo_inference"
    };
  } catch {
    return null;
  }
}

async function inferHouseStyleFromPhotos(
  photoUrls: string[],
  fetcher: FetchLike
): Promise<{ style: StyleInference | null; warning: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const imageUrls = Array.from(new Set(photoUrls.filter(isEligibleVisionImageUrl)))
    .slice(0, 3);

  if (imageUrls.length === 0) {
    return { style: null, warning: "No eligible exterior photo URL for style inference." };
  }

  if (!apiKey) {
    return {
      style: null,
      warning: "Photo style inference skipped because OPENAI_API_KEY is not configured."
    };
  }

  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Classify the likely exterior house style from these real-estate photos. " +
                "Choose exactly one of: Cape, Cottage, Farmhouse, Ranch, Colonial, Contemporary, Log Home. " +
                "If uncertain, return confidence below 0.55. Return only JSON with keys houseStyle, confidence, evidence."
            },
            ...imageUrls.map((imageUrl) => ({
              type: "input_image",
              image_url: imageUrl,
              detail: "low"
            }))
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return {
      style: null,
      warning: `Photo style inference failed with HTTP ${response.status}.`
    };
  }

  const style = parseVisionStyleInference(extractResponseOutputText(await response.json()));

  return {
    style,
    warning: style ? null : "Photo style inference did not return a confident style."
  };
}

function collectImageUrls(value: unknown, urls: string[]) {
  if (typeof value === "string") {
    const decoded = decodeEscapedUrl(value);

    if (isLikelyListingImageUrl(decoded)) {
      urls.push(decoded);
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, urls));
    return;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    for (const key of ["url", "contentUrl", "image", "photo", "photos"]) {
      collectImageUrls(record[key], urls);
    }
  }
}

function collectPrices(value: unknown, prices: number[]) {
  const price = extractPrice(value);

  if (price !== null) {
    prices.push(price);
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPrices(item, prices));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/price|amount|listPrice|salePrice/i.test(key)) {
        const nestedPrice = extractPrice(item);

        if (nestedPrice !== null) {
          prices.push(nestedPrice);
        }
      }

      if (["offers", "priceSpecification", "@graph"].includes(key)) {
        collectPrices(item, prices);
      }
    }
  }
}

function parseJsonLdBlocks(html: string) {
  return Array.from(
    html.matchAll(
      /<script\b[^>]*type=["'][^"']*ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  )
    .map((match) => decodeHtmlEntities(match[1] ?? "").trim())
    .flatMap((rawJson) => {
      try {
        return [JSON.parse(rawJson) as unknown];
      } catch {
        return [];
      }
    });
}

function extractMetaContent(html: string, namePattern: RegExp) {
  return Array.from(html.matchAll(/<meta\b[^>]*>/gi))
    .filter((match) => namePattern.test(match[0]))
    .map((match) => getHtmlAttribute(match[0], "content"))
    .filter(Boolean);
}

function extractMetadata(html: string): Metadata {
  const photoUrls: string[] = [];
  const prices: number[] = [];

  for (const block of parseJsonLdBlocks(html)) {
    collectImageUrls(block, photoUrls);
    collectPrices(block, prices);
  }

  for (const url of extractMetaContent(
    html,
    /\b(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["']/i
  )) {
    if (isLikelyListingImageUrl(url)) {
      photoUrls.push(url);
    }
  }

  for (const priceText of extractMetaContent(
    html,
    /\b(?:property|name)=["'](?:product:price:amount|price|twitter:data1)["']/i
  )) {
    const price = extractPrice(priceText);

    if (price !== null) {
      prices.push(price);
    }
  }

  for (const match of html.matchAll(
    /https?:\\?\/\\?\/[^"'<>\\\s)]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\\\s)]*)?/gi
  )) {
    const url = decodeEscapedUrl(match[0]);

    if (isLikelyListingImageUrl(url)) {
      photoUrls.push(url);
    }
  }

  for (const match of html.matchAll(
    /"(?:price|listPrice|salePrice|amount)"\s*:\s*"?(\$?\d[\d,]{4,})"?/gi
  )) {
    const price = extractPrice(match[1]);

    if (price !== null) {
      prices.push(price);
    }
  }

  if (prices.length === 0) {
    const visiblePrice = extractPrice(htmlToText(html));

    if (visiblePrice !== null) {
      prices.push(visiblePrice);
    }
  }

  return {
    askingPrice: prices[0] ?? null,
    photoUrls: Array.from(new Set(photoUrls)),
    pageText: `${htmlToText(html)} ${normalizeText(
      decodeHtmlEntities(html).replace(/<[^>]+>/g, " ")
    )}`
  };
}

function normalizeAddressToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pageMatchesCandidate(candidate: z.infer<typeof requestCandidateSchema>, metadata: Metadata) {
  if (!candidate.addressLine1) {
    return true;
  }

  const addressToken = normalizeAddressToken(candidate.addressLine1);
  const pageToken = normalizeAddressToken(metadata.pageText);

  return pageToken.includes(addressToken);
}

function isBlockedFetchHost(url: URL) {
  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function validateFetchUrl(value: string) {
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol) || isBlockedFetchHost(url)) {
    throw new Error("Listing URL is not eligible for server-side enrichment.");
  }

  return url.toString();
}

export async function enrichListingCandidate(
  candidate: Pick<
    ListingCandidate,
    | "id"
    | "listingUrl"
    | "addressLine1"
    | "city"
    | "state"
    | "postalCode"
    | "askingPrice"
    | "primaryPhotoUrl"
    | "photoUrls"
  > &
    Partial<
      Pick<
        z.infer<typeof requestCandidateSchema>,
        "houseStyle" | "listingRemarks" | "inferStyle"
      >
    >,
  fetcher: FetchLike = fetch
): Promise<ListingCandidateEnrichmentResponse> {
  const parsedCandidate = requestCandidateSchema.parse(candidate);
  const listingUrl = validateFetchUrl(parsedCandidate.listingUrl);
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetcher(listingUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; REAcquisitionAssistant/0.1; +http://localhost)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      warnings.push(`Listing page fetch failed with HTTP ${response.status}.`);
      return listingCandidateEnrichmentResponseSchema.parse({
        candidateId: parsedCandidate.id,
        listingUrl,
        fetchedAt,
        updates: emptyUpdates(),
        warnings
      });
    }

    const metadata = extractMetadata(await response.text());

    if (!pageMatchesCandidate(parsedCandidate, metadata)) {
      warnings.push("Fetched listing page did not include candidate address.");
      return listingCandidateEnrichmentResponseSchema.parse({
        candidateId: parsedCandidate.id,
        listingUrl,
        fetchedAt,
        updates: emptyUpdates(),
        warnings
      });
    }

    const shouldFillPrice = parsedCandidate.askingPrice === null;
    const shouldFillPhoto = !parsedCandidate.primaryPhotoUrl;
    const shouldFillStyle =
      parsedCandidate.inferStyle && !parsedCandidate.houseStyle.trim();
    const availablePhotoUrls = Array.from(
      new Set([
        ...metadata.photoUrls,
        ...(parsedCandidate.primaryPhotoUrl
          ? [parsedCandidate.primaryPhotoUrl]
          : []),
        ...parsedCandidate.photoUrls
      ])
    );
    let style =
      shouldFillStyle
        ? inferHouseStyleFromText(
            `${metadata.pageText} ${parsedCandidate.listingRemarks}`
          )
        : null;

    if (shouldFillStyle && !style) {
      const photoInference = await inferHouseStyleFromPhotos(
        availablePhotoUrls,
        fetcher
      );
      style = photoInference.style;

      if (photoInference.warning) {
        warnings.push(photoInference.warning);
      }
    }

    const updates = {
      askingPrice: shouldFillPrice ? metadata.askingPrice : null,
      primaryPhotoUrl: shouldFillPhoto ? (metadata.photoUrls[0] ?? "") : "",
      photoUrls: shouldFillPhoto ? metadata.photoUrls : [],
      ...getStyleUpdate(style)
    };

    if (shouldFillPrice && updates.askingPrice === null) {
      warnings.push("Listing page did not expose an asking price.");
    }

    if (shouldFillPhoto && !updates.primaryPhotoUrl) {
      warnings.push("Listing page did not expose a property photo.");
    }

    if (shouldFillStyle && !style) {
      warnings.push("Listing page did not expose a house style.");
    }

    return listingCandidateEnrichmentResponseSchema.parse({
      candidateId: parsedCandidate.id,
      listingUrl,
      fetchedAt,
      updates,
      warnings
    });
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Listing page fetch failed: ${error.message}`
        : "Listing page fetch failed."
    );

    return listingCandidateEnrichmentResponseSchema.parse({
      candidateId: parsedCandidate.id,
      listingUrl,
      fetchedAt,
      updates: emptyUpdates(),
      warnings
    });
  } finally {
    clearTimeout(timeout);
  }
}
