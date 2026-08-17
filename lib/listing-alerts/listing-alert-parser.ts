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

type ExtractedPhotoCandidate = {
  url: string;
  context: string;
  supplementalText: string;
  supplementalPrice: number | null;
  contextPriority: number;
  key: string;
  score: number;
  order: number;
};

export const NO_EMAIL_HTML_PHOTO_WARNING =
  "No email HTML available for photo extraction.";
export const NO_PROPERTY_PHOTO_IN_HTML_WARNING =
  "No property photo URL found in alert HTML.";
export const NO_MATCHING_PROPERTY_PHOTO_WARNING =
  "No matching property photo found for this candidate.";

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
    .replace(/(?:&#36;|&dollar;)/gi, "$")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function decodeEscapedHtmlValue(value: string) {
  return decodeHtmlValue(value)
    .replace(/\\u003a/gi, ":")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003f/gi, "?")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/");
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
  const escapedAttributeName = attributeName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const quotedMatch = tag.match(
    new RegExp(`\\b${escapedAttributeName}\\s*=\\s*(["'])(.*?)\\1`, "i")
  );

  if (quotedMatch?.[2]) {
    return decodeHtmlValue(quotedMatch[2]);
  }

  const unquotedMatch = tag.match(
    new RegExp(`\\b${escapedAttributeName}\\s*=\\s*([^\\s>]+)`, "i")
  );

  return unquotedMatch?.[1] ? decodeHtmlValue(unquotedMatch[1]) : "";
}

function getHtmlSearchVariants(html: string) {
  return Array.from(
    new Set([html, decodeHtmlValue(html), decodeEscapedHtmlValue(html)])
  ).filter((variant) => variant.trim());
}

function getNearbyImageContainerContext(html: string, index: number, tag: string) {
  const before = html.slice(0, index);
  const openMatches = Array.from(
    before.matchAll(/<(article|tr|td|div|a)\b[^>]*>/gi)
  ).reverse();
  let fallbackContext = "";
  const addressLikePattern = new RegExp(
    `${streetNumberPatternSource}\\s+[^<]{1,80}\\b${streetSuffixPatternSource}\\b`,
    "i"
  );

  for (const openMatch of openMatches) {
    if (!openMatch?.[0] || openMatch.index === undefined) {
      continue;
    }

    const tagName = openMatch[1];
    const closePattern = new RegExp(`</${tagName}>`, "i");
    const after = html.slice(index + tag.length);
    const closeMatch = after.match(closePattern);

    if (!closeMatch?.[0] || closeMatch.index === undefined) {
      continue;
    }

    const end = index + tag.length + closeMatch.index + closeMatch[0].length;
    const context = html.slice(openMatch.index, end);

    if (context.length > 3000) {
      continue;
    }

    fallbackContext ||= context;

    if (addressLikePattern.test(context)) {
      return context;
    }
  }

  return fallbackContext || tag;
}

function getNearbyHtmlContext(html: string, index: number, length: number) {
  return html.slice(
    Math.max(0, index - 2500),
    Math.min(html.length, index + length + 2500)
  );
}

function getImageCandidatesFromHtml(html: string) {
  const candidates: Array<{
    url: string;
    context: string;
    supplementalText: string;
    supplementalPrice: number | null;
    contextPriority: number;
  }> = [];

  for (const htmlVariant of getHtmlSearchVariants(html)) {
    for (const match of htmlVariant.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      const semanticLabels = [
        getHtmlAttribute(tag, "alt"),
        getHtmlAttribute(tag, "title"),
        getHtmlAttribute(tag, "aria-label")
      ].filter(Boolean);
      const context =
        semanticLabels.length > 0
          ? [tag, ...semanticLabels].join(" ")
          : getNearbyImageContainerContext(htmlVariant, match.index ?? 0, tag);
      const supplementalText = [
        getNearbyImageContainerContext(htmlVariant, match.index ?? 0, tag),
        getNearbyHtmlContext(htmlVariant, match.index ?? 0, tag.length)
      ].join(" ");
      const supplementalPrice = extractPrice(
        getNearbyImageContainerContext(htmlVariant, match.index ?? 0, tag)
      );

      for (const attributeName of [
        "src",
        "data-src",
        "data-original",
        "data-lazy-src",
        "data-image",
        "data-img-url"
      ]) {
        const value = getHtmlAttribute(tag, attributeName);

        if (value) {
          candidates.push({
            url: value,
            context,
            supplementalText,
            supplementalPrice,
            contextPriority: 3
          });
        }
      }

      for (const srcsetAttributeName of ["srcset", "data-srcset"]) {
        const srcset = getHtmlAttribute(tag, srcsetAttributeName);

        if (!srcset) {
          continue;
        }

        for (const entry of srcset.split(",")) {
          const url = entry.trim().split(/\s+/)[0];

          if (url) {
            candidates.push({
              url,
              context,
              supplementalText,
              supplementalPrice,
              contextPriority: 3
            });
          }
        }
      }
    }

    for (const match of htmlVariant.matchAll(
      /url\((["']?)(https?:\/\/[^)"']+)\1\)/gi
    )) {
      const index = match.index ?? 0;
      const context = htmlVariant.slice(
        Math.max(0, index - 500),
        Math.min(htmlVariant.length, index + match[0].length + 500)
      );

      candidates.push({
        url: decodeHtmlValue(match[2]),
        context,
        supplementalText: context,
        supplementalPrice: extractPrice(context),
        contextPriority: 2
      });
    }

    for (const match of htmlVariant.matchAll(htmlUrlPattern)) {
      const index = match.index ?? 0;
      const context = htmlVariant.slice(
        Math.max(0, index - 500),
        Math.min(htmlVariant.length, index + match[0].length + 500)
      );

      candidates.push({
        url: decodeHtmlValue(match[0]),
        context,
        supplementalText: context,
        supplementalPrice: extractPrice(context),
        contextPriority: 1
      });
    }
  }

  return candidates;
}

function normalizeImageUrl(value: string) {
  const decodedValue = decodeEscapedHtmlValue(value);

  try {
    const url = new URL(cleanUrl(decodedValue));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isLikelyPropertyPhotoUrl(url: string, context: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const isImagePath = /\.(?:jpe?g|png|webp)$/.test(pathname);

    if (
      hostname.endsWith("zillowstatic.com") &&
      pathname.startsWith("/fp/") &&
      isImagePath &&
      !/-l_c\./.test(pathname)
    ) {
      return true;
    }

    if (hostname.endsWith("rdcpix.com") && isImagePath) {
      return true;
    }
  } catch {
    return false;
  }

  const normalizedContext = `${url} ${context}`.toLowerCase();

  if (
    /logo|icon|sprite|tracking|pixel|spacer|yard.?sign|home loans|mls logo|emailtrackingservice|\.woff2?\b/.test(
      normalizedContext
    )
  ) {
    return false;
  }

  return false;
}

function getPhotoDedupeKey(url: string) {
  try {
    const parsedUrl = new URL(url);
    const zillowPhotoMatch = parsedUrl.pathname.match(/\/fp\/([a-z0-9]+)-/i);
    const realtorPhotoMatch = parsedUrl.pathname.match(
      /^\/([a-z0-9]+l-m\d+)/i
    );

    if (zillowPhotoMatch?.[1]) {
      return `${parsedUrl.hostname.toLowerCase()}:${zillowPhotoMatch[1]}`;
    }

    if (parsedUrl.hostname.toLowerCase().endsWith("rdcpix.com")) {
      return `${parsedUrl.hostname.toLowerCase()}:${
        realtorPhotoMatch?.[1] ?? parsedUrl.pathname.toLowerCase()
      }`;
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

function extractPhotoCandidatesFromHtml(html: string) {
  if (!html.trim()) {
    return [];
  }

  const photosByKey = new Map<string, ExtractedPhotoCandidate>();
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
      photosByKey.set(key, {
        url,
        context: candidate.context,
        supplementalText: candidate.supplementalText,
        supplementalPrice: candidate.supplementalPrice,
        contextPriority: candidate.contextPriority,
        key,
        score,
        order
      });
      order += 1;
      continue;
    }

    if (score > existing.score) {
      photosByKey.set(key, { ...existing, url, score });
    }

    const current = photosByKey.get(key) ?? existing;

    if (candidate.contextPriority > current.contextPriority) {
      photosByKey.set(key, {
        ...current,
        context: candidate.context,
        supplementalText: `${current.supplementalText} ${candidate.supplementalText}`,
        supplementalPrice:
          current.supplementalPrice ?? candidate.supplementalPrice,
        contextPriority: candidate.contextPriority
      });
    } else if (candidate.contextPriority === current.contextPriority) {
      photosByKey.set(key, {
        ...current,
        context: `${current.context} ${candidate.context}`,
        supplementalText: `${current.supplementalText} ${candidate.supplementalText}`,
        supplementalPrice:
          current.supplementalPrice ?? candidate.supplementalPrice
      });
    }
  }

  return Array.from(photosByKey.values())
    .sort((a, b) => a.order - b.order);
}

function normalizeComparableText(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scorePhotoBlockMatch(
  block: string,
  address: ReturnType<typeof extractAddress>,
  photo: ExtractedPhotoCandidate
) {
  const normalizedBlock = normalizeComparableText(block);
  const normalizedContext = normalizeComparableText(photo.context);
  const addressLine = normalizeComparableText(address.addressLine1);
  const fullAddress = normalizeComparableText(
    [address.addressLine1, address.city, address.state, address.postalCode]
      .filter(Boolean)
      .join(" ")
  );
  const cityState = normalizeComparableText(
    [address.city, address.state].filter(Boolean).join(" ")
  );
  let score = 0;

  if (fullAddress && normalizedContext.includes(fullAddress)) {
    score += 100;
  }

  if (addressLine && normalizedContext.includes(addressLine)) {
    score += 70;
  }

  if (
    addressLine &&
    normalizedBlock.includes(addressLine) &&
    normalizedContext.includes(addressLine)
  ) {
    score += 30;
  }

  if (cityState && normalizedContext.includes(cityState)) {
    score += 15;
  }

  if (address.postalCode && normalizedContext.includes(address.postalCode)) {
    score += 10;
  }

  return score;
}

function selectPhotosForBlock(
  block: string,
  photoCandidates: ExtractedPhotoCandidate[],
  usedPhotoKeys: Set<string>
) {
  const normalizedBlock = normalizeText(block);
  const address = extractAddress(normalizedBlock);
  const scoredMatches = photoCandidates
    .filter((photo) => !usedPhotoKeys.has(photo.key))
    .map((photo) => ({
      photo,
      score: scorePhotoBlockMatch(normalizedBlock, address, photo)
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.photo.order - b.photo.order);

  return scoredMatches.length > 0
    ? [scoredMatches[0].photo]
    : photoCandidates
        .filter((photo) => !usedPhotoKeys.has(photo.key))
        .slice(0, 1);
}

function getMissingPhotoWarning(
  bodyHtml: string | undefined,
  photoCandidates: ExtractedPhotoCandidate[]
) {
  if (typeof bodyHtml !== "string") {
    return "";
  }

  if (!bodyHtml.trim()) {
    return NO_EMAIL_HTML_PHOTO_WARNING;
  }

  if (photoCandidates.length === 0) {
    return NO_PROPERTY_PHOTO_IN_HTML_WARNING;
  }

  return NO_MATCHING_PROPERTY_PHOTO_WARNING;
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
  const explicitPrice = parseInteger(
    matchFirst(text, [
      /^\s*\$\s*([\d,]{5,})(?:\s*(?:\||$))/m,
      /(?:for sale at|listed for|list price|asking price|price dropped to|price reduced to|reduced to|dropped to)\s*[:\-]?\s*\$?\s*([\d,]{5,})/i
    ])
  );

  if (explicitPrice !== null) {
    return explicitPrice;
  }

  const genericMatch = text.match(
    /\$\s*([\d,]{5,})(?!\s*(?:\/mo|per month|monthly))/i
  );

  if (!genericMatch?.[1]) {
    return null;
  }

  const prefix = text.slice(0, genericMatch.index).slice(-40);

  if (
    /\b(?:decreased|dropped|reduced|cut|lowered|changed|went down)\s+by\s*$/i.test(
      prefix
    )
  ) {
    return null;
  }

  return parseInteger(genericMatch[1]);
}

function extractSupplementalPrice(
  text: string,
  address: ReturnType<typeof extractAddress>
) {
  const addressLine = address.addressLine1.trim();

  if (!addressLine) {
    return extractPrice(text);
  }

  const normalizedAddressLine = addressLine.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const addressMatches = Array.from(
    text.matchAll(new RegExp(normalizedAddressLine, "gi"))
  );

  for (const match of addressMatches) {
    const index = match.index ?? 0;
    const afterAddressText = text.slice(
      index,
      Math.min(text.length, index + 1200)
    );
    const price = extractPrice(afterAddressText);

    if (price !== null) {
      return price;
    }

    const beforeAddressText = text.slice(Math.max(0, index - 300), index);
    const previousPrice = extractPrice(beforeAddressText);

    if (previousPrice !== null) {
      return previousPrice;
    }
  }

  return extractPrice(text);
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
      /\bListing\s*(?:#|ID|Number|No\.?)\s*[:#]?\s*([A-Z0-9-]{4,})\b/i,
      /\bListing\s*[:#]\s*([A-Z0-9-]{4,})\b/i
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
  photoUrls: string[] = [],
  supplementalText = "",
  supplementalPrices: number[] = []
): ListingCandidateExtract | null {
  const normalizedBlock = normalizeText(block);

  if (!normalizedBlock) {
    return null;
  }

  const normalizedSupplementalText = normalizeText(supplementalText);
  const urls = extractUrls(normalizedBlock);
  const listingUrl = urls[0] ?? "";
  const address = extractAddress(normalizedBlock);
  const normalizedPhotoUrls = Array.from(new Set(photoUrls.filter(Boolean)));
  const askingPrice =
    extractPrice(normalizedBlock) ??
    supplementalPrices.find((price) => Number.isFinite(price)) ??
    extractSupplementalPrice(normalizedSupplementalText, address);
  const candidateWithoutConfidence = {
    listingUrl,
    mlsId: extractMlsId(normalizedBlock),
    addressLine1: address.addressLine1,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    askingPrice,
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
    candidate.mlsId ||
    (candidate.listingUrl &&
      candidate.askingPrice !== null &&
      [
        candidate.bedrooms,
        candidate.bathrooms,
        candidate.livingSqft,
        candidate.lotAcres,
        candidate.yearBuilt,
        candidate.facts.length > 0 ? 1 : null
      ].some((value) => value !== null))
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
  if (candidate.mlsId) {
    return `mls:${candidate.mlsId.toLowerCase()}`;
  }

  if (candidate.addressLine1) {
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

  if (candidate.listingUrl) {
    return `url:${candidate.listingUrl.toLowerCase()}`;
  }

  return ["unknown", candidate.city, candidate.state]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-");
}

function mergeCandidateWarnings(candidate: ListingCandidateExtract) {
  return Array.from(new Set(candidate.warnings)).filter((warning) => {
    if (
      candidate.primaryPhotoUrl &&
      [
        NO_EMAIL_HTML_PHOTO_WARNING,
        NO_PROPERTY_PHOTO_IN_HTML_WARNING,
        NO_MATCHING_PROPERTY_PHOTO_WARNING
      ].includes(warning)
    ) {
      return false;
    }

    if (
      candidate.listingUrl &&
      warning === "No listing URL found."
    ) {
      return false;
    }

    if (
      (candidate.addressLine1 || candidate.city) &&
      warning === "No address or town found."
    ) {
      return false;
    }

    if (
      candidate.askingPrice !== null &&
      warning === "No asking price found."
    ) {
      return false;
    }

    return true;
  });
}

function mergeListingCandidateExtracts(
  existing: ListingCandidateExtract,
  candidate: ListingCandidateExtract
) {
  const primaryPhotoUrl = candidate.primaryPhotoUrl || existing.primaryPhotoUrl;
  const photoUrls = Array.from(
    new Set([
      ...(primaryPhotoUrl ? [primaryPhotoUrl] : []),
      ...candidate.photoUrls,
      ...existing.photoUrls
    ])
  );
  const merged = {
    ...existing,
    ...candidate,
    listingUrl: candidate.listingUrl || existing.listingUrl,
    mlsId: candidate.mlsId || existing.mlsId,
    addressLine1: candidate.addressLine1 || existing.addressLine1,
    city: candidate.city || existing.city,
    state: candidate.state || existing.state,
    postalCode: candidate.postalCode || existing.postalCode,
    askingPrice: candidate.askingPrice ?? existing.askingPrice,
    bedrooms: candidate.bedrooms ?? existing.bedrooms,
    bathrooms: candidate.bathrooms ?? existing.bathrooms,
    livingSqft: candidate.livingSqft ?? existing.livingSqft,
    lotAcres: candidate.lotAcres ?? existing.lotAcres,
    yearBuilt: candidate.yearBuilt ?? existing.yearBuilt,
    primaryPhotoUrl,
    photoUrls,
    facts: Array.from(
      new Map(
        [...existing.facts, ...candidate.facts].map((fact) => [
          fact.factKey,
          fact
        ])
      ).values()
    ),
    confidence: Math.max(existing.confidence, candidate.confidence),
    warnings: [] as string[]
  };

  merged.warnings = mergeCandidateWarnings({
    ...merged,
    warnings: [...existing.warnings, ...candidate.warnings]
  });

  return listingCandidateExtractSchema.parse(merged);
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
  const photoCandidates = extractPhotoCandidatesFromHtml(options.bodyHtml ?? "");
  const usedPhotoKeys = new Set<string>();

  for (const block of splitCandidateBlocks(normalizedInput)) {
    const candidatePhotos = selectPhotosForBlock(
      block,
      photoCandidates,
      usedPhotoKeys
    );
    const candidatePhotoUrls = candidatePhotos.map((photo) => photo.url);
    const candidate = parseCandidateBlock(
      block,
      options,
      candidatePhotoUrls,
      candidatePhotos.map((photo) => photo.supplementalText).join("\n"),
      candidatePhotos.flatMap((photo) =>
        photo.supplementalPrice === null ? [] : [photo.supplementalPrice]
      )
    );

    if (!candidate) {
      continue;
    }

    for (const photo of candidatePhotos) {
      usedPhotoKeys.add(photo.key);
    }

    if (!candidate.primaryPhotoUrl) {
      const missingPhotoWarning = getMissingPhotoWarning(
        options.bodyHtml,
        photoCandidates
      );

      if (
        missingPhotoWarning &&
        !candidate.warnings.includes(missingPhotoWarning)
      ) {
        candidate.warnings.push(missingPhotoWarning);
      }
    }

    const key = normalizeListingCandidateKey(candidate);
    const existing = candidatesByKey.get(key);

    candidatesByKey.set(
      key,
      existing ? mergeListingCandidateExtracts(existing, candidate) : candidate
    );
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
