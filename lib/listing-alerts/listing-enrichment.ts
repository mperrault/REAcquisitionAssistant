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
  photoUrls: z.array(z.string())
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
    photoUrls: z.array(z.string())
  }),
  warnings: z.array(z.string())
});

export type ListingCandidateEnrichmentResponse = z.infer<
  typeof listingCandidateEnrichmentResponseSchema
>;

type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "text">>;

type Metadata = {
  askingPrice: number | null;
  photoUrls: string[];
  pageText: string;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
        updates: {
          askingPrice: null,
          primaryPhotoUrl: "",
          photoUrls: []
        },
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
        updates: {
          askingPrice: null,
          primaryPhotoUrl: "",
          photoUrls: []
        },
        warnings
      });
    }

    const shouldFillPrice = parsedCandidate.askingPrice === null;
    const shouldFillPhoto = !parsedCandidate.primaryPhotoUrl;
    const updates = {
      askingPrice: shouldFillPrice ? metadata.askingPrice : null,
      primaryPhotoUrl: shouldFillPhoto ? (metadata.photoUrls[0] ?? "") : "",
      photoUrls: shouldFillPhoto ? metadata.photoUrls : []
    };

    if (shouldFillPrice && updates.askingPrice === null) {
      warnings.push("Listing page did not expose an asking price.");
    }

    if (shouldFillPhoto && !updates.primaryPhotoUrl) {
      warnings.push("Listing page did not expose a property photo.");
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
      updates: {
        askingPrice: null,
        primaryPhotoUrl: "",
        photoUrls: []
      },
      warnings
    });
  } finally {
    clearTimeout(timeout);
  }
}
