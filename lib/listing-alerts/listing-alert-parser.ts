import {
  createPropertyFact,
  createPropertyRecord
} from "@/lib/properties/property-persistence";
import type { PropertyFact, PropertyRecord } from "@/lib/properties/types";
import {
  type ListingCandidateExtract,
  listingCandidateExtractSchema
} from "@/lib/listing-alerts/types";

type ParseOptions = {
  timestamp?: string;
  createId?: () => string;
  bodyHtml?: string;
};

type FeaturePattern = {
  factKey: string;
  label: string;
  pattern: RegExp;
  confidence: number;
};

const urlPattern = /https?:\/\/[^\s<>"')]+/gi;
const htmlUrlPattern = /https?:\/\/[^\s"'<>\\)]+/gi;
const streetNumberPatternSource = String.raw`\d{1,6}(?:-\d{1,6})?`;
const streetSuffixPatternSource = String.raw`(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|circle|cir|way|trail|trl|terrace|ter|place|pl|pike|highway|hwy|turnpike|tpke|boulevard|blvd|route|rt)`;
const addressStartPattern = new RegExp(
  `^${streetNumberPatternSource}\\s+`,
  "i"
);

const streetSuffixPattern = new RegExp(
  `\\b${streetSuffixPatternSource}\\b\\.?`,
  "i"
);

const fullAddressPattern = new RegExp(
  `(${streetNumberPatternSource}\\s+[^,\\n]+?\\b${streetSuffixPatternSource}\\.?),?\\s+([A-Za-z][A-Za-z .'-]*?),\\s*([A-Z]{2})\\s*(\\d{5}(?:-\\d{4})?)?`,
  "i"
);

const zillowCardAddressLinePattern = new RegExp(
  `^${streetNumberPatternSource}\\s+.+?\\b${streetSuffixPatternSource}\\.?\\s*,\\s*[A-Za-z][A-Za-z .'-]*,\\s*[A-Z]{2}\\b`,
  "i"
);

const featurePatterns: FeaturePattern[] = [
  {
    factKey: "setting.country_mountain_view",
    label: "Country / Mountain View",
    pattern: /\b(?:country|mountain|hilltop|ridgeline|scenic)\s+views?\b/i,
    confidence: 0.72
  },
  {
    factKey: "setting.open_fields_pastoral",
    label: "Open Fields / Pastoral",
    pattern: /\b(?:open fields?|pastoral|meadow|hayfield|rolling fields?)\b/i,
    confidence: 0.72
  },
  {
    factKey: "setting.horse_property",
    label: "Horse Property",
    pattern: /\b(?:horse property|equestrian|barn|stable|paddock|pasture)\b/i,
    confidence: 0.68
  },
  {
    factKey: "setting.small_farm",
    label: "Small Farm",
    pattern: /\b(?:small farm|farmhouse|mini farm|gentleman'?s farm)\b/i,
    confidence: 0.64
  },
  {
    factKey: "setting.river_frontage",
    label: "River Frontage",
    pattern: /\b(?:river frontage|riverfront|on the river)\b/i,
    confidence: 0.74
  },
  {
    factKey: "setting.lake_view",
    label: "Lake View",
    pattern: /\b(?:lake view|views? of the lake)\b/i,
    confidence: 0.72
  },
  {
    factKey: "setting.pond_view",
    label: "Pond View",
    pattern: /\b(?:pond view|views? of the pond)\b/i,
    confidence: 0.72
  },
  {
    factKey: "setting.woods_privacy",
    label: "Woods / Privacy",
    pattern: /\b(?:wooded|private setting|privacy|secluded|set back)\b/i,
    confidence: 0.62
  },
  {
    factKey: "risk.busy_road",
    label: "Busy road",
    pattern: /\b(?:busy road|main road|highway|state route|heavy traffic)\b/i,
    confidence: 0.65
  },
  {
    factKey: "risk.flood_zone",
    label: "Flood zone",
    pattern: /\b(?:flood zone|floodplain|fema)\b/i,
    confidence: 0.7
  },
  {
    factKey: "risk.steep_driveway",
    label: "Steep driveway",
    pattern: /\b(?:steep driveway|sharp driveway|difficult driveway)\b/i,
    confidence: 0.68
  },
  {
    factKey: "risk.high_voltage_power_lines",
    label: "High-voltage power lines nearby",
    pattern: /\b(?:high[- ]voltage|power lines?|transmission lines?)\b/i,
    confidence: 0.68
  },
  {
    factKey: "risk.visible_cell_tower",
    label: "Visible cell tower",
    pattern: /\b(?:cell tower|communications tower)\b/i,
    confidence: 0.68
  },
  {
    factKey: "risk.railroad_nearby",
    label: "Railroad nearby",
    pattern: /\b(?:railroad|train tracks?|rail line)\b/i,
    confidence: 0.66
  },
  {
    factKey: "risk.wetlands",
    label: "Wetlands",
    pattern: /\b(?:wetlands?|marsh|swamp)\b/i,
    confidence: 0.64
  },
  {
    factKey: "utility.well",
    label: "Well",
    pattern: /\bwell water\b|\bprivate well\b/i,
    confidence: 0.67
  },
  {
    factKey: "utility.septic",
    label: "Septic",
    pattern: /\bseptic\b/i,
    confidence: 0.67
  },
  {
    factKey: "utility.oil_heat",
    label: "Oil heat",
    pattern: /\boil heat\b|\boil-fired\b/i,
    confidence: 0.67
  },
  {
    factKey: "utility.propane",
    label: "Propane",
    pattern: /\bpropane\b/i,
    confidence: 0.67
  },
  {
    factKey: "maintenance.no_garage",
    label: "No garage",
    pattern: /\bno garage\b/i,
    confidence: 0.66
  }
];

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function decodeHtmlValue(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function defaultCreateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `listing-alert-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanUrl(value: string) {
  return value.replace(/[),.;]+$/g, "");
}

function normalizeUrl(value: string) {
  const cleanedUrl = cleanUrl(value);

  try {
    const parsedUrl = new URL(cleanedUrl);
    const redirectTarget = parsedUrl.searchParams.get("target");

    if (redirectTarget && /\.?mail\.zillow\.com$/i.test(parsedUrl.hostname)) {
      return normalizeUrl(redirectTarget);
    }

    if (/\.?zillow\.com$/i.test(parsedUrl.hostname)) {
      const zpidMatch = parsedUrl.pathname.match(
        /\/zpid_target\/([^/]+_zpid)\b/i
      );

      if (zpidMatch?.[1]) {
        return `https://${parsedUrl.hostname}/routing/email/property-notifications/zpid_target/${zpidMatch[1]}/`;
      }

      parsedUrl.hash = "";

      for (const key of Array.from(parsedUrl.searchParams.keys())) {
        if (/^utm_/i.test(key) || key.toLowerCase() === "rtoken") {
          parsedUrl.searchParams.delete(key);
        }
      }

      return parsedUrl.toString();
    }
  } catch {
    return cleanedUrl;
  }

  return cleanedUrl;
}

function isLikelySystemUrl(value: string) {
  return /unsubscribe|preferences|privacy|terms|help|email-settings|utm_medium=email-footer|homeloans|email\/feedback|myzillow\/notifications|SwitchEmailFrequency|\/homes\/for_sale\/|searchQueryState/i.test(
    value
  );
}

function extractUrls(text: string) {
  const matches = Array.from(text.matchAll(urlPattern), (match) =>
    normalizeUrl(match[0])
  );

  return Array.from(new Set(matches)).filter((url) => !isLikelySystemUrl(url));
}

function getHtmlAttribute(tag: string, attributeName: string) {
  const match = tag.match(
    new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']*)["']`, "i")
  );

  return match?.[1] ? decodeHtmlValue(match[1]) : "";
}

function getImageCandidatesFromHtml(html: string) {
  const candidates: Array<{ url: string; context: string }> = [];

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const context = [
      tag,
      getHtmlAttribute(tag, "alt"),
      getHtmlAttribute(tag, "title"),
      getHtmlAttribute(tag, "aria-label")
    ].join(" ");

    for (const attributeName of ["src", "data-src", "data-original"]) {
      const value = getHtmlAttribute(tag, attributeName);

      if (value) {
        candidates.push({ url: value, context });
      }
    }

    const srcset = getHtmlAttribute(tag, "srcset");

    if (srcset) {
      for (const entry of srcset.split(",")) {
        const url = entry.trim().split(/\s+/)[0];

        if (url) {
          candidates.push({ url, context });
        }
      }
    }
  }

  for (const match of html.matchAll(/url\((["']?)(https?:\/\/[^)"']+)\1\)/gi)) {
    candidates.push({ url: decodeHtmlValue(match[2]), context: match[0] });
  }

  for (const match of html.matchAll(htmlUrlPattern)) {
    candidates.push({ url: decodeHtmlValue(match[0]), context: "" });
  }

  return candidates;
}

function normalizeImageUrl(value: string) {
  const decodedValue = decodeHtmlValue(value);

  try {
    const url = new URL(cleanUrl(decodedValue));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isLikelyPropertyPhotoUrl(url: string, context: string) {
  const normalizedContext = `${url} ${context}`.toLowerCase();

  if (
    /logo|icon|sprite|tracking|pixel|spacer|yard.?sign|home loans|mls logo|emailtrackingservice|\.woff2?\b/.test(
      normalizedContext
    )
  ) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (
      hostname === "photos.zillowstatic.com" &&
      pathname.startsWith("/fp/") &&
      /\.(?:jpe?g|png|webp)$/.test(pathname) &&
      !/-l_c\./.test(pathname)
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function getPhotoDedupeKey(url: string) {
  try {
    const parsedUrl = new URL(url);
    const zillowPhotoMatch = parsedUrl.pathname.match(/\/fp\/([a-z0-9]+)-/i);

    if (zillowPhotoMatch?.[1]) {
      return `${parsedUrl.hostname.toLowerCase()}:${zillowPhotoMatch[1]}`;
    }

    return `${parsedUrl.hostname.toLowerCase()}${parsedUrl.pathname}`;
  } catch {
    return url.toLowerCase();
  }
}

function scorePhotoUrl(url: string) {
  const sizeMatch = url.match(/_(\d{3,5})_(\d{3,5})\./);
  const width = sizeMatch?.[1] ? Number.parseInt(sizeMatch[1], 10) : 0;
  const height = sizeMatch?.[2] ? Number.parseInt(sizeMatch[2], 10) : 0;

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0) {
    return width * height;
  }

  if (/-p_e\./i.test(url)) {
    return 250_000;
  }

  return 1;
}

function extractPhotoUrlsFromHtml(html: string) {
  if (!html.trim()) {
    return [];
  }

  const photosByKey = new Map<
    string,
    { url: string; score: number; order: number }
  >();
  let order = 0;

  for (const candidate of getImageCandidatesFromHtml(html)) {
    const url = normalizeImageUrl(candidate.url);

    if (!url || !isLikelyPropertyPhotoUrl(url, candidate.context)) {
      continue;
    }

    const key = getPhotoDedupeKey(url);
    const score = scorePhotoUrl(url);
    const existing = photosByKey.get(key);

    if (!existing) {
      photosByKey.set(key, { url, score, order });
      order += 1;
      continue;
    }

    if (score > existing.score) {
      photosByKey.set(key, { ...existing, url, score });
    }
  }

  return Array.from(photosByKey.values())
    .sort((a, b) => a.order - b.order)
    .map((photo) => photo.url);
}

function getMeaningfulLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:[-=]){8,}$/.test(line));
}

function isLikelyZillowAlert(text: string) {
  return /\bzillow\b|zillow\.com|mail\.zillow\.com/i.test(text);
}

function isZillowListingCardStart(lines: string[], index: number) {
  if (
    !/^(?:for sale|coming soon|auction|new construction|price cut|house for sale)\b/i.test(
      lines[index] ?? ""
    )
  ) {
    return false;
  }

  const lookaheadLines = lines.slice(index, index + 8);
  const lookahead = lookaheadLines.join("\n");

  return (
    extractPrice(lookahead) !== null &&
    lookaheadLines.some((line) => zillowCardAddressLinePattern.test(line))
  );
}

function isZillowListingStopLine(line: string) {
  return /^(?:Zillow Home Loans|Zillow, Inc\.|Help improve|Share your feedback|Privacy policy|Unsubscribe|Update your preferences|Switch to daily|Get pre-qualified|Start now|An equal housing lender)\b/i.test(
    line
  );
}

function extractZillowListingBlocks(text: string) {
  if (!isLikelyZillowAlert(text)) {
    return [];
  }

  const lines = getMeaningfulLines(text);
  const cardStartIndexes = lines
    .map((_, index) => index)
    .filter((index) => isZillowListingCardStart(lines, index));

  if (!cardStartIndexes.length) {
    const subjectListingIndex = lines.findIndex((line) =>
      /^(?:New Listing|Price Cut):/i.test(line)
    );

    return subjectListingIndex >= 0
      ? [lines.slice(subjectListingIndex, subjectListingIndex + 12).join("\n")]
      : [];
  }

  const subjectLine =
    cardStartIndexes.length === 1
      ? lines.find((line) => /^(?:New Listing|Price Cut):/i.test(line))
      : undefined;

  return cardStartIndexes.map((startIndex, index) => {
    const nextStartIndex = cardStartIndexes[index + 1] ?? lines.length;
    let endIndex = nextStartIndex;

    for (
      let lineIndex = startIndex + 1;
      lineIndex < nextStartIndex;
      lineIndex += 1
    ) {
      if (isZillowListingStopLine(lines[lineIndex])) {
        endIndex = lineIndex;
        break;
      }
    }

    return [subjectLine, ...lines.slice(startIndex, endIndex)]
      .filter(Boolean)
      .join("\n");
  });
}

function splitCandidateBlocks(text: string) {
  const providerBlocks = extractZillowListingBlocks(text);

  if (providerBlocks.length > 0) {
    return providerBlocks;
  }

  const paragraphBlocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const candidateParagraphs = paragraphBlocks.filter(
    (block) =>
      extractUrls(block).length > 0 ||
      (extractPrice(block) !== null && /^\d{1,6}\s+/m.test(block))
  );

  if (candidateParagraphs.length > 1) {
    return candidateParagraphs;
  }

  const lines = getMeaningfulLines(text);
  const urlLineIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => extractUrls(line).length > 0)
    .map(({ index }) => index);

  if (urlLineIndexes.length <= 1) {
    return candidateParagraphs.length === 1 ? candidateParagraphs : [text];
  }

  return urlLineIndexes.map((urlLineIndex, index) => {
    const previousUrlLineIndex = urlLineIndexes[index - 1];
    const start = previousUrlLineIndex === undefined ? 0 : previousUrlLineIndex + 1;
    const end = urlLineIndex + 1;

    return lines.slice(start, end).join("\n");
  });
}

function parseInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/[$,]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRoomCount(value: string | undefined) {
  const parsed = parseNumber(value);

  if (parsed === null || parsed > 20) {
    return null;
  }

  return parsed;
}

function matchFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function extractPrice(text: string) {
  return parseInteger(
    matchFirst(text, [
      /^\s*\$\s*([\d,]{5,})(?:\s*(?:\||$))/m,
      /(?:for sale at|listed for|list price|asking price)\s*[:\-]?\s*\$?\s*([\d,]{5,})/i,
      /\$\s*([\d,]{5,})(?!\s*(?:\/mo|per month|monthly))/i
    ])
  );
}

function extractBedrooms(text: string) {
  return parseRoomCount(
    matchFirst(text, [
      /(\d+(?:\.\d+)?)(?!\s*\+)\s*(?:beds?|bd|bedrooms?)\b/i,
      /(?:beds?|bedrooms?)\s*[:\-]?\s*(\d+(?:\.\d+)?)(?!\s*\+)/i
    ])
  );
}

function extractBathrooms(text: string) {
  return parseRoomCount(
    matchFirst(text, [
      /(\d+(?:\.\d+)?)(?!\s*\+)\s*(?:baths?|ba|bathrooms?)\b/i,
      /(?:baths?|bathrooms?)\s*[:\-]?\s*(\d+(?:\.\d+)?)(?!\s*\+)/i
    ])
  );
}

function extractLivingSqft(text: string) {
  return parseInteger(
    matchFirst(text, [
      /([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square feet)\b/i,
      /(?:living area|area)\s*[:\-]?\s*([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft)?/i
    ])
  );
}

function extractLotAcres(text: string) {
  return parseNumber(
    matchFirst(text, [
      /(\d+(?:\.\d+)?)\s*(?:acres?|ac)\b/i,
      /(?:lot size|land|acreage)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
    ])
  );
}

function extractYearBuilt(text: string) {
  return parseInteger(
    matchFirst(text, [
      /(?:year built|built)\s*[:\-]?\s*((?:18|19|20)\d{2})/i,
      /built\s+in\s+((?:18|19|20)\d{2})/i
    ])
  );
}

function extractMlsId(text: string) {
  return (
    matchFirst(text, [
      /\bMLS(?:\s*(?:#|ID|Number|No\.?))?\s*[:#]?\s*([A-Z0-9-]{4,})\b/i,
      /\bListing(?:\s*(?:#|ID|Number|No\.?))?\s*[:#]?\s*([A-Z0-9-]{4,})\b/i
    ]) ?? ""
  );
}

function extractAddress(text: string) {
  const fullAddressMatch = text.match(fullAddressPattern);

  if (fullAddressMatch?.[1] && fullAddressMatch[2] && fullAddressMatch[3]) {
    return {
      addressLine1: fullAddressMatch[1].trim(),
      city: fullAddressMatch[2].trim(),
      state: fullAddressMatch[3].toUpperCase(),
      postalCode: fullAddressMatch[4] ?? ""
    };
  }

  const oneLineMatch = text.match(
    /(\d{1,6}(?:-\d{1,6})?\s+[^,\n]+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/i
  );

  if (oneLineMatch?.[1] && oneLineMatch[2] && oneLineMatch[3]) {
    return {
      addressLine1: oneLineMatch[1].trim(),
      city: oneLineMatch[2].trim(),
      state: oneLineMatch[3].toUpperCase(),
      postalCode: oneLineMatch[4] ?? ""
    };
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const addressLineIndex = lines.findIndex(
    (line) => addressStartPattern.test(line) && streetSuffixPattern.test(line)
  );

  if (addressLineIndex >= 0) {
    const addressLine1 = lines[addressLineIndex].replace(/,$/, "");
    const nextLine = lines[addressLineIndex + 1] ?? "";
    const cityStateMatch = nextLine.match(
      /^([A-Za-z .'-]+),?\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i
    );

    return {
      addressLine1,
      city: cityStateMatch?.[1]?.trim() ?? "",
      state: cityStateMatch?.[2]?.toUpperCase() ?? "",
      postalCode: cityStateMatch?.[3] ?? ""
    };
  }

  const cityStateMatch = text.match(
    /\b([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?\b/
  );

  return {
    addressLine1: "",
    city: cityStateMatch?.[1]?.trim() ?? "",
    state: cityStateMatch?.[2]?.toUpperCase() ?? "",
    postalCode: cityStateMatch?.[3] ?? ""
  };
}

function summarizeRemarks(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !extractUrls(line).length);

  return lines.join(" ").replace(/\s+/g, " ").slice(0, 900);
}

function extractFacts(text: string, sourceReference: string, options: ParseOptions) {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const createId = options.createId ?? defaultCreateId;
  const factsByKey = new Map<string, PropertyFact>();

  for (const feature of featurePatterns) {
    if (!feature.pattern.test(text)) {
      continue;
    }

    factsByKey.set(
      feature.factKey,
      createPropertyFact(
        {
          factKey: feature.factKey,
          label: feature.label,
          value: true,
          sourceType: "listing",
          sourceReference,
          confidence: feature.confidence,
          verified: false
        },
        timestamp,
        createId
      )
    );
  }

  return Array.from(factsByKey.values());
}

function estimateConfidence(candidate: Omit<ListingCandidateExtract, "confidence">) {
  const signals = [
    candidate.listingUrl,
    candidate.primaryPhotoUrl,
    candidate.addressLine1,
    candidate.city,
    candidate.askingPrice,
    candidate.bedrooms,
    candidate.bathrooms,
    candidate.livingSqft,
    candidate.lotAcres,
    candidate.yearBuilt,
    candidate.facts.length > 0
  ].filter(Boolean).length;

  return Math.min(0.95, Math.max(0.3, 0.25 + signals * 0.08));
}

function parseCandidateBlock(
  block: string,
  options: ParseOptions,
  photoUrls: string[] = []
): ListingCandidateExtract | null {
  const normalizedBlock = normalizeText(block);

  if (!normalizedBlock) {
    return null;
  }

  const urls = extractUrls(normalizedBlock);
  const listingUrl = urls[0] ?? "";
  const address = extractAddress(normalizedBlock);
  const normalizedPhotoUrls = Array.from(new Set(photoUrls.filter(Boolean)));
  const candidateWithoutConfidence = {
    listingUrl,
    mlsId: extractMlsId(normalizedBlock),
    addressLine1: address.addressLine1,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    askingPrice: extractPrice(normalizedBlock),
    bedrooms: extractBedrooms(normalizedBlock),
    bathrooms: extractBathrooms(normalizedBlock),
    livingSqft: extractLivingSqft(normalizedBlock),
    lotAcres: extractLotAcres(normalizedBlock),
    yearBuilt: extractYearBuilt(normalizedBlock),
    primaryPhotoUrl: normalizedPhotoUrls[0] ?? "",
    photoUrls: normalizedPhotoUrls,
    listingRemarks: summarizeRemarks(normalizedBlock),
    rawText: normalizedBlock,
    facts: extractFacts(normalizedBlock, listingUrl || "listing alert", options),
    warnings: [] as string[]
  };

  if (!candidateWithoutConfidence.listingUrl) {
    candidateWithoutConfidence.warnings.push("No listing URL found.");
  }

  if (
    !candidateWithoutConfidence.addressLine1 &&
    !candidateWithoutConfidence.city
  ) {
    candidateWithoutConfidence.warnings.push("No address or town found.");
  }

  if (candidateWithoutConfidence.askingPrice === null) {
    candidateWithoutConfidence.warnings.push("No asking price found.");
  }

  const candidate = {
    ...candidateWithoutConfidence,
    confidence: estimateConfidence(candidateWithoutConfidence)
  };

  const hasListingSignal = Boolean(
    candidate.addressLine1 ||
    candidate.city ||
    candidate.mlsId ||
    candidate.askingPrice !== null ||
    candidate.bedrooms !== null ||
    candidate.bathrooms !== null ||
    candidate.livingSqft !== null ||
    candidate.lotAcres !== null ||
    candidate.yearBuilt !== null ||
    candidate.facts.length > 0
  );

  if (!hasListingSignal) {
    return null;
  }

  return listingCandidateExtractSchema.parse(candidate);
}

export function normalizeListingCandidateKey(candidate: {
  listingUrl: string;
  mlsId: string;
  addressLine1: string;
  city: string;
  state: string;
}) {
  if (candidate.listingUrl) {
    return `url:${candidate.listingUrl.toLowerCase()}`;
  }

  if (candidate.mlsId) {
    return `mls:${candidate.mlsId.toLowerCase()}`;
  }

  return [
    "address",
    candidate.addressLine1,
    candidate.city,
    candidate.state
  ]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-");
}

export function parseListingAlertText(input: string, options: ParseOptions = {}) {
  const normalizedInput = normalizeText(input);

  if (!normalizedInput) {
    return {
      candidates: [] as ListingCandidateExtract[],
      warnings: ["Alert message body is empty."]
    };
  }

  const candidatesByKey = new Map<string, ListingCandidateExtract>();
  const photoUrls = extractPhotoUrlsFromHtml(options.bodyHtml ?? "");
  let photoIndex = 0;

  for (const block of splitCandidateBlocks(normalizedInput)) {
    const candidatePhotoUrls = photoUrls[photoIndex] ? [photoUrls[photoIndex]] : [];
    const candidate = parseCandidateBlock(block, options, candidatePhotoUrls);

    if (!candidate) {
      continue;
    }

    if (candidatePhotoUrls.length > 0) {
      photoIndex += 1;
    }

    candidatesByKey.set(normalizeListingCandidateKey(candidate), candidate);
  }

  const candidates = Array.from(candidatesByKey.values());

  return {
    candidates,
    warnings:
      candidates.length > 0
        ? []
        : ["No listing candidates were detected in the alert message."]
  };
}

export function createPropertyDraftFromListingCandidate(
  candidate: ListingCandidateExtract,
  timestamp = new Date().toISOString(),
  createId = defaultCreateId
): PropertyRecord {
  return createPropertyRecord(
    {
      addressLine1: candidate.addressLine1,
      city: candidate.city,
      state: candidate.state || "CT",
      postalCode: candidate.postalCode,
      listingUrl: candidate.listingUrl,
      mlsId: candidate.mlsId,
      primaryPhotoUrl: candidate.primaryPhotoUrl,
      photoUrls: candidate.photoUrls,
      askingPrice: candidate.askingPrice,
      listingStatus: "unknown",
      bedrooms: candidate.bedrooms,
      bathrooms: candidate.bathrooms,
      livingSqft: candidate.livingSqft,
      lotAcres: candidate.lotAcres,
      yearBuilt: candidate.yearBuilt,
      listingRemarks: candidate.listingRemarks || candidate.rawText,
      notes: "Imported from automated listing-alert ingestion.",
      facts: candidate.facts
    },
    timestamp,
    createId
  );
}
