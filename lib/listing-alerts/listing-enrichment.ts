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
  inferStyle: z.boolean().default(false),
  inferRenovation: z.boolean().default(false)
});

const renovationScopeFactSchema = z.object({
  factKey: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string()
});

const renovationLineItemSchema = z.object({
  factKey: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string()
});

const inferredFactSchema = z.object({
  factKey: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string()
});

const enrichmentDiagnosticSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  stage: z.string().min(1),
  status: z.enum(["started", "success", "warning", "skipped", "failed", "info"]),
  message: z.string().min(1),
  detail: z.string()
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
    styleSource: z.enum(["", "listing_text", "photo_inference"]),
    settingFacts: z.array(inferredFactSchema),
    renovationScopeFacts: z.array(renovationScopeFactSchema),
    renovationLineItems: z.array(renovationLineItemSchema),
    renovationExpectedCost: z.number().int().nonnegative().nullable(),
    renovationLowEstimate: z.number().int().nonnegative().nullable(),
    renovationHighEstimate: z.number().int().nonnegative().nullable()
  }),
  warnings: z.array(z.string()),
  diagnostics: z.array(enrichmentDiagnosticSchema).default([])
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

type RenovationInference = {
  scopeFacts: Array<z.infer<typeof renovationScopeFactSchema>>;
  lineItems: Array<z.infer<typeof renovationLineItemSchema>>;
  expectedCost: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
};

type SettingInference = Array<z.infer<typeof inferredFactSchema>>;

const noPreferredSettingMatchFactKey = "setting.no_preferred_match";

function isNoPreferredSettingMatchFact(fact: z.infer<typeof inferredFactSchema>) {
  return fact.factKey === noPreferredSettingMatchFactKey;
}

function getPreferredSettingFacts(settingFacts: SettingInference) {
  return settingFacts.filter((fact) => !isNoPreferredSettingMatchFact(fact));
}

function addSettingCoverageFact(
  settingFacts: SettingInference,
  hasSourceText: boolean
): SettingInference {
  if (settingFacts.length > 0 || !hasSourceText) {
    return settingFacts;
  }

  return [
    {
      factKey: noPreferredSettingMatchFactKey,
      label: "No Preferred Setting Match",
      confidence: 0.7,
      evidence:
        "Listing text was checked and no preferred setting/view phrases were matched."
    }
  ];
}

type EnrichmentDiagnostic = z.infer<typeof enrichmentDiagnosticSchema>;
type EnrichmentDiagnosticStatus = EnrichmentDiagnostic["status"];

export type ListingEnrichmentDiagnostic = EnrichmentDiagnostic;

type EnrichmentOptions = {
  onDiagnostic?: (diagnostic: EnrichmentDiagnostic) => void;
  signal?: AbortSignal;
};

function combineAbortSignals(
  signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const activeSignals = signals.filter(Boolean) as AbortSignal[];

  if (activeSignals.length === 0) {
    return undefined;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error("Enrichment canceled.");
  error.name = "AbortError";
  throw error;
}

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

const renovationScopeDefinitions = [
  { factKey: "renovation.paint", label: "Paint" },
  { factKey: "renovation.flooring", label: "Flooring" },
  { factKey: "renovation.kitchen", label: "Kitchen" },
  { factKey: "renovation.bathrooms", label: "Bathrooms" },
  { factKey: "renovation.lighting", label: "Lighting" },
  { factKey: "renovation.landscaping", label: "Landscaping" },
  { factKey: "renovation.windows", label: "Windows" },
  { factKey: "renovation.siding", label: "Siding" },
  { factKey: "renovation.deck_porch", label: "Deck / porch" },
  { factKey: "renovation.minor_layout", label: "Minor layout changes" },
  { factKey: "renovation.foundation_repair", label: "Foundation repair" },
  {
    factKey: "renovation.structural_rehabilitation",
    label: "Structural rehabilitation"
  },
  { factKey: "renovation.whole_house_gut", label: "Whole-house gut renovation" },
  { factKey: "renovation.major_addition", label: "Major addition" },
  {
    factKey: "renovation.extensive_systems_replacement",
    label: "Extensive electrical/plumbing replacement"
  }
] as const;

const settingDefinitions = [
  {
    factKey: "setting.country_mountain_view",
    label: "Country / Mountain View",
    confidence: 0.72,
    patterns: [/\bcountry setting\b/i, /\brural setting\b/i, /\bmountain views?\b/i]
  },
  {
    factKey: "setting.open_fields_pastoral",
    label: "Open Fields / Pastoral",
    confidence: 0.74,
    patterns: [/\bopen fields?\b/i, /\bpastoral\b/i, /\bpasture\b/i, /\bmeadow\b/i]
  },
  {
    factKey: "setting.horse_property",
    label: "Horse Property",
    confidence: 0.76,
    patterns: [/\bhorse property\b/i, /\bequestrian\b/i, /\bhorse barn\b/i]
  },
  {
    factKey: "setting.small_farm",
    label: "Small Farm",
    confidence: 0.72,
    patterns: [/\bsmall farm\b/i, /\bfarmette\b/i, /\bbarn\b/i]
  },
  {
    factKey: "setting.river_frontage",
    label: "River Frontage",
    confidence: 0.78,
    patterns: [/\briver frontage\b/i, /\briverfront\b/i]
  },
  {
    factKey: "setting.lake_view",
    label: "Lake View",
    confidence: 0.8,
    patterns: [/\blake views?\b/i, /\bviews? (?:of|to) [a-z\s]+ lake\b/i]
  },
  {
    factKey: "setting.pond_view",
    label: "Pond View",
    confidence: 0.78,
    patterns: [/\bpond views?\b/i, /\bviews? (?:of|to) [a-z\s]+ pond\b/i]
  },
  {
    factKey: "setting.lake_frontage",
    label: "Lake Frontage",
    confidence: 0.82,
    patterns: [/\blake frontage\b/i, /\blakefront\b/i, /\bwaterfront\b/i]
  },
  {
    factKey: "setting.pond_frontage",
    label: "Pond Frontage",
    confidence: 0.8,
    patterns: [/\bpond frontage\b/i, /\bpondfront\b/i]
  },
  {
    factKey: "setting.historic_new_england",
    label: "Historic New England Setting",
    confidence: 0.68,
    patterns: [/\bhistoric\b/i, /\bantique\b/i, /\bbuilt in 18\d{2}\b/i]
  },
  {
    factKey: "setting.woods_privacy",
    label: "Woods / Privacy",
    confidence: 0.7,
    patterns: [/\bwooded privacy\b/i, /\bwooded lot\b/i, /\bprivate wooded\b/i]
  }
] as const;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createDiagnosticRecorder(
  fetchedAt: string,
  onDiagnostic?: (diagnostic: EnrichmentDiagnostic) => void
) {
  const diagnostics: EnrichmentDiagnostic[] = [];

  return {
    diagnostics,
    add(
      stage: string,
      status: EnrichmentDiagnosticStatus,
      message: string,
      detail = ""
    ) {
      const diagnostic = {
        id: `${diagnostics.length + 1}`,
        at: fetchedAt,
        stage,
        status,
        message,
        detail
      };

      diagnostics.push(diagnostic);
      onDiagnostic?.(diagnostic);
    }
  };
}

function summarizeRenovation(renovation: RenovationInference | null) {
  if (!renovation) {
    return "No renovation inference returned.";
  }

  const scopes = renovation.scopeFacts.map((fact) => fact.label).join(", ");
  const lineItems = renovation.lineItems
    .map((item) => `${item.label} ${item.amount}`)
    .join(", ");

  return [
    scopes ? `Scopes: ${scopes}` : "Scopes: none",
    lineItems ? `Line items: ${lineItems}` : "Line items: none",
    renovation.expectedCost !== null
      ? `Expected cost: ${renovation.expectedCost}`
      : "Expected cost: none"
  ].join(" | ");
}

function summarizeSettingFacts(settingFacts: SettingInference) {
  const preferredSettingFacts = getPreferredSettingFacts(settingFacts);

  if (preferredSettingFacts.length === 0) {
    return "No setting/view facts returned.";
  }

  return preferredSettingFacts
    .map((fact) => `${fact.label}: ${fact.evidence}`)
    .join(" | ");
}

function recordSettingInferenceDiagnostic(
  addDiagnostic: ReturnType<typeof createDiagnosticRecorder>["add"],
  settingFacts: SettingInference,
  hasSourceText: boolean,
  sourceLabel: "Listing remarks" | "Listing page text"
) {
  const preferredSettingFacts = getPreferredSettingFacts(settingFacts);

  if (preferredSettingFacts.length > 0) {
    addDiagnostic(
      "setting text",
      "success",
      `${sourceLabel} matched setting/view facts.`,
      summarizeSettingFacts(preferredSettingFacts)
    );
    return;
  }

  addDiagnostic(
    "setting text",
    hasSourceText ? "info" : "skipped",
    hasSourceText
      ? "No preferred setting/view matched."
      : `${sourceLabel} did not identify setting/view facts.`,
    hasSourceText
      ? "No supported setting/view phrases were matched."
      : "No listing text was available."
  );
}

function getEligibleVisionImageUrls(photoUrls: string[]) {
  return Array.from(new Set(photoUrls.filter(isEligibleVisionImageUrl)));
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

function getRenovationUpdate(renovation: RenovationInference | null) {
  return {
    renovationScopeFacts: renovation?.scopeFacts ?? [],
    renovationLineItems: renovation?.lineItems ?? [],
    renovationExpectedCost: renovation?.expectedCost ?? null,
    renovationLowEstimate: renovation?.lowEstimate ?? null,
    renovationHighEstimate: renovation?.highEstimate ?? null
  };
}

function getSettingUpdate(settingFacts: SettingInference | null) {
  return {
    settingFacts: settingFacts ?? []
  };
}

function emptyUpdates() {
  return {
    askingPrice: null,
    primaryPhotoUrl: "",
    photoUrls: [],
    ...getStyleUpdate(null),
    ...getSettingUpdate(null),
    ...getRenovationUpdate(null)
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
  const snippetStart =
    start === 0
      ? start
      : Math.min(
          match.index,
          text.indexOf(" ", start) === -1 ? start : text.indexOf(" ", start) + 1
        );

  return normalizeText(text.slice(snippetStart, end));
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

function inferSettingFactsFromText(text: string): SettingInference {
  const normalized = normalizeText(text);
  const facts: SettingInference = [];

  if (!normalized) {
    return facts;
  }

  for (const definition of settingDefinitions) {
    for (const pattern of definition.patterns) {
      if (!pattern.test(normalized)) {
        continue;
      }

      facts.push({
        factKey: definition.factKey,
        label: definition.label,
        confidence: definition.confidence,
        evidence: getTextEvidence(normalized, pattern)
      });
      break;
    }
  }

  return facts;
}

function mergeSettingFacts(
  primary: SettingInference,
  fallback: SettingInference
): SettingInference {
  const facts = [...primary];

  for (const fact of fallback) {
    if (!facts.some((item) => item.factKey === fact.factKey)) {
      facts.push(fact);
    }
  }

  return facts;
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

function parseRenovationFactKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9]+/g, "_");

  return (
    renovationScopeDefinitions.find(
      (definition) => definition.factKey === raw
    ) ??
    renovationScopeDefinitions.find(
      (definition) =>
        definition.factKey.replace("renovation.", "") === normalized ||
        definition.label.toLowerCase().replace(/[^a-z0-9]+/g, "_") === normalized
    ) ??
    null
  );
}

function parseConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function parseCost(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function slugFromLabel(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "misc";
}

const renovationScopeTextPatterns = [
  {
    factKey: "renovation.kitchen",
    pattern: /\bkitchen|cabinet|countertop|backsplash\b/i
  },
  {
    factKey: "renovation.bathrooms",
    pattern: /\bbath(?:room)?|shower|tub|vanity|toilet\b/i
  },
  {
    factKey: "renovation.flooring",
    pattern: /\bfloor|flooring|carpet|hardwood|vinyl|tile\b/i
  },
  {
    factKey: "renovation.paint",
    pattern: /\bpaint|wallpaper|interior refresh\b/i
  },
  {
    factKey: "renovation.lighting",
    pattern: /\blight|lighting|fixture\b/i
  },
  {
    factKey: "renovation.landscaping",
    pattern: /\blandscap|yard|grounds?|brush|tree\b/i
  },
  {
    factKey: "renovation.windows",
    pattern: /\bwindow\b/i
  },
  {
    factKey: "renovation.siding",
    pattern: /\bsiding|exterior paint|clapboard\b/i
  },
  {
    factKey: "renovation.deck_porch",
    pattern: /\bdeck|porch|stairs?|railing\b/i
  },
  {
    factKey: "renovation.minor_layout",
    pattern: /\blayout|partition|opening|wall removal\b/i
  }
] as const;

function inferRenovationScopeFromLineItem(
  lineItem: z.infer<typeof renovationLineItemSchema>
) {
  const searchText = `${lineItem.factKey} ${lineItem.label} ${lineItem.evidence}`;
  const match = renovationScopeTextPatterns.find((item) =>
    item.pattern.test(searchText)
  );

  if (!match) {
    return null;
  }

  const definition = renovationScopeDefinitions.find(
    (item) => item.factKey === match.factKey
  );

  if (!definition) {
    return null;
  }

  return {
    factKey: definition.factKey,
    label: definition.label,
    confidence: lineItem.confidence,
    evidence: lineItem.evidence
  };
}

function parseVisionRenovationInference(text: string): RenovationInference | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const rawScopeFacts = Array.isArray(parsed.scopeFacts)
      ? parsed.scopeFacts
      : [];
    const scopeFacts = rawScopeFacts
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }

        const record = item as Record<string, unknown>;
        const definition = parseRenovationFactKey(record.factKey);
        const confidence = parseConfidence(record.confidence);

        if (!definition || confidence === null || confidence < 0.55) {
          return [];
        }

        return [
          {
            factKey: definition.factKey,
            label: definition.label,
            confidence,
            evidence:
              typeof record.evidence === "string"
                ? normalizeText(record.evidence).slice(0, 240)
                : "Visible in listing photos"
          }
        ];
      })
      .filter(
        (fact, index, facts) =>
          facts.findIndex((item) => item.factKey === fact.factKey) === index
      );
    const rawLineItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
    const lineItems = rawLineItems.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      const label =
        typeof record.label === "string" ? normalizeText(record.label) : "";
      const amount = parseCost(record.amount);
      const confidence = parseConfidence(record.confidence);

      if (!label || amount === null || confidence === null || confidence < 0.55) {
        return [];
      }

      return [
        {
          factKey:
            typeof record.factKey === "string" &&
            record.factKey.startsWith("renovation.line_item.")
              ? record.factKey
              : `renovation.line_item.${slugFromLabel(label)}`,
          label,
          amount,
          confidence,
          evidence:
            typeof record.evidence === "string"
              ? normalizeText(record.evidence).slice(0, 240)
              : "Visible in listing photos"
        }
      ];
    });
    const derivedScopeFacts = lineItems
      .flatMap((lineItem) => {
        const derivedScope = inferRenovationScopeFromLineItem(lineItem);

        return derivedScope ? [derivedScope] : [];
      })
      .filter(
        (fact) => !scopeFacts.some((item) => item.factKey === fact.factKey)
      );
    const expectedCost =
      parseCost(parsed.expectedCost) ??
      (lineItems.length > 0
        ? lineItems.reduce((total, item) => total + item.amount, 0)
        : null);
    const lowEstimate = parseCost(parsed.lowEstimate);
    const highEstimate = parseCost(parsed.highEstimate);

    if (scopeFacts.length === 0 && lineItems.length === 0 && expectedCost === null) {
      return null;
    }

    return {
      scopeFacts: [...scopeFacts, ...derivedScopeFacts],
      lineItems,
      expectedCost,
      lowEstimate,
      highEstimate
    };
  } catch {
    return null;
  }
}

function createRenovationLineItem(
  label: string,
  amount: number,
  confidence: number,
  evidence: string
) {
  return {
    factKey: `renovation.line_item.${slugFromLabel(label)}`,
    label,
    amount,
    confidence,
    evidence: normalizeText(evidence).slice(0, 240)
  };
}

function inferRenovationFromText(text: string): RenovationInference | null {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  const scopeFacts = new Map<string, z.infer<typeof renovationScopeFactSchema>>();
  const lineItems = new Map<string, z.infer<typeof renovationLineItemSchema>>();

  function addScope(
    factKey: (typeof renovationScopeDefinitions)[number]["factKey"],
    confidence: number,
    evidence: string
  ) {
    const definition = renovationScopeDefinitions.find(
      (item) => item.factKey === factKey
    );

    if (!definition) {
      return;
    }

    const existing = scopeFacts.get(factKey);

    if (existing && existing.confidence !== null && existing.confidence >= confidence) {
      return;
    }

    scopeFacts.set(factKey, {
      factKey,
      label: definition.label,
      confidence,
      evidence: normalizeText(evidence).slice(0, 240)
    });
  }

  function addLineItem(
    label: string,
    amount: number,
    confidence: number,
    evidence: string
  ) {
    const lineItem = createRenovationLineItem(label, amount, confidence, evidence);
    lineItems.set(lineItem.factKey, lineItem);
  }

  const generalTlcPattern =
    /\b(?:tlc|fixer(?:[-\s]?upper)?|needs?\s+(?:work|updat(?:e|ing)|renovation)|make it your own|dated|original|cosmetic(?:ally)?|as[-\s]?is)\b/i;
  const generalEvidence = getTextEvidence(normalized, generalTlcPattern);

  if (generalEvidence) {
    addScope("renovation.paint", 0.62, generalEvidence);
    addScope("renovation.flooring", 0.58, generalEvidence);
    addLineItem("General cosmetic refresh", 20000, 0.6, generalEvidence);
  }

  const kitchenEvidence = getTextEvidence(
    normalized,
    /\bkitchen\b.{0,60}\b(?:dated|original|needs?\s+(?:work|updat(?:e|ing)|renovation)|old)\b|\b(?:dated|original|old)\b.{0,60}\bkitchen\b/i
  );

  if (kitchenEvidence) {
    addScope("renovation.kitchen", 0.72, kitchenEvidence);
    addLineItem("Kitchen refresh", 18000, 0.68, kitchenEvidence);
  }

  const bathEvidence = getTextEvidence(
    normalized,
    /\bbath(?:room)?s?\b.{0,60}\b(?:dated|original|needs?\s+(?:work|updat(?:e|ing)|renovation)|old)\b|\b(?:dated|original|old)\b.{0,60}\bbath(?:room)?s?\b/i
  );

  if (bathEvidence) {
    addScope("renovation.bathrooms", 0.7, bathEvidence);
    addLineItem("Bathroom refresh", 12000, 0.66, bathEvidence);
  }

  const flooringEvidence = getTextEvidence(
    normalized,
    /\b(?:flooring|floors?|carpet)\b.{0,60}\b(?:dated|worn|needs?\s+(?:work|replacement|refinish(?:ing)?|updat(?:e|ing)))\b|\b(?:worn|dated)\b.{0,60}\b(?:flooring|floors?|carpet)\b/i
  );

  if (flooringEvidence) {
    addScope("renovation.flooring", 0.72, flooringEvidence);
    addLineItem("Flooring refresh", 9000, 0.68, flooringEvidence);
  }

  const paintEvidence = getTextEvidence(
    normalized,
    /\bpaint(?:ing)?\b.{0,60}\b(?:needed|needs?|freshen|refresh|update)\b|\b(?:freshen|refresh|update)\b.{0,60}\bpaint(?:ing)?\b/i
  );

  if (paintEvidence) {
    addScope("renovation.paint", 0.72, paintEvidence);
    addLineItem("Interior paint", 6000, 0.68, paintEvidence);
  }

  const lightingEvidence = getTextEvidence(
    normalized,
    /\b(?:lighting|fixtures?)\b.{0,60}\b(?:dated|old|needs?\s+(?:work|replacement|updat(?:e|ing)))\b|\b(?:dated|old)\b.{0,60}\b(?:lighting|fixtures?)\b/i
  );

  if (lightingEvidence) {
    addScope("renovation.lighting", 0.68, lightingEvidence);
    addLineItem("Lighting and fixture updates", 3500, 0.64, lightingEvidence);
  }

  const landscapingEvidence = getTextEvidence(
    normalized,
    /\b(?:landscaping|yard|grounds?)\b.{0,60}\b(?:overgrown|needs?\s+(?:work|cleanup|refresh))\b|\bovergrown\b.{0,60}\b(?:landscaping|yard|grounds?)\b/i
  );

  if (landscapingEvidence) {
    addScope("renovation.landscaping", 0.68, landscapingEvidence);
    addLineItem("Landscaping cleanup", 6000, 0.64, landscapingEvidence);
  }

  const windowEvidence = getTextEvidence(
    normalized,
    /\bwindows?\b.{0,60}\b(?:old|original|needs?\s+(?:work|replacement|updat(?:e|ing)))\b|\b(?:old|original)\b.{0,60}\bwindows?\b/i
  );

  if (windowEvidence) {
    addScope("renovation.windows", 0.7, windowEvidence);
    addLineItem("Window updates", 12000, 0.64, windowEvidence);
  }

  const sidingEvidence = getTextEvidence(
    normalized,
    /\bsiding\b.{0,60}\b(?:old|damaged|needs?\s+(?:work|replacement|repair))\b|\b(?:old|damaged)\b.{0,60}\bsiding\b/i
  );

  if (sidingEvidence) {
    addScope("renovation.siding", 0.7, sidingEvidence);
    addLineItem("Siding repair", 14000, 0.64, sidingEvidence);
  }

  const deckEvidence = getTextEvidence(
    normalized,
    /\b(?:deck|porch)\b.{0,60}\b(?:old|damaged|needs?\s+(?:work|replacement|repair))\b|\b(?:old|damaged)\b.{0,60}\b(?:deck|porch)\b/i
  );

  if (deckEvidence) {
    addScope("renovation.deck_porch", 0.7, deckEvidence);
    addLineItem("Deck or porch repair", 8000, 0.64, deckEvidence);
  }

  const majorEvidence = getTextEvidence(
    normalized,
    /\b(?:gut renovation|full gut|major renovation|needs everything|total rehab)\b/i
  );

  if (majorEvidence) {
    addScope("renovation.whole_house_gut", 0.76, majorEvidence);
    addLineItem("Whole-house renovation allowance", 90000, 0.68, majorEvidence);
  }

  const structuralEvidence = getTextEvidence(
    normalized,
    /\b(?:structural|foundation)\b.{0,60}\b(?:repair|issue|problem|work|damage)\b/i
  );

  if (structuralEvidence) {
    addScope("renovation.structural_rehabilitation", 0.72, structuralEvidence);
    addLineItem("Structural repair allowance", 50000, 0.62, structuralEvidence);
  }

  if (scopeFacts.size === 0 && lineItems.size === 0) {
    return null;
  }

  const expectedCost = Array.from(lineItems.values()).reduce(
    (total, item) => total + item.amount,
    0
  );

  return {
    scopeFacts: Array.from(scopeFacts.values()),
    lineItems: Array.from(lineItems.values()),
    expectedCost,
    lowEstimate: Math.round(expectedCost * 0.6),
    highEstimate: Math.round(expectedCost * 1.6)
  };
}

function mergeRenovationInferences(
  primary: RenovationInference | null,
  fallback: RenovationInference | null
): RenovationInference | null {
  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  const scopeFacts = [...primary.scopeFacts];

  for (const fact of fallback.scopeFacts) {
    if (!scopeFacts.some((item) => item.factKey === fact.factKey)) {
      scopeFacts.push(fact);
    }
  }

  return {
    scopeFacts,
    lineItems:
      primary.lineItems.length > 0 ? primary.lineItems : fallback.lineItems,
    expectedCost: primary.expectedCost ?? fallback.expectedCost,
    lowEstimate: primary.lowEstimate ?? fallback.lowEstimate,
    highEstimate: primary.highEstimate ?? fallback.highEstimate
  };
}

async function inferHouseStyleFromPhotos(
  photoUrls: string[],
  fetcher: FetchLike,
  signal?: AbortSignal
): Promise<{ style: StyleInference | null; warning: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const imageUrls = getEligibleVisionImageUrls(photoUrls).slice(0, 3);

  if (imageUrls.length === 0) {
    return {
      style: null,
      warning: "no eligible exterior photo URL was available for photo inference"
    };
  }

  if (!apiKey) {
    return {
      style: null,
      warning: "photo inference skipped because OPENAI_API_KEY is not configured"
    };
  }

  async function requestStyle(imageUrlsForRequest: string[]) {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
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
              ...imageUrlsForRequest.map((imageUrl) => ({
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
        warning: `photo inference failed with HTTP ${response.status}${await getResponseErrorSuffix(response)}`
      };
    }

    return {
      style: parseVisionStyleInference(
        extractResponseOutputText(await response.json())
      ),
      warning: null
    };
  }

  const result = await requestStyle(imageUrls);

  if (result.style || responseWarningIsNotImageSpecific(result.warning)) {
    return {
      style: result.style,
      warning:
        result.warning ??
        (result.style ? null : "photo inference ran but confidence was below threshold")
    };
  }

  if (imageUrls.length > 1) {
    for (const imageUrl of imageUrls) {
      const singleImageResult = await requestStyle([imageUrl]);

      if (singleImageResult.style) {
        return singleImageResult;
      }
    }
  }

  return {
    style: null,
    warning:
      result.warning ?? "photo inference ran but confidence was below threshold"
  };
}

async function inferStyleFromRequestEvidence({
  shouldInferStyle,
  requestTextStyle,
  requestPhotoUrls,
  fetcher,
  addDiagnostic,
  signal
}: {
  shouldInferStyle: boolean;
  requestTextStyle: StyleInference | null;
  requestPhotoUrls: string[];
  fetcher: FetchLike;
  addDiagnostic: ReturnType<typeof createDiagnosticRecorder>["add"];
  signal?: AbortSignal;
}): Promise<{ style: StyleInference | null; failureReason: string }> {
  if (!shouldInferStyle) {
    return { style: null, failureReason: "" };
  }

  if (requestTextStyle) {
    addDiagnostic(
      "style",
      "success",
      "House style was inferred.",
      `${requestTextStyle.houseStyle} from ${requestTextStyle.source}; confidence ${requestTextStyle.confidence}`
    );
    return { style: requestTextStyle, failureReason: "" };
  }

  const eligiblePhotoCount = getEligibleVisionImageUrls(requestPhotoUrls).length;
  addDiagnostic(
    "style photos",
    eligiblePhotoCount > 0 ? "started" : "skipped",
    eligiblePhotoCount > 0
      ? "Running photo style inference from saved candidate photos."
      : "Photo style inference has no eligible saved photo URLs.",
    `Eligible photos: ${eligiblePhotoCount}`
  );

  const photoInference = await inferHouseStyleFromPhotos(
    requestPhotoUrls,
    fetcher,
    signal
  );

  if (photoInference.style) {
    addDiagnostic(
      "style",
      "success",
      "House style was inferred.",
      `${photoInference.style.houseStyle} from ${photoInference.style.source}; confidence ${photoInference.style.confidence}`
    );
    return { style: photoInference.style, failureReason: "" };
  }

  const failureReason = `listing text did not identify a style; ${
    photoInference.warning ?? "photo inference did not produce a style"
  }`;
  addDiagnostic(
    "style",
    "warning",
    "House style inference failed.",
    failureReason
  );

  return { style: null, failureReason };
}

async function inferRenovationsFromPhotos(
  photoUrls: string[],
  fetcher: FetchLike,
  signal?: AbortSignal
): Promise<{ renovation: RenovationInference | null; warning: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const imageUrls = getEligibleVisionImageUrls(photoUrls).slice(0, 8);

  if (imageUrls.length === 0) {
    return {
      renovation: null,
      warning: "renovation inference skipped because no eligible listing photo URL was available"
    };
  }

  if (!apiKey) {
    return {
      renovation: null,
      warning: "renovation inference skipped because OPENAI_API_KEY is not configured"
    };
  }

  const allowedScopes = renovationScopeDefinitions
    .map((definition) => `${definition.factKey} (${definition.label})`)
    .join(", ");

  async function requestRenovation(imageUrlsForRequest: string[]) {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
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
                  "Infer visible renovation needs from these real-estate listing photos only. " +
                  "Do not infer hidden defects, code issues, electrical, plumbing, structural, roof, or foundation work unless directly visible. " +
                  `Use only these scope fact keys: ${allowedScopes}. ` +
                  "Return conservative ballpark USD costs for visible cosmetic and functional work. " +
                  "Return only JSON with keys scopeFacts, lineItems, expectedCost, lowEstimate, highEstimate. " +
                  "scopeFacts must contain objects with factKey, confidence, evidence. " +
                  "lineItems must contain objects with label, amount, confidence, evidence."
              },
              ...imageUrlsForRequest.map((imageUrl) => ({
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
        renovation: null,
        warning: `renovation photo inference failed with HTTP ${response.status}${await getResponseErrorSuffix(response)}`
      };
    }

    return {
      renovation: parseVisionRenovationInference(
        extractResponseOutputText(await response.json())
      ),
      warning: null
    };
  }

  const result = await requestRenovation(imageUrls);

  if (result.renovation || responseWarningIsNotImageSpecific(result.warning)) {
    return {
      renovation: result.renovation,
      warning:
        result.warning ??
        (result.renovation
          ? null
          : "renovation photo inference ran but did not return confident scope")
    };
  }

  if (imageUrls.length > 1) {
    for (const imageUrl of imageUrls) {
      const singleImageResult = await requestRenovation([imageUrl]);

      if (singleImageResult.renovation) {
        return singleImageResult;
      }
    }
  }

  return {
    renovation: null,
    warning:
      result.warning ??
      "renovation photo inference ran but did not return confident scope"
  };
}

async function getResponseErrorSuffix(
  response: Pick<Response, "json" | "text">
) {
  const errorMessage = await readResponseErrorMessage(response);

  return errorMessage ? `: ${errorMessage}` : "";
}

async function readResponseErrorMessage(
  response: Pick<Response, "json" | "text">
) {
  try {
    const jsonReader = (response as { json?: unknown }).json;

    if (typeof jsonReader === "function") {
      const payload = (await jsonReader.call(response)) as unknown;
      const message = getPayloadErrorMessage(payload);

      if (message) {
        return message;
      }
    }
  } catch {
    // Fall back to text when the response is not JSON.
  }

  try {
    const textReader = (response as { text?: unknown }).text;

    if (typeof textReader === "function") {
      return normalizeText(String(await textReader.call(response))).slice(0, 220);
    }
  } catch {
    return "";
  }

  return "";
}

function getPayloadErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const error = record.error;

  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;

    if (typeof message === "string") {
      return normalizeText(message).slice(0, 220);
    }
  }

  if (typeof record.message === "string") {
    return normalizeText(record.message).slice(0, 220);
  }

  return "";
}

function responseWarningIsNotImageSpecific(warning: string | null) {
  return Boolean(warning && !/\bHTTP 400\b/.test(warning));
}

async function inferRenovationsSafelyFromPhotos(
  photoUrls: string[],
  fetcher: FetchLike,
  signal?: AbortSignal
) {
  try {
    return await inferRenovationsFromPhotos(photoUrls, fetcher, signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "photo inference failed";

    return {
      renovation: null,
      warning: `renovation photo inference failed: ${message}`
    };
  }
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
        "houseStyle" | "listingRemarks" | "inferStyle" | "inferRenovation"
      >
    >,
  fetcher: FetchLike = fetch,
  options: EnrichmentOptions = {}
): Promise<ListingCandidateEnrichmentResponse> {
  const parsedCandidate = requestCandidateSchema.parse(candidate);
  const requestSignal = options.signal;
  throwIfAborted(requestSignal);
  const listingUrl = validateFetchUrl(parsedCandidate.listingUrl);
  const fetchedAt = new Date().toISOString();
  const diagnosticRecorder = createDiagnosticRecorder(
    fetchedAt,
    options.onDiagnostic
  );
  const { diagnostics } = diagnosticRecorder;
  const addDiagnostic = diagnosticRecorder.add;
  const warnings: string[] = [];
  const shouldFillStyleFromRequest =
    parsedCandidate.inferStyle && !parsedCandidate.houseStyle.trim();
  const shouldInferRenovation = parsedCandidate.inferRenovation;
  const requestTextStyle = shouldFillStyleFromRequest
    ? inferHouseStyleFromText(parsedCandidate.listingRemarks)
    : null;
  const requestTextRenovation = shouldInferRenovation
    ? inferRenovationFromText(parsedCandidate.listingRemarks)
    : null;
  const requestTextSetting = inferSettingFactsFromText(
    parsedCandidate.listingRemarks
  );
  const requestPhotoUrls = Array.from(
    new Set([
      ...(parsedCandidate.primaryPhotoUrl ? [parsedCandidate.primaryPhotoUrl] : []),
      ...parsedCandidate.photoUrls
    ])
  );
  addDiagnostic(
    "start",
    "started",
    "Started listing enrichment.",
    [
      `Listing URL: ${listingUrl}`,
      `Saved photos: ${requestPhotoUrls.length}`,
      `Listing remarks: ${parsedCandidate.listingRemarks.trim() ? "present" : "missing"}`,
      `Style inference: ${parsedCandidate.inferStyle ? "enabled" : "disabled"}`,
      `Renovation inference: ${shouldInferRenovation ? "enabled" : "disabled"}`
    ].join(" ")
  );

  if (requestTextRenovation) {
    addDiagnostic(
      "renovation text",
      "success",
      "Listing remarks matched renovation signals.",
      summarizeRenovation(requestTextRenovation)
    );
  } else if (shouldInferRenovation) {
    addDiagnostic(
      "renovation text",
      "skipped",
      "Listing remarks did not identify renovation scope.",
      parsedCandidate.listingRemarks.trim()
        ? "No supported renovation phrases were matched."
        : "No listing remarks were available."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const listingFetchSignal = combineAbortSignals([
    controller.signal,
    requestSignal
  ]);

  try {
    throwIfAborted(requestSignal);
    addDiagnostic(
      "listing fetch",
      "started",
      "Fetching listing page.",
      listingUrl
    );
    const response = await fetcher(listingUrl, {
      signal: listingFetchSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; REAcquisitionAssistant/0.1; +http://localhost)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      warnings.push(`Listing page fetch failed with HTTP ${response.status}.`);
      addDiagnostic(
        "listing fetch",
        "warning",
        `Listing page fetch failed with HTTP ${response.status}.`,
        "The app will use saved candidate photos and listing remarks when available."
      );
      const requestStyle = await inferStyleFromRequestEvidence({
        shouldInferStyle: shouldFillStyleFromRequest,
        requestTextStyle,
        requestPhotoUrls,
        fetcher,
        addDiagnostic
      });
      if (requestStyle.failureReason) {
        warnings.push(
          `House style inference failed: ${requestStyle.failureReason}.`
        );
      }
      const eligiblePhotoCount = getEligibleVisionImageUrls(requestPhotoUrls).length;
      if (shouldInferRenovation) {
        addDiagnostic(
          "renovation photos",
          eligiblePhotoCount > 0 ? "started" : "skipped",
          eligiblePhotoCount > 0
            ? "Running photo renovation inference from saved candidate photos."
            : "Photo renovation inference has no eligible saved photo URLs.",
          `Eligible photos: ${eligiblePhotoCount}`
        );
      }
      const photoRenovation = shouldInferRenovation
        ? await inferRenovationsSafelyFromPhotos(requestPhotoUrls, fetcher)
        : null;
      const renovation = mergeRenovationInferences(
        photoRenovation?.renovation ?? null,
        requestTextRenovation
      );
      recordSettingInferenceDiagnostic(
        addDiagnostic,
        requestTextSetting,
        Boolean(parsedCandidate.listingRemarks.trim()),
        "Listing remarks"
      );

      if (photoRenovation?.warning) {
        warnings.push(photoRenovation.warning);
        addDiagnostic(
          "renovation photos",
          "warning",
          photoRenovation.warning,
          "Photo renovation inference did not provide usable output."
        );
      }

      if (renovation) {
        addDiagnostic(
          "renovation",
          "success",
          "Renovation inference produced facts.",
          summarizeRenovation(renovation)
        );
      } else if (shouldInferRenovation) {
        addDiagnostic(
          "renovation",
          "warning",
          "Renovation inference did not produce facts.",
          "No photo or text inference result was available."
        );
      }

      return listingCandidateEnrichmentResponseSchema.parse({
        candidateId: parsedCandidate.id,
        listingUrl,
        fetchedAt,
        updates: {
          ...emptyUpdates(),
          ...getStyleUpdate(requestStyle.style),
          ...getSettingUpdate(
            addSettingCoverageFact(
              requestTextSetting,
              Boolean(parsedCandidate.listingRemarks.trim())
            )
          ),
          ...getRenovationUpdate(renovation)
        },
        warnings,
        diagnostics
      });
    }

    const metadata = extractMetadata(await response.text());
    addDiagnostic(
      "listing fetch",
      "success",
      "Listing page fetched.",
      `Photos found: ${metadata.photoUrls.length}. Asking price found: ${
        metadata.askingPrice !== null ? metadata.askingPrice : "none"
      }.`
    );

    if (!pageMatchesCandidate(parsedCandidate, metadata)) {
      warnings.push("Fetched listing page did not include candidate address.");
      addDiagnostic(
        "listing fetch",
        "warning",
        "Fetched listing page did not include candidate address.",
        "The app will avoid applying page-derived price or photo data."
      );
      const requestStyle = await inferStyleFromRequestEvidence({
        shouldInferStyle: shouldFillStyleFromRequest,
        requestTextStyle,
        requestPhotoUrls,
        fetcher,
        addDiagnostic
      });
      if (requestStyle.failureReason) {
        warnings.push(
          `House style inference failed: ${requestStyle.failureReason}.`
        );
      }
      const eligiblePhotoCount = getEligibleVisionImageUrls(requestPhotoUrls).length;
      if (shouldInferRenovation) {
        addDiagnostic(
          "renovation photos",
          eligiblePhotoCount > 0 ? "started" : "skipped",
          eligiblePhotoCount > 0
            ? "Running photo renovation inference from saved candidate photos."
            : "Photo renovation inference has no eligible saved photo URLs.",
          `Eligible photos: ${eligiblePhotoCount}`
        );
      }
      const photoRenovation = shouldInferRenovation
        ? await inferRenovationsSafelyFromPhotos(requestPhotoUrls, fetcher)
        : null;
      const renovation = mergeRenovationInferences(
        photoRenovation?.renovation ?? null,
        requestTextRenovation
      );
      recordSettingInferenceDiagnostic(
        addDiagnostic,
        requestTextSetting,
        Boolean(parsedCandidate.listingRemarks.trim()),
        "Listing remarks"
      );

      if (photoRenovation?.warning) {
        warnings.push(photoRenovation.warning);
        addDiagnostic(
          "renovation photos",
          "warning",
          photoRenovation.warning,
          "Photo renovation inference did not provide usable output."
        );
      }

      if (renovation) {
        addDiagnostic(
          "renovation",
          "success",
          "Renovation inference produced facts.",
          summarizeRenovation(renovation)
        );
      } else if (shouldInferRenovation) {
        addDiagnostic(
          "renovation",
          "warning",
          "Renovation inference did not produce facts.",
          "No photo or text inference result was available."
        );
      }

      return listingCandidateEnrichmentResponseSchema.parse({
        candidateId: parsedCandidate.id,
        listingUrl,
        fetchedAt,
        updates: {
          ...emptyUpdates(),
          ...getStyleUpdate(requestStyle.style),
          ...getSettingUpdate(
            addSettingCoverageFact(
              requestTextSetting,
              Boolean(parsedCandidate.listingRemarks.trim())
            )
          ),
          ...getRenovationUpdate(renovation)
        },
        warnings,
        diagnostics
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
    const eligiblePhotoCount = getEligibleVisionImageUrls(availablePhotoUrls).length;
    if (shouldInferRenovation) {
      addDiagnostic(
        "renovation photos",
        eligiblePhotoCount > 0 ? "started" : "skipped",
        eligiblePhotoCount > 0
          ? "Running photo renovation inference."
          : "Photo renovation inference has no eligible photo URLs.",
        `Eligible photos: ${eligiblePhotoCount}. Total candidate/page photos: ${availablePhotoUrls.length}.`
      );
    }
    const photoRenovation = shouldInferRenovation
      ? await inferRenovationsSafelyFromPhotos(availablePhotoUrls, fetcher)
      : null;
    const textRenovation = shouldInferRenovation
      ? inferRenovationFromText(
          `${metadata.pageText} ${parsedCandidate.listingRemarks}`
        )
      : null;
    const renovation = mergeRenovationInferences(
      photoRenovation?.renovation ?? null,
      textRenovation
    );
    const pageText = `${metadata.pageText} ${parsedCandidate.listingRemarks}`;
    const settingFacts = mergeSettingFacts(
      inferSettingFactsFromText(pageText),
      requestTextSetting
    );
    recordSettingInferenceDiagnostic(
      addDiagnostic,
      settingFacts,
      Boolean(pageText.trim()),
      "Listing page text"
    );
    if (textRenovation) {
      addDiagnostic(
        "renovation text",
        "success",
        "Listing page text matched renovation signals.",
        summarizeRenovation(textRenovation)
      );
    }
    let style =
      shouldFillStyle
        ? requestTextStyle ??
          inferHouseStyleFromText(
            `${metadata.pageText} ${parsedCandidate.listingRemarks}`
          )
        : null;
    let styleFailureReason = shouldFillStyle && !style
      ? "listing text did not identify a style"
      : "";

    if (shouldFillStyle && !style) {
      const photoInference = await inferHouseStyleFromPhotos(
        availablePhotoUrls,
        fetcher
      );
      style = photoInference.style;

      if (photoInference.warning) {
        styleFailureReason = `${styleFailureReason}; ${photoInference.warning}`;
      }
    }

    const updates = {
      askingPrice: shouldFillPrice ? metadata.askingPrice : null,
      primaryPhotoUrl: shouldFillPhoto ? (metadata.photoUrls[0] ?? "") : "",
      photoUrls: shouldFillPhoto ? metadata.photoUrls : [],
      ...getStyleUpdate(style),
      ...getSettingUpdate(
        addSettingCoverageFact(settingFacts, Boolean(pageText.trim()))
      ),
      ...getRenovationUpdate(renovation)
    };

    if (shouldFillPrice && updates.askingPrice === null) {
      warnings.push("Listing page did not expose an asking price.");
      addDiagnostic(
        "price",
        "warning",
        "Listing page did not expose an asking price.",
        "Existing property price was empty and no page price was found."
      );
    } else if (shouldFillPrice && updates.askingPrice !== null) {
      addDiagnostic(
        "price",
        "success",
        "Asking price was found.",
        `${updates.askingPrice}`
      );
    } else {
      addDiagnostic(
        "price",
        "skipped",
        "Asking price was already populated.",
        "No price update needed."
      );
    }

    if (shouldFillPhoto && !updates.primaryPhotoUrl) {
      warnings.push("Listing page did not expose a property photo.");
      addDiagnostic(
        "photo",
        "warning",
        "Listing page did not expose a property photo.",
        "Existing primary photo was empty and no page photo was found."
      );
    } else if (shouldFillPhoto && updates.primaryPhotoUrl) {
      addDiagnostic(
        "photo",
        "success",
        "Primary photo was found.",
        `Photos found: ${updates.photoUrls.length}`
      );
    } else {
      addDiagnostic(
        "photo",
        "skipped",
        "Primary photo was already populated.",
        "No photo update needed."
      );
    }

    if (shouldFillStyle && !style) {
      warnings.push(`House style inference failed: ${styleFailureReason}.`);
      addDiagnostic(
        "style",
        "warning",
        "House style inference failed.",
        styleFailureReason
      );
    } else if (shouldFillStyle && style) {
      addDiagnostic(
        "style",
        "success",
        "House style was inferred.",
        `${style.houseStyle} from ${style.source}; confidence ${style.confidence}`
      );
    } else {
      addDiagnostic(
        "style",
        "skipped",
        "House style inference was not needed.",
        "House style is already populated or inference was disabled."
      );
    }

    if (photoRenovation?.warning) {
      warnings.push(photoRenovation.warning);
      addDiagnostic(
        "renovation photos",
        "warning",
        photoRenovation.warning,
        "Photo renovation inference did not provide usable output."
      );
    } else if (photoRenovation?.renovation) {
      addDiagnostic(
        "renovation photos",
        "success",
        "Photo renovation inference produced facts.",
        summarizeRenovation(photoRenovation.renovation)
      );
    }

    if (renovation) {
      addDiagnostic(
        "renovation",
        "success",
        "Renovation inference produced facts.",
        summarizeRenovation(renovation)
      );
    } else if (shouldInferRenovation) {
      addDiagnostic(
        "renovation",
        "warning",
        "Renovation inference did not produce facts.",
        "No photo or text inference result was available."
      );
    }

    return listingCandidateEnrichmentResponseSchema.parse({
      candidateId: parsedCandidate.id,
      listingUrl,
      fetchedAt,
      updates,
      warnings,
      diagnostics
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Listing page fetch failed.";
    warnings.push(`Listing page fetch failed: ${message}`);
    addDiagnostic(
      "listing fetch",
      "failed",
      `Listing page fetch failed: ${message}`,
      "The app will use saved candidate photos and listing remarks when available."
    );

    const requestStyle = await inferStyleFromRequestEvidence({
      shouldInferStyle: shouldFillStyleFromRequest,
      requestTextStyle,
      requestPhotoUrls,
      fetcher,
      addDiagnostic
    });
    if (requestStyle.failureReason) {
      warnings.push(
        `House style inference failed: ${requestStyle.failureReason}.`
      );
    }
    const eligiblePhotoCount = getEligibleVisionImageUrls(requestPhotoUrls).length;
    if (shouldInferRenovation) {
      addDiagnostic(
        "renovation photos",
        eligiblePhotoCount > 0 ? "started" : "skipped",
        eligiblePhotoCount > 0
          ? "Running photo renovation inference from saved candidate photos."
          : "Photo renovation inference has no eligible saved photo URLs.",
        `Eligible photos: ${eligiblePhotoCount}`
      );
    }
    const photoRenovation = shouldInferRenovation
      ? await inferRenovationsSafelyFromPhotos(requestPhotoUrls, fetcher)
      : null;
    const renovation = mergeRenovationInferences(
      photoRenovation?.renovation ?? null,
      requestTextRenovation
    );
    recordSettingInferenceDiagnostic(
      addDiagnostic,
      requestTextSetting,
      Boolean(parsedCandidate.listingRemarks.trim()),
      "Listing remarks"
    );

    if (photoRenovation?.warning) {
      warnings.push(photoRenovation.warning);
      addDiagnostic(
        "renovation photos",
        "warning",
        photoRenovation.warning,
        "Photo renovation inference did not provide usable output."
      );
    }

    if (renovation) {
      addDiagnostic(
        "renovation",
        "success",
        "Renovation inference produced facts.",
        summarizeRenovation(renovation)
      );
    } else if (shouldInferRenovation) {
      addDiagnostic(
        "renovation",
        "warning",
        "Renovation inference did not produce facts.",
        "No photo or text inference result was available."
      );
    }

    return listingCandidateEnrichmentResponseSchema.parse({
      candidateId: parsedCandidate.id,
      listingUrl,
      fetchedAt,
      updates: {
        ...emptyUpdates(),
        ...getStyleUpdate(requestStyle.style),
        ...getSettingUpdate(
          addSettingCoverageFact(
            requestTextSetting,
            Boolean(parsedCandidate.listingRemarks.trim())
          )
        ),
        ...getRenovationUpdate(renovation)
      },
      warnings,
      diagnostics
    });
  } finally {
    clearTimeout(timeout);
  }
}
