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
};

type FeaturePattern = {
  factKey: string;
  label: string;
  pattern: RegExp;
  confidence: number;
};

const urlPattern = /https?:\/\/[^\s<>"')]+/gi;

const streetSuffixPattern =
  /\b(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|circle|cir|way|trail|trl|terrace|ter|place|pl|pike|highway|hwy|turnpike|tpke|boulevard|blvd|route|rt)\b\.?/i;

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
    .replace(/[ \t]+/g, " ")
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

function isLikelySystemUrl(value: string) {
  return /unsubscribe|preferences|privacy|terms|help|email-settings|utm_medium=email-footer/i.test(
    value
  );
}

function extractUrls(text: string) {
  const matches = Array.from(text.matchAll(urlPattern), (match) =>
    cleanUrl(match[0])
  );

  return Array.from(new Set(matches)).filter((url) => !isLikelySystemUrl(url));
}

function splitCandidateBlocks(text: string) {
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

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
      /(?:price|list price|asking price)\s*[:\-]?\s*\$?\s*([\d,]{5,})/i,
      /\$\s*([\d,]{5,})(?!\s*(?:\/mo|per month|monthly))/i
    ])
  );
}

function extractBedrooms(text: string) {
  return parseNumber(
    matchFirst(text, [
      /(\d+(?:\.\d+)?)\s*(?:beds?|bd|bedrooms?)\b/i,
      /(?:beds?|bedrooms?)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
    ])
  );
}

function extractBathrooms(text: string) {
  return parseNumber(
    matchFirst(text, [
      /(\d+(?:\.\d+)?)\s*(?:baths?|ba|bathrooms?)\b/i,
      /(?:baths?|bathrooms?)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i
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
  const oneLineMatch = text.match(
    /(\d{1,6}\s+[^,\n]+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/i
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
    (line) => /^\d{1,6}\s+/.test(line) && streetSuffixPattern.test(line)
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
  options: ParseOptions
): ListingCandidateExtract | null {
  const normalizedBlock = normalizeText(block);

  if (!normalizedBlock) {
    return null;
  }

  const urls = extractUrls(normalizedBlock);
  const listingUrl = urls[0] ?? "";
  const address = extractAddress(normalizedBlock);
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

  if (
    !candidate.listingUrl &&
    !candidate.addressLine1 &&
    !candidate.askingPrice
  ) {
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

  for (const block of splitCandidateBlocks(normalizedInput)) {
    const candidate = parseCandidateBlock(block, options);

    if (!candidate) {
      continue;
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
