"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Camera,
  Clipboard,
  FileText,
  Home,
  Images,
  LinkIcon,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wrench
} from "lucide-react";

import { ScoreEvaluationPanel } from "@/components/scoring/score-evaluation-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { calculateDriveTimeResponseSchema } from "@/lib/commute/drive-time";
import {
  listingCandidateEnrichmentResponseSchema,
  type ListingCandidateEnrichmentResponse
} from "@/lib/listing-alerts/listing-enrichment";
import { normalizeListingUrl } from "@/lib/listing-alerts/listing-url";
import {
  type BrowserCaptureRecord,
  browserCaptureListResponseSchema,
  normalizePhotoUrls,
  selectCapturePhotoUrls
} from "@/lib/properties/browser-capture";
import {
  PROPERTY_STORAGE_KEY,
  createEmptyPropertyState,
  createPropertyFact,
  createPropertyRecord,
  loadPropertyState,
  removeProperty,
  savePropertyState,
  upsertProperty
} from "@/lib/properties/property-persistence";
import {
  filterAndSortProperties,
  type PropertyScoreFilter,
  type PropertySortMode
} from "@/lib/properties/property-list-filters";
import {
  getProjectedTotalInvestment,
  getRenovationExpectedCost
} from "@/lib/properties/property-dashboard";
import {
  type LifecycleStatus,
  type ListingStatus,
  type PropertyEnrichmentDiagnostic,
  type PropertyFact,
  type PropertyFactSourceType,
  type PropertyPhotoEvidence,
  type PropertyRecord,
  type PropertySourceCapture,
  type PropertyState,
  lifecycleStatusOptions,
  listingStatusOptions,
  propertyEnrichmentDiagnosticSchema,
  propertyFactSourceOptions
} from "@/lib/properties/types";
import { loadProfileState } from "@/lib/profiles/profile-persistence";
import type { ProfileState, SearchProfile } from "@/lib/profiles/types";
import { evaluateProperty } from "@/lib/scoring/evaluate-property";
import {
  addScoreEvaluation,
  createEmptyScoreState,
  getLatestScoreEvaluation,
  loadScoreState,
  saveScoreState
} from "@/lib/scoring/score-persistence";
import {
  scoringEngineVersion,
  type ScoreEvaluation,
  type ScoreEvaluationState
} from "@/lib/scoring/types";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "sources"
  | "facts"
  | "financials"
  | "systems"
  | "notes"
  | "diagnostics"
  | "scoring";

const tabs: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "sources", label: "Sources", icon: Images },
  { id: "facts", label: "Facts", icon: Search },
  { id: "financials", label: "Financials", icon: BadgeDollarSign },
  { id: "systems", label: "Systems", icon: Wrench },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "scoring", label: "Scoring", icon: BarChart3 }
];

const noPreferredSettingMatchFactKey = "setting.no_preferred_match";

type EnrichmentStreamEvent =
  | {
      type: "diagnostic";
      diagnostic: unknown;
    }
  | {
      type: "result";
      result: ListingCandidateEnrichmentResponse;
    }
  | {
      type: "error";
      error: string;
    };

const propertyScoreFilterOptions: Array<{
  value: PropertyScoreFilter;
  label: string;
}> = [
  { value: "all", label: "All Scores" },
  { value: "scored", label: "Scored" },
  { value: "not_scored", label: "Not Scored" },
  { value: "hard_rejected", label: "Hard Rejected" },
  { value: "missing_data", label: "Score Gaps" }
];

const propertySortOptions: Array<{
  value: PropertySortMode;
  label: string;
}> = [
  { value: "updated_desc", label: "Recently Updated" },
  { value: "score_desc", label: "Highest Score" },
  { value: "score_asc", label: "Lowest Score" },
  { value: "price_asc", label: "Lowest Price" },
  { value: "price_desc", label: "Highest Price" }
];

function parseNullableInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableFloat(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFactValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!value.trim()) {
    return null;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function formatFactValue(value: PropertyFact["value"]) {
  if (value === null) {
    return "";
  }

  return String(value);
}

function cloneProperty(property: PropertyRecord): PropertyRecord {
  return JSON.parse(JSON.stringify(property)) as PropertyRecord;
}

function propertyFingerprint(property: PropertyRecord | null) {
  return property ? JSON.stringify(property) : "";
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatAddress(property: PropertyRecord) {
  const line = [property.addressLine1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return line || "Untitled property";
}

function cleanActionUrl(value: string) {
  return value
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/(?:\]|\|)(?=https?:\/\/).*$/i, "")
    .replace(/[\]),.;]+$/g, "");
}

function isLikelyImageActionUrl(value: string) {
  try {
    const parsedUrl = new URL(value);
    return /\.(?:jpe?g|png|webp)$/i.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function extractActionUrls(value: string) {
  const separatedValue = value
    .replace(/\](https?:\/\/)/gi, "] $1")
    .replace(/\|(https?:\/\/)/gi, " $1");
  const matches = separatedValue.match(/https?:\/\/[^\s<>"')\]|]+/gi) ?? [];

  return Array.from(new Set(matches.map(cleanActionUrl).filter(Boolean)));
}

function getSourceWebsiteLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    if (hostname.includes("zillow")) {
      return "Zillow";
    }

    if (hostname.includes("realtor")) {
      return "Realtor";
    }

    return hostname;
  } catch {
    return "Source";
  }
}

function getPropertySourceListingUrl(property: PropertyRecord) {
  const listingUrl = extractActionUrls(property.listingUrl).find(
    (url) => !isLikelyImageActionUrl(url)
  );

  if (listingUrl) {
    return listingUrl;
  }

  return (
    property.sourceCaptures
      .map((capture) => cleanActionUrl(capture.pageUrl))
      .find((url) => url && !isLikelyImageActionUrl(url)) ?? ""
  );
}

function formatEvaluationDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function createPropertyDiagnostic(
  stage: string,
  status: PropertyEnrichmentDiagnostic["status"],
  message: string,
  detail = "",
  at = new Date().toISOString()
): PropertyEnrichmentDiagnostic {
  return {
    id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    stage,
    status,
    message,
    detail
  };
}

export function createBrowserCaptureBookmarklet() {
  const script = String.raw`(async()=> {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const text = document.body ? document.body.innerText : "";
    const sourceSite = location.hostname.replace(/^www\./, "");
    const addressPattern = /\d{1,6}[ \t]+[A-Za-z0-9 .'-]+?(?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Circle|Cir\.?|Trail|Terrace|Ter\.?|Way|Place|Pl\.?|Boulevard|Blvd\.?|Highway|Hwy\.?),\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i;
    const titleMatch = document.title.match(addressPattern);
    const lineMatch = text.split(/\n+/).map(compact).find((line) => addressPattern.test(line));
    const addressFull = compact(titleMatch ? titleMatch[0] : lineMatch || "");
    const addressLine1 = compact(addressFull.split(",")[0] || "");
    const expansions = {
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
    const tokens = addressLine1.toLowerCase()
      .replace(/\b(rd|st|ave|ln|dr|ct|cir|ter|pl|blvd|hwy)\.?\b/g, (value) => expansions[value.replace(".", "")] || value)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .slice(0, 4);
    const isRejectedAsset = (lower) => {
      const path = lower.split(/[?#]/)[0];

      return path.endsWith(".svg") ||
      path.endsWith(".gif") ||
      lower.includes("zillow_web") ||
      lower.includes("z-logo") ||
      lower.includes("staticmap") ||
      lower.includes("app-store") ||
      lower.includes("google-play") ||
      lower.includes("footer-art") ||
      lower.includes("static.rdc.moveaws.com") ||
      lower.includes("/rdc-ui/") ||
      lower.includes("/logos/") ||
      lower.includes("/icons/") ||
      lower.includes("/pictos/") ||
      lower.includes("app-promotion") ||
      lower.includes("download-badge") ||
      lower.includes("vu-logo") ||
      /^https?:\/\/p\.rdcpix\.com\//.test(lower) ||
      lower.includes("/agents/") ||
      lower.includes("agent");
    };
    const getPhotoKey = (lower, normalized) => {
      const zillowId = lower.match(/photos\.zillowstatic\.com\/fp\/([a-f0-9]+)-/);
      const realtorId = lower.match(/ap\.rdcpix\.com\/([^/?#]+?l-m\d+)(?:rd)?(?:-[^/?#]+)?\.(?:jpe?g|png|webp)/);

      if (zillowId && zillowId[1]) return sourceSite + ":zillow:" + zillowId[1];
      if (realtorId && realtorId[1]) return sourceSite + ":realtor:" + realtorId[1];

      return normalized;
    };
    const details = [];
    const seen = new Set();
    const blocked = new Set();
    const isBrokerageMarketingAlt = (value) => {
      const normalized = compact(value).toLowerCase();

      return normalized.includes("brokerage logo") ||
        normalized.includes("broker logo") ||
        normalized.includes("company logo") ||
        normalized.includes("realty professionals") ||
        normalized.includes("home services") ||
        normalized.includes("homeservices") ||
        normalized.includes("berkshire hathaway");
    };
    const keep = (url, img, index) => {
      if (!url) return;

      const normalized = String(url).trim();
      const lower = normalized.toLowerCase();
      const alt = compact(img.alt || img.getAttribute("aria-label") || "");
      const altLower = alt.toLowerCase();
      const key = getPhotoKey(lower, normalized);

      if (!/^https?:\/\//i.test(normalized)) return;
      if (isBrokerageMarketingAlt(alt)) {
        blocked.add(key);
        return;
      }
      if (blocked.has(key)) return;
      if (seen.has(key)) return;
      if (isRejectedAsset(lower)) return;

      if (sourceSite.includes("zillow")) {
        if (!lower.includes("photos.zillowstatic.com/fp/")) return;

        const matchesTarget = tokens.length > 0 && tokens.every((token) => altLower.includes(token));

        if (!matchesTarget) return;
      }

      if (sourceSite.includes("realtor") && !lower.includes("ap.rdcpix.com/")) return;

      seen.add(key);
      details.push({ url: normalized, alt, index });
    };

    const scanDocumentImages = () => {
      Array.from(document.images).forEach((img, index) => {
        keep(img.currentSrc || img.src, img, index);
        String(img.getAttribute("srcset") || "")
          .split(",")
          .map((part) => part.trim().split(/\s+/)[0])
          .forEach((url) => keep(url, img, index));
      });
    };

    const keepZillowUrl = (url, index) => {
      if (!url) return;

      const normalized = String(url)
        .replace(/&amp;/g, "&")
        .replace(/\\u0026/gi, "&")
        .replace(/\\/g, "")
        .trim();
      const lower = normalized.toLowerCase();
      const key = getPhotoKey(lower, normalized);

      if (!/^https?:\/\//i.test(normalized)) return;
      if (!lower.includes("photos.zillowstatic.com/fp/")) return;
      if (isRejectedAsset(lower)) return;
      if (blocked.has(key) || seen.has(key)) return;

      seen.add(key);
      details.push({
        url: normalized,
        alt: addressLine1,
        index
      });
    };

    const getVisibleZillowGalleryRoot = () => {
      const candidates = Array.from(
        document.querySelectorAll('[role="dialog"], [aria-modal="true"]')
      ).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 500 && rect.height >= 300;
      });

      return candidates[0] || null;
    };

    const getLargestVisibleZillowPhoto = (root) => {
      if (!root) return null;

      const candidates = Array.from(root.querySelectorAll("img"))
        .filter((img) => {
          const src = String(img.currentSrc || img.src || "");
          if (!src.toLowerCase().includes("photos.zillowstatic.com/fp/")) {
            return false;
          }

          if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
            return false;
          }

          const rect = img.getBoundingClientRect();
          const visible =
            rect.width >= 250 &&
            rect.height >= 180 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth;

          return visible;
        })
        .map((img) => ({
          img,
          area: img.getBoundingClientRect().width * img.getBoundingClientRect().height
        }))
        .sort((a, b) => b.area - a.area);

      return candidates[0]?.img || null;
    };

    const findZillowNextButton = (root) => {
      if (!root) return null;

      const buttons = Array.from(root.querySelectorAll("button, [role='button']"));

      return buttons.find((element) => {
        const label = compact(
          element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent ||
            ""
        ).toLowerCase();

        if (!label) return false;

        return (
          label === "next" ||
          label.includes("next photo") ||
          label.includes("next image") ||
          label.includes("next slide")
        );
      }) || null;
    };

    scanDocumentImages();

    if (sourceSite.includes("zillow") && details.length < 40) {
      const galleryButton = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      ).find((element) => {
        const label = compact(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            ""
        );

        return /(?:see|view|show)\s+(?:all\s+)?\d+\s+photos?/i.test(label) ||
          /^\s*\d+\s+photos?\s*$/i.test(label);
      });

      if (galleryButton && typeof galleryButton.click === "function") {
        galleryButton.click();
        await sleep(1000);
      }

      const galleryRoot = getVisibleZillowGalleryRoot();

      if (galleryRoot) {
        let consecutiveNoChange = 0;
        let previousKey = "";

        for (let step = 0; step < 45 && details.length < 40; step += 1) {
          const currentPhoto = getLargestVisibleZillowPhoto(galleryRoot);

          if (currentPhoto) {
            const src = String(currentPhoto.currentSrc || currentPhoto.src || "");
            const normalized = src.trim();
            const key = getPhotoKey(normalized.toLowerCase(), normalized);

            keepZillowUrl(src, 10000 + step);

            if (key === previousKey) {
              consecutiveNoChange += 1;
            } else {
              consecutiveNoChange = 0;
              previousKey = key;
            }
          }

          const nextButton = findZillowNextButton(galleryRoot);

          if (!nextButton || consecutiveNoChange >= 2) {
            break;
          }

          if (typeof nextButton.click === "function") {
            nextButton.click();
          }

          await sleep(350);
        }
      }
    }

    if (blocked.size > 0) {
      for (let index = details.length - 1; index >= 0; index -= 1) {
        const photo = details[index];
        const normalized = String(photo.url).trim();
        const key = getPhotoKey(normalized.toLowerCase(), normalized);

        if (blocked.has(key)) {
          details.splice(index, 1);
          seen.delete(key);
        }
      }
    }

    if (sourceSite.includes("realtor")) {
      const visibleRealtorUrls = details
        .map((photo) => photo.url)
        .filter((url) => /ap\.rdcpix\.com\//i.test(url));
      const familyCounts = new Map();

      visibleRealtorUrls.forEach((url) => {
        const match = String(url).match(
          /ap\.rdcpix\.com\/([^/?#]+?)l-m\d+/i
        );
        if (!match || !match[1]) return;

        const family = match[1].toLowerCase();
        familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
      });

      const dominantFamily = Array.from(familyCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "";

      if (dominantFamily) {
        const html = String(document.documentElement?.innerHTML || "")
          .replace(/\\u002F/gi, "/")
          .replace(/\\\//g, "/");
        const embeddedMatches =
          html.match(/https?:\/\/ap\.rdcpix\.com\/[^"'<>\\\s]+/gi) || [];

        embeddedMatches.forEach((url, index) => {
          const normalized = String(url)
            .replace(/&amp;/g, "&")
            .replace(/\\u0026/gi, "&")
            .replace(/\\/g, "");
          const familyMatch = normalized.match(
            /ap\.rdcpix\.com\/([^/?#]+?)l-m\d+/i
          );

          if (familyMatch?.[1]?.toLowerCase() === dominantFamily) {
            keep(
              normalized,
              { alt: "", getAttribute: () => "" },
              10000 + index
            );
          }
        });
      }
    }

    const photoDetails = details.slice(0, 80);
    const photoUrls = photoDetails.map((photo) => photo.url);
    const special = text.match(/What's special\s+([\s\S]*?)(?:Show more|\d+\s+(?:minute|hour|day|month)s?\s+on\s+Zillow|Facts & features|Listed by:|Source:)/i);
    const payload = {
      pageUrl: location.href,
      title: document.title,
      sourceSite,
      addressFull,
      listingRemarks: compact(special && special[1] ? special[1] : ""),
      photoDetails,
      photoUrls
    };

    fetch("http://localhost:3000/api/browser-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        const result = await response.json();
        const accepted = Array.isArray(result?.capture?.photoUrls)
          ? result.capture.photoUrls.length
          : 0;
        alert(
          "RE Assistant capture complete: " +
            photoUrls.length +
            " candidate photo URLs detected, " +
            accepted +
            " unique property photos accepted."
        );
      })
      .catch(() => {
        prompt("Capture failed. Copy this payload into RE Assistant if needed:", JSON.stringify(payload));
      });
  })();`;

  return `javascript:${encodeURIComponent(script)}`;
}

function formatCaptureDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function createPhotoEvidenceFromCapture(
  capture: BrowserCaptureRecord,
  url: string,
  index: number
): PropertyPhotoEvidence {
  return {
    id: `${capture.id}-photo-${index}`,
    url,
    sourceType: "browser_capture",
    sourceSite: capture.sourceSite,
    sourcePageUrl: capture.pageUrl,
    label: capture.addressLine1
      ? `${capture.addressLine1} photo ${index + 1}`
      : `Captured photo ${index + 1}`,
    capturedAt: capture.capturedAt
  };
}

async function readNdjsonStream<T>({
  response,
  onEvent
}: {
  response: Response;
  onEvent: (event: T) => void;
}) {
  if (!response.body) {
    throw new Error("Streaming response body was not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine) {
        onEvent(JSON.parse(trimmedLine) as T);
      }
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer.trim()) as T);
  }
}

function createSourceCaptureSummary(
  capture: BrowserCaptureRecord,
  photoCount = capture.photoUrls.length
): PropertySourceCapture {
  return {
    id: capture.id,
    capturedAt: capture.capturedAt,
    sourceType: "browser_capture",
    sourceSite: capture.sourceSite,
    pageUrl: capture.pageUrl,
    addressLine1: capture.addressLine1,
    city: capture.city,
    state: capture.state,
    postalCode: capture.postalCode,
    photoCount,
    remarksSnippet: capture.listingRemarks.slice(0, 500)
  };
}

function captureMatchesProperty(
  capture: BrowserCaptureRecord,
  property: PropertyRecord
) {
  const captureAddress = [
    capture.addressLine1,
    capture.city,
    capture.state,
    capture.postalCode
  ]
    .join(" ")
    .toLowerCase();
  const propertyAddress = [
    property.addressLine1,
    property.city,
    property.state,
    property.postalCode
  ]
    .join(" ")
    .toLowerCase();

  if (!captureAddress.trim() || !propertyAddress.trim()) {
    return false;
  }

  return (
    captureAddress.includes(property.addressLine1.toLowerCase()) ||
    propertyAddress.includes(capture.addressLine1.toLowerCase())
  );
}

function getFocusedCapturePhotoUrls(
  capture: BrowserCaptureRecord,
  property: PropertyRecord
) {
  if (!captureMatchesProperty(capture, property)) {
    return [];
  }

  return selectCapturePhotoUrls({
    sourceSite: capture.sourceSite,
    addressLine1: property.addressLine1 || capture.addressLine1,
    photoDetails: capture.photoDetails,
    photoUrls: capture.photoUrls
  });
}

function applyCaptureToProperty(
  property: PropertyRecord,
  capture: BrowserCaptureRecord
) {
  const capturedPhotoUrls = getFocusedCapturePhotoUrls(capture, property);
  const existingEvidenceUrls = new Set(
    property.photoEvidence.map((photo) => photo.url)
  );
  const newEvidence = capturedPhotoUrls
    .map((url, index) => ({ url, index }))
    .filter(({ url }) => !existingEvidenceUrls.has(url))
    .map(({ url, index }) => createPhotoEvidenceFromCapture(capture, url, index));
  const combinedEvidence = [...newEvidence, ...property.photoEvidence];
  const normalizedEvidenceUrls = new Set(
    normalizePhotoUrls(combinedEvidence.map((photo) => photo.url))
  );
  const photoEvidence = combinedEvidence.filter((photo) =>
    normalizedEvidenceUrls.has(photo.url)
  );
  const photoUrls = normalizePhotoUrls([
    ...property.photoUrls,
    ...capturedPhotoUrls
  ]);
  const primaryPhotoUrl = property.primaryPhotoUrl || photoUrls[0] || "";
  const diagnostics = [
    ...property.enrichmentDiagnostics,
    createPropertyDiagnostic(
      "source capture",
      capturedPhotoUrls.length > 0 ? "success" : "warning",
      capturedPhotoUrls.length > 0
        ? "Browser capture attached."
        : "Browser capture had no usable photo URLs.",
      `${capture.sourceSite || "Unknown source"} · ${capturedPhotoUrls.length} photo URL${
        capturedPhotoUrls.length === 1 ? "" : "s"
      }`
    )
  ].slice(-80);
  const sourceCaptures = property.sourceCaptures.some(
    (sourceCapture) => sourceCapture.id === capture.id
  )
    ? property.sourceCaptures.map((sourceCapture) =>
        sourceCapture.id === capture.id
          ? createSourceCaptureSummary(capture, capturedPhotoUrls.length)
          : sourceCapture
      )
    : [
        createSourceCaptureSummary(capture, capturedPhotoUrls.length),
        ...property.sourceCaptures
      ];

  return {
    ...property,
    addressLine1: property.addressLine1 || capture.addressLine1,
    city: property.city || capture.city,
    state: property.state || capture.state || property.state,
    postalCode: property.postalCode || capture.postalCode,
    listingUrl: property.listingUrl || capture.pageUrl,
    askingPrice: property.askingPrice ?? capture.askingPrice ?? null,
    bedrooms: property.bedrooms ?? capture.bedrooms ?? null,
    bathrooms: property.bathrooms ?? capture.bathrooms ?? null,
    livingSqft: property.livingSqft ?? capture.livingSqft ?? null,
    listingRemarks: property.listingRemarks || capture.listingRemarks,
    primaryPhotoUrl,
    photoUrls,
    photoEvidence,
    sourceCaptures,
    enrichmentDiagnostics: diagnostics,
    updatedAt: capture.capturedAt
  };
}

function getScoreBadgeVariant(
  evaluation: ScoreEvaluation
): React.ComponentProps<typeof Badge>["variant"] {
  if (evaluation.hardRejected) {
    return "destructive";
  }

  if (evaluation.normalizedScore >= 70) {
    return "success";
  }

  if (evaluation.normalizedScore >= 45) {
    return "secondary";
  }

  return "warning";
}

function formatScoreGapCount(count: number) {
  return `${count} ${count === 1 ? "score gap" : "score gaps"}`;
}

function removeListingPagePhotoEvidence(
  property: PropertyRecord
): PropertyRecord {
  const listingPageUrls = new Set(
    property.photoEvidence
      .filter((photo) => photo.sourceType === "listing_page")
      .map((photo) => photo.url)
  );

  if (listingPageUrls.size === 0) {
    return property;
  }

  const photoEvidence = property.photoEvidence.filter(
    (photo) => photo.sourceType !== "listing_page"
  );
  const photoUrls = property.photoUrls.filter(
    (url) => !listingPageUrls.has(url)
  );
  const primaryPhotoUrl = listingPageUrls.has(property.primaryPhotoUrl)
    ? photoUrls[0] ?? photoEvidence[0]?.url ?? ""
    : property.primaryPhotoUrl;

  return {
    ...property,
    primaryPhotoUrl,
    photoUrls,
    photoEvidence
  };
}

function getPropertyPhotoUrls(property: PropertyRecord) {
  return Array.from(
    new Set([
      ...(property.primaryPhotoUrl ? [property.primaryPhotoUrl] : []),
      ...property.photoUrls,
      ...property.photoEvidence.map((photo) => photo.url)
    ])
  );
}

function createPropertyEnrichmentCandidate(
  property: PropertyRecord,
  browserCaptures: BrowserCaptureRecord[] = []
) {
  const latestMatchingCapture = browserCaptures
    .filter((capture) => captureMatchesProperty(capture, property))
    .sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
    )[0];

  const focusedCapturePhotoUrls = latestMatchingCapture
    ? getFocusedCapturePhotoUrls(latestMatchingCapture, property)
    : [];

  const photoUrls = normalizePhotoUrls([
    ...getPropertyPhotoUrls(property),
    ...focusedCapturePhotoUrls
  ]);
  const primaryPhotoUrl = property.primaryPhotoUrl || photoUrls[0] || "";

  return {
    id: property.id,
    listingUrl: normalizeListingUrl(property.listingUrl).canonicalUrl,
    addressLine1: property.addressLine1,
    city: property.city,
    state: property.state,
    postalCode: property.postalCode,
    askingPrice: property.askingPrice,
    primaryPhotoUrl,
    photoUrls,
    houseStyle: property.houseStyle,
    listingRemarks: property.listingRemarks,
    inferStyle: true,
    inferRenovation: true
  };
}

function upsertInferredStyleFact(
  facts: PropertyFact[],
  factKey: string,
  label: string,
  confidence: number | null,
  sourceReference: string,
  observedAt: string
) {
  if (!factKey) {
    return facts;
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);
  const nextFact = {
    ...(existingFact ??
      createPropertyFact({
        factKey,
        label,
        value: true,
        sourceType: "ai_inferred",
        sourceReference
      })),
    label,
    value: true,
    sourceType: "ai_inferred" as const,
    sourceReference,
    confidence,
    verified: false,
    observedAt
  };

  if (existingFact) {
    return facts.map((fact) => (fact.id === existingFact.id ? nextFact : fact));
  }

  return [...facts, nextFact];
}

function upsertSourcedTextFact(
  facts: PropertyFact[],
  factKey: string,
  label: string,
  value: string,
  sourceReference: string,
  observedAt: string
) {
  const textValue = value.trim();

  if (!textValue) {
    return facts.filter((fact) => fact.factKey !== factKey);
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);
  const nextFact = {
    ...(existingFact ??
      createPropertyFact({
        factKey,
        label,
        value: textValue,
        sourceType: "api",
        sourceReference
      })),
    label,
    value: textValue,
    sourceType: "api" as const,
    sourceReference,
    confidence: 0.8,
    verified: false,
    observedAt
  };

  if (existingFact) {
    return facts.map((fact) => (fact.id === existingFact.id ? nextFact : fact));
  }

  return [...facts, nextFact];
}

function upsertInferredPropertyFact(
  facts: PropertyFact[],
  factKey: string,
  label: string,
  value: PropertyFact["value"],
  confidence: number | null,
  sourceReference: string,
  observedAt: string
) {
  if (!factKey) {
    return facts;
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);

  if (
    existingFact &&
    (existingFact.sourceType === "user_entered" ||
      existingFact.sourceType === "verified")
  ) {
    return facts;
  }

  const nextFact = {
    ...(existingFact ??
      createPropertyFact({
        factKey,
        label,
        value,
        sourceType: "ai_inferred",
        sourceReference
      })),
    label,
    value,
    sourceType: "ai_inferred" as const,
    sourceReference,
    confidence,
    verified: false,
    observedAt
  };

  if (existingFact) {
    return facts.map((fact) => (fact.id === existingFact.id ? nextFact : fact));
  }

  return [...facts, nextFact];
}

function mergeEnrichmentIntoProperty(
  property: PropertyRecord,
  enrichment: ReturnType<typeof listingCandidateEnrichmentResponseSchema.parse>
) {
  const shouldApplyListingUrl =
    Boolean(enrichment.listingUrl) && enrichment.listingUrl !== property.listingUrl;
  const shouldApplyPrice =
    property.askingPrice === null && enrichment.updates.askingPrice !== null;
  const propertyPhotoUrls = getPropertyPhotoUrls(property);
  const evidencePrimaryPhotoUrl =
    property.primaryPhotoUrl || propertyPhotoUrls[0] || "";
  const shouldApplyPhoto =
    !evidencePrimaryPhotoUrl && Boolean(enrichment.updates.primaryPhotoUrl);
  const primaryPhotoUrl = shouldApplyPhoto
    ? enrichment.updates.primaryPhotoUrl
    : evidencePrimaryPhotoUrl;
  const photoUrls = Array.from(
    new Set([
      ...(primaryPhotoUrl ? [primaryPhotoUrl] : []),
      ...enrichment.updates.photoUrls,
      ...propertyPhotoUrls
    ])
  );
  const photoEvidence = property.photoEvidence;
  const repairedPhotoReferences =
    primaryPhotoUrl !== property.primaryPhotoUrl ||
    property.photoEvidence.some((photo) => !property.photoUrls.includes(photo.url));
  const shouldApplyStyle =
    !property.houseStyle.trim() && Boolean(enrichment.updates.houseStyle);
  const styleFailureReason =
    enrichment.warnings
      .find((warning) => warning.startsWith("House style inference failed:"))
      ?.replace(/^House style inference failed:\s*/i, "")
      .trim() ??
    enrichment.warnings
      .filter((warning) => warning.toLowerCase().includes("style"))
      .join(" ")
      .trim() ??
    "";
  const facts = shouldApplyStyle
    ? upsertInferredStyleFact(
        property.facts.filter((fact) => fact.factKey !== "style.inference_error"),
        enrichment.updates.styleFactKey,
        enrichment.updates.houseStyle,
        enrichment.updates.styleConfidence,
        enrichment.updates.styleEvidence ||
          `Inferred from ${enrichment.updates.styleSource}`,
        enrichment.fetchedAt
      )
    : !property.houseStyle.trim()
      ? upsertSourcedTextFact(
          property.facts,
          "style.inference_error",
          "House style inference issue",
          styleFailureReason || "listing text and photo inference did not identify a style.",
          "Listing enrichment",
          enrichment.fetchedAt
        )
      : property.facts;
  const photoInferenceReference = "Photo renovation inference";
  const settingInferenceReference = "Listing setting inference";
  let renovationFacts = facts;
  let appliedSettingFacts = 0;
  let appliedSettingCoverageFacts = 0;
  let appliedRenovationScopes = 0;
  let appliedRenovationLineItems = 0;
  let appliedRenovationEstimates = 0;

  for (const settingFact of enrichment.updates.settingFacts) {
    const beforeFacts = renovationFacts;
    renovationFacts = upsertInferredPropertyFact(
      renovationFacts,
      settingFact.factKey,
      settingFact.label,
      true,
      settingFact.confidence,
      settingFact.evidence
        ? `${settingInferenceReference}: ${settingFact.evidence}`
        : settingInferenceReference,
      enrichment.fetchedAt
    );

    if (
      renovationFacts !== beforeFacts &&
      settingFact.factKey === noPreferredSettingMatchFactKey
    ) {
      appliedSettingCoverageFacts += 1;
    } else if (renovationFacts !== beforeFacts) {
      appliedSettingFacts += 1;
    }
  }

  for (const scopeFact of enrichment.updates.renovationScopeFacts) {
    const beforeFacts = renovationFacts;
    renovationFacts = upsertInferredPropertyFact(
      renovationFacts,
      scopeFact.factKey,
      scopeFact.label,
      true,
      scopeFact.confidence,
      scopeFact.evidence
        ? `${photoInferenceReference}: ${scopeFact.evidence}`
        : photoInferenceReference,
      enrichment.fetchedAt
    );

    if (renovationFacts !== beforeFacts) {
      appliedRenovationScopes += 1;
    }
  }

  for (const lineItem of enrichment.updates.renovationLineItems) {
    const beforeFacts = renovationFacts;
    renovationFacts = upsertInferredPropertyFact(
      renovationFacts,
      lineItem.factKey,
      lineItem.label,
      lineItem.amount,
      lineItem.confidence,
      lineItem.evidence
        ? `${photoInferenceReference}: ${lineItem.evidence}`
        : photoInferenceReference,
      enrichment.fetchedAt
    );

    if (renovationFacts !== beforeFacts) {
      appliedRenovationLineItems += 1;
    }
  }

  const renovationEstimates = [
    {
      factKey: "renovation.expected_cost",
      label: renovationFactLabels.expected,
      value: enrichment.updates.renovationExpectedCost
    },
    {
      factKey: "renovation.estimate_low",
      label: renovationFactLabels.low,
      value: enrichment.updates.renovationLowEstimate
    },
    {
      factKey: "renovation.estimate_high",
      label: renovationFactLabels.high,
      value: enrichment.updates.renovationHighEstimate
    }
  ];

  for (const estimate of renovationEstimates) {
    if (estimate.value === null) {
      continue;
    }

    const beforeFacts = renovationFacts;
    renovationFacts = upsertInferredPropertyFact(
      renovationFacts,
      estimate.factKey,
      estimate.label,
      estimate.value,
      0.65,
      photoInferenceReference,
      enrichment.fetchedAt
    );

    if (renovationFacts !== beforeFacts) {
      appliedRenovationEstimates += 1;
    }
  }

  const didApplyRenovation =
    appliedRenovationScopes > 0 ||
    appliedRenovationLineItems > 0 ||
    appliedRenovationEstimates > 0;
  const didApplySetting =
    appliedSettingFacts > 0 || appliedSettingCoverageFacts > 0;
  const changed =
    shouldApplyListingUrl ||
    shouldApplyPrice ||
    shouldApplyPhoto ||
    shouldApplyStyle ||
    didApplySetting ||
    didApplyRenovation;

  return {
    property: refreshInvestmentFacts({
      ...property,
      listingUrl: shouldApplyListingUrl
        ? enrichment.listingUrl
        : property.listingUrl,
      askingPrice: shouldApplyPrice
        ? enrichment.updates.askingPrice
        : property.askingPrice,
      primaryPhotoUrl,
      photoUrls,
      photoEvidence,
      sourceCaptures: property.sourceCaptures,
      houseStyle: shouldApplyStyle
        ? enrichment.updates.houseStyle
        : property.houseStyle,
      facts: renovationFacts,
      updatedAt: changed ? enrichment.fetchedAt : property.updatedAt
    }),
    changed,
    appliedFields: [
      shouldApplyListingUrl ? "listing URL" : null,
      shouldApplyPrice ? "price" : null,
      shouldApplyPhoto ? "photo" : null,
      shouldApplyStyle ? "style" : null,
      repairedPhotoReferences ? "captured photos" : null,
      appliedSettingFacts > 0 ? "setting/view facts" : null,
      appliedSettingCoverageFacts > 0 ? "setting reviewed" : null,
      appliedRenovationScopes > 0 ? "renovation scope" : null,
      appliedRenovationLineItems > 0 ? "renovation line items" : null,
      appliedRenovationEstimates > 0 ? "renovation estimate" : null
    ].filter(Boolean) as string[]
  };
}

function createDriveTimeRequest(
  property: PropertyRecord,
  profile: SearchProfile
) {
  return {
    property: {
      id: property.id,
      addressLine1: property.addressLine1,
      city: property.city,
      state: property.state,
      postalCode: property.postalCode
    },
    commute: {
      anchorAddress: profile.commute.anchorAddress,
      anchorLat: profile.commute.anchorLat,
      anchorLng: profile.commute.anchorLng
    }
  };
}

function upsertSourcedNumberFact(
  facts: PropertyFact[],
  factKey: string,
  label: string,
  value: number | null,
  sourceReference: string,
  observedAt: string
) {
  if (value === null) {
    return facts;
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);
  const nextFact = {
    ...(existingFact ??
      createPropertyFact({
        factKey,
        label,
        value,
        sourceType: "api",
        sourceReference
      })),
    label,
    value,
    sourceType: "api" as const,
    sourceReference,
    confidence: 0.8,
    verified: false,
    observedAt
  };

  if (existingFact) {
    return facts.map((fact) => (fact.id === existingFact.id ? nextFact : fact));
  }

  return [...facts, nextFact];
}

function mergeDriveTimeIntoProperty(
  property: PropertyRecord,
  driveTime: ReturnType<typeof calculateDriveTimeResponseSchema.parse>
) {
  if (property.id !== driveTime.propertyId || driveTime.driveTimeMinutes === null) {
    const warning = driveTime.warnings.join(" ") || "Drive time was not calculated.";

    return {
      property: {
        ...property,
        facts: upsertSourcedTextFact(
          property.facts,
          "location.drive_time_error",
          "Drive time calculation issue",
          warning,
          "Drive time calculation",
          driveTime.calculatedAt
        ),
        updatedAt: driveTime.calculatedAt
      },
      changed: true
    };
  }

  const routeReference =
    driveTime.origin && driveTime.destination
      ? `${driveTime.origin.label} to ${driveTime.destination.label}`
      : "Calculated commute route";
  let facts = upsertSourcedNumberFact(
    property.facts.filter((fact) => fact.factKey !== "location.drive_time_error"),
    "location.drive_time_minutes",
    "Drive time",
    driveTime.driveTimeMinutes,
    routeReference,
    driveTime.calculatedAt
  );
  facts = upsertSourcedNumberFact(
    facts,
    "location.drive_distance_miles",
    "Drive distance",
    driveTime.distanceMiles,
    routeReference,
    driveTime.calculatedAt
  );

  return {
    property: {
      ...property,
      facts,
      updatedAt: driveTime.calculatedAt
    },
    changed: true
  };
}

function canCalculateDriveTime(
  property: PropertyRecord | null,
  profile: SearchProfile | null
) {
  if (!property || !profile) {
    return false;
  }

  const hasPropertyAddress = Boolean(
    property.addressLine1.trim() && property.city.trim() && property.state.trim()
  );
  const hasAnchor =
    Boolean(profile.commute.anchorAddress.trim()) ||
    (profile.commute.anchorLat !== null && profile.commute.anchorLng !== null);

  return hasPropertyAddress && hasAnchor;
}

function formatScoreSummaryTitle(evaluation: ScoreEvaluation) {
  const parts = [
    `${evaluation.scoreLabel}: ${evaluation.normalizedScore}/100`,
    `Profile v${evaluation.profileVersion}`,
    `Evaluated ${formatEvaluationDateTime(evaluation.evaluatedAt)}`
  ];

  if (evaluation.hardRejectReasons.length > 0) {
    parts.push(
      `Hard rejects: ${evaluation.hardRejectReasons
        .map((reason) => reason.label)
        .join(", ")}`
    );
  }

  if (evaluation.missingData.length > 0) {
    parts.push(`Score gaps:\n${evaluation.missingData.join("\n")}`);
  }

  return parts.join(" · ");
}

function isTabId(value: string | null): value is TabId {
  return Boolean(value && tabs.some((tab) => tab.id === value));
}

function isLifecycleFilter(value: string | null): value is LifecycleStatus | "all" {
  return (
    value === "all" ||
    Boolean(
      value &&
        lifecycleStatusOptions.some((option) => option.value === value)
    )
  );
}

function isScoreFilter(value: string | null): value is PropertyScoreFilter {
  return Boolean(
    value &&
      propertyScoreFilterOptions.some((option) => option.value === value)
  );
}

function isSortMode(value: string | null): value is PropertySortMode {
  return Boolean(
    value && propertySortOptions.some((option) => option.value === value)
  );
}

function getLifecycleLabel(status: LifecycleStatus) {
  return (
    lifecycleStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

function getListingLabel(status: ListingStatus) {
  return (
    listingStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

export function PropertyManager() {
  const searchParams = useSearchParams();
  const [propertyState, setPropertyState] = React.useState<PropertyState>(() =>
    createEmptyPropertyState()
  );
  const [profileState, setProfileState] = React.useState<ProfileState | null>(null);
  const [scoreState, setScoreState] = React.useState<ScoreEvaluationState>(() =>
    createEmptyScoreState()
  );
  const [selectedPropertyId, setSelectedPropertyId] = React.useState<string | null>(
    null
  );
  const [draft, setDraft] = React.useState<PropertyRecord | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<LifecycleStatus | "all">(
    "all"
  );
  const [scoreFilter, setScoreFilter] =
    React.useState<PropertyScoreFilter>("all");
  const [sortMode, setSortMode] =
    React.useState<PropertySortMode>("updated_desc");
  const [isEnrichingProperty, setIsEnrichingProperty] = React.useState(false);
  const enrichmentAbortControllerRef =
    React.useRef<AbortController | null>(null);
  const enrichmentProgressEndRef = React.useRef<HTMLDivElement | null>(null);
  const [isCalculatingDriveTime, setIsCalculatingDriveTime] =
    React.useState(false);
  const [browserCaptures, setBrowserCaptures] = React.useState<
    BrowserCaptureRecord[]
  >([]);
  const [isLoadingCaptures, setIsLoadingCaptures] = React.useState(false);
  const [captureStatus, setCaptureStatus] = React.useState("No captures loaded");
  const [loadSource, setLoadSource] = React.useState<"storage" | "empty" | "reset">(
    "empty"
  );
  const [saveStatus, setSaveStatus] = React.useState("Ready");

  const loadBrowserCaptures = React.useCallback(
    async (mode: "manual" | "silent" = "manual") => {
      if (mode === "manual") {
        setIsLoadingCaptures(true);
        setCaptureStatus("Checking captures");
      }

      try {
        const response = await fetch("/api/browser-capture", {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to load browser captures.";
          throw new Error(message);
        }

        const parsed = browserCaptureListResponseSchema.parse(payload);

        setBrowserCaptures(parsed.captures);

        if (mode === "manual") {
          setCaptureStatus(
            parsed.captures.length > 0
              ? `${parsed.captures.length} capture${
                  parsed.captures.length === 1 ? "" : "s"
                } available`
              : "No browser captures found"
          );
        }
      } catch (error) {
        if (mode === "manual") {
          setCaptureStatus(
            error instanceof Error ? error.message : "Unable to load captures"
          );
        }
      } finally {
        if (mode === "manual") {
          setIsLoadingCaptures(false);
        }
      }
    },
    []
  );

  React.useEffect(() => {
    const result = loadPropertyState(window.localStorage);
    const profileResult = loadProfileState(window.localStorage);
    const scoreResult = loadScoreState(window.localStorage);
    const requestedPropertyId = searchParams.get("propertyId");
    const requestedTab = searchParams.get("tab");
    const requestedStatus = searchParams.get("status");
    const requestedScoreFilter = searchParams.get("scoreFilter");
    const requestedSort = searchParams.get("sort");
    setPropertyState(result.state);
    setProfileState(profileResult.state);
    setScoreState(scoreResult.state);
    setLoadSource(result.source);

    const selectedProperty =
      result.state.properties.find(
        (property) => property.id === requestedPropertyId
      ) ??
      result.state.properties[0] ??
      null;
    setSelectedPropertyId(selectedProperty?.id ?? null);
    setDraft(selectedProperty ? cloneProperty(selectedProperty) : null);

    if (isTabId(requestedTab)) {
      setActiveTab(requestedTab);
    }

    if (isLifecycleFilter(requestedStatus)) {
      setStatusFilter(requestedStatus);
    }

    if (isScoreFilter(requestedScoreFilter)) {
      setScoreFilter(requestedScoreFilter);
    }

    if (isSortMode(requestedSort)) {
      setSortMode(requestedSort);
    }
  }, [searchParams]);

  React.useEffect(() => {
    void loadBrowserCaptures("silent");
    const intervalId = window.setInterval(() => {
      void loadBrowserCaptures("silent");
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [loadBrowserCaptures]);

  const selectedProperty = React.useMemo(
    () =>
      propertyState.properties.find(
        (property) => property.id === selectedPropertyId
      ) ?? null,
    [propertyState.properties, selectedPropertyId]
  );
  React.useEffect(() => {
    if (!isEnrichingProperty) {
      return;
    }

    enrichmentProgressEndRef.current?.scrollIntoView({ block: "end" });
  }, [draft?.enrichmentDiagnostics.length, isEnrichingProperty]);

  const activeProfile = React.useMemo(() => {
    if (!profileState) {
      return null;
    }

    return (
      profileState.profiles.find(
        (profile) => profile.id === profileState.activeProfileId
      ) ?? null
    );
  }, [profileState]);
  const latestEvaluation = React.useMemo(() => {
    if (!draft || !activeProfile) {
      return undefined;
    }

    return getLatestScoreEvaluation(scoreState, draft.id, activeProfile.id);
  }, [activeProfile, draft, scoreState]);

  const isDirty =
    propertyFingerprint(draft) !== propertyFingerprint(selectedProperty);
  const needsScoreRefresh = Boolean(
    draft &&
      activeProfile &&
      (!latestEvaluation ||
        latestEvaluation.profileVersion !== activeProfile.version ||
        latestEvaluation.scoringEngineVersion !== scoringEngineVersion)
  );
  const canSave = Boolean(draft && (isDirty || needsScoreRefresh));

  const propertyListResult = React.useMemo(
    () =>
      filterAndSortProperties({
        properties: propertyState.properties,
        scoreState,
        profileId: activeProfile?.id,
        query,
        lifecycleStatus: statusFilter,
        scoreFilter,
        sortMode
      }),
    [
      activeProfile?.id,
      propertyState.properties,
      query,
      scoreFilter,
      scoreState,
      sortMode,
      statusFilter
    ]
  );
  const filteredProperties = propertyListResult.properties;

  const statusCounts = React.useMemo(() => {
    return propertyState.properties.reduce<Record<string, number>>(
      (counts, property) => ({
        ...counts,
        [property.lifecycleStatus]: (counts[property.lifecycleStatus] ?? 0) + 1
      }),
      {}
    );
  }, [propertyState.properties]);

  function replaceDraft(next: PropertyRecord) {
    setDraft(next);
    setSaveStatus("Unsaved changes");
  }

  function updateDraft(patch: Partial<PropertyRecord>) {
    if (!draft) {
      return;
    }

    replaceDraft({ ...draft, ...patch });
  }

  function updateFact(id: string, patch: Partial<PropertyFact>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: draft.facts.map((fact) =>
        fact.id === id ? { ...fact, ...patch } : fact
      )
    });
  }

  function persistState(nextState: PropertyState, nextSelectedId: string | null) {
    const persisted = savePropertyState(window.localStorage, nextState);
    setPropertyState(persisted);
    setSelectedPropertyId(nextSelectedId);
    const selected = persisted.properties.find(
      (property) => property.id === nextSelectedId
    );
    setDraft(selected ? cloneProperty(selected) : null);
    setLoadSource("storage");
    setSaveStatus("Saved");
  }

  function handleSelectProperty(propertyId: string) {
    const property = propertyState.properties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    setSelectedPropertyId(propertyId);
    setDraft(cloneProperty(property));
    setSaveStatus("Ready");
  }

  function handleNewProperty() {
    const property = createPropertyRecord();
    setSelectedPropertyId(property.id);
    setDraft(property);
    setSaveStatus("New unsaved property");
    setActiveTab("overview");
  }

  function handleSave() {
    if (!draft) {
      return;
    }

    const nextPropertyState = upsertProperty(propertyState, draft);
    const persistedState = savePropertyState(
      window.localStorage,
      nextPropertyState
    );
    const savedProperty =
      persistedState.properties.find((property) => property.id === draft.id) ??
      draft;

    setPropertyState(persistedState);
    setSelectedPropertyId(savedProperty.id);
    setDraft(cloneProperty(savedProperty));
    setLoadSource("storage");

    if (activeProfile) {
      const evaluation = evaluateProperty(savedProperty, activeProfile);
      const nextScoreState = addScoreEvaluation(scoreState, evaluation);
      const persistedScores = saveScoreState(window.localStorage, nextScoreState);

      setScoreState(persistedScores);
      setSaveStatus("Saved and scored");
    } else {
      setSaveStatus("Saved");
    }
  }

  async function handleCopyBookmarklet() {
    try {
      await navigator.clipboard.writeText(createBrowserCaptureBookmarklet());
      setCaptureStatus("Bookmarklet copied");
    } catch {
      setCaptureStatus("Copy failed");
    }
  }

  async function handleClearBrowserCaptures() {
    setIsLoadingCaptures(true);
    setCaptureStatus("Clearing captures");

    try {
      const response = await fetch("/api/browser-capture", {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Unable to clear browser captures.");
      }

      setBrowserCaptures([]);
      setCaptureStatus("Capture queue cleared");
    } catch (error) {
      setCaptureStatus(
        error instanceof Error ? error.message : "Unable to clear captures"
      );
    } finally {
      setIsLoadingCaptures(false);
    }
  }

  function handleAttachCapture(captureId: string) {
    if (!draft) {
      return;
    }

    const capture = browserCaptures.find((item) => item.id === captureId);

    if (!capture) {
      setCaptureStatus("Capture not found");
      return;
    }

    const focusedPhotoUrls = getFocusedCapturePhotoUrls(capture, draft);

    if (focusedPhotoUrls.length === 0) {
      setCaptureStatus("No focused-property photos found for this capture");
      return;
    }

    const capturedProperty = applyCaptureToProperty(draft, capture);

    // Importing capture data is an edit, not an implicit save.
    // Keep it in the working draft so Save becomes enabled.
    replaceDraft(capturedProperty);
    setSelectedPropertyId(capturedProperty.id);
    setCaptureStatus(
      `Imported ${focusedPhotoUrls.length} photo URL${
        focusedPhotoUrls.length === 1 ? "" : "s"
      } — click Save to persist`
    );
  }

  function handleClearAttachedCapturedPhotos() {
    if (!draft) {
      return;
    }

    const capturedPhotoUrls = new Set(
      draft.photoEvidence
        .filter((photo) => photo.sourceType === "browser_capture")
        .map((photo) => photo.url)
    );

    if (capturedPhotoUrls.size === 0 && draft.sourceCaptures.length === 0) {
      setCaptureStatus("No attached captured photos");
      return;
    }

    const photoUrls = draft.photoUrls.filter(
      (photoUrl) => !capturedPhotoUrls.has(photoUrl)
    );
    const primaryPhotoUrl = capturedPhotoUrls.has(draft.primaryPhotoUrl)
      ? photoUrls[0] ?? ""
      : draft.primaryPhotoUrl;
    const removedPhotoCount = draft.photoEvidence.filter(
      (photo) => photo.sourceType === "browser_capture"
    ).length;
    const nextProperty = {
      ...draft,
      primaryPhotoUrl,
      photoUrls,
      photoEvidence: draft.photoEvidence.filter(
        (photo) => photo.sourceType !== "browser_capture"
      ),
      sourceCaptures: [],
      enrichmentDiagnostics: [
        ...draft.enrichmentDiagnostics,
        createPropertyDiagnostic(
          "source capture",
          "info",
          "Captured photo evidence removed.",
          `Removed ${removedPhotoCount} browser-captured photo URL${
            removedPhotoCount === 1 ? "" : "s"
          }.`
        )
      ].slice(-80),
      updatedAt: new Date().toISOString()
    };
    const nextPropertyState = upsertProperty(propertyState, nextProperty);
    const persistedState = savePropertyState(window.localStorage, nextPropertyState);

    setPropertyState(persistedState);
    setDraft(cloneProperty(nextProperty));
    setSelectedPropertyId(nextProperty.id);
    setLoadSource("storage");
    setSaveStatus("Captured photos removed");
    setCaptureStatus(
      `Removed ${removedPhotoCount} attached captured photo${
        removedPhotoCount === 1 ? "" : "s"
      }`
    );
  }

  async function handleEnrichProperty() {
    if (!draft || !draft.listingUrl.trim()) {
      return;
    }

    const propertyDraft = draft;
    const enrichmentCandidateProperty =
      removeListingPagePhotoEvidence(propertyDraft);
    let diagnostics: PropertyEnrichmentDiagnostic[] = [
      createPropertyDiagnostic(
        "client",
        "started",
        "Requesting listing enrichment.",
        propertyDraft.listingUrl
      )
    ];
    const appendDiagnostic = (diagnostic: PropertyEnrichmentDiagnostic) => {
      diagnostics = [...diagnostics, diagnostic].slice(-80);
      setDraft((currentDraft) =>
        currentDraft?.id === propertyDraft.id
          ? {
              ...currentDraft,
              enrichmentDiagnostics: diagnostics
            }
          : currentDraft
      );
      setSaveStatus(diagnostic.message);
    };

    const abortController = new AbortController();
    enrichmentAbortControllerRef.current = abortController;

    setIsEnrichingProperty(true);
    setSaveStatus("Enriching");
    setActiveTab("diagnostics");
    setDraft({
      ...propertyDraft,
      enrichmentDiagnostics: diagnostics
    });

    try {
      const response = await fetch("/api/listing-alerts/enrich-listing?stream=1", {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json"
        },
        signal: abortController.signal,
        body: JSON.stringify({
          candidate: createPropertyEnrichmentCandidate(
            enrichmentCandidateProperty,
            browserCaptures
          )
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to enrich property.";
        throw new Error(message);
      }

      const enrichmentResults: ListingCandidateEnrichmentResponse[] = [];

      await readNdjsonStream<EnrichmentStreamEvent>({
        response,
        onEvent(event) {
          if (event.type === "diagnostic") {
            appendDiagnostic(
              propertyEnrichmentDiagnosticSchema.parse(event.diagnostic)
            );
            return;
          }

          if (event.type === "result") {
            enrichmentResults.push(
              listingCandidateEnrichmentResponseSchema.parse(event.result)
            );
            return;
          }

          if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      });

      const enrichment = enrichmentResults[0];

      if (!enrichment) {
        throw new Error("Listing enrichment did not return a result.");
      }

      const addressMismatchBlocked = enrichment.diagnostics.some(
        (item) =>
          item.stage === "listing url" &&
          item.status === "failed" &&
          item.message ===
            "Enrichment blocked because listing URL address does not match property."
      );

      if (addressMismatchBlocked) {
        appendDiagnostic(
          createPropertyDiagnostic(
            "client",
            "failed",
            "Enrichment stopped because the listing address does not match the property.",
            "Correct the property address or listing URL, then run Enrich again. No property, drive-time, or scoring updates were saved."
          )
        );
        setSaveStatus("Enrichment blocked: listing address mismatch");
        return;
      }

      const merged = mergeEnrichmentIntoProperty(propertyDraft, enrichment);
      let enrichedProperty = merged.property;
      const appliedFields = [...merged.appliedFields];
      const warnings = [...enrichment.warnings];

      if (activeProfile && canCalculateDriveTime(enrichedProperty, activeProfile)) {
        appendDiagnostic(
          createPropertyDiagnostic(
            "drive time",
            "started",
            "Calculating drive time.",
            `Profile: ${activeProfile.name}`
          )
        );
        const driveTimeResponse = await fetch(
          "/api/properties/calculate-drive-time",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            signal: abortController.signal,
            body: JSON.stringify(
              createDriveTimeRequest(enrichedProperty, activeProfile)
            )
          }
        );
        const driveTimePayload = await driveTimeResponse.json();

        if (driveTimeResponse.ok) {
          const driveTime =
            calculateDriveTimeResponseSchema.parse(driveTimePayload);
          const driveTimeMerge = mergeDriveTimeIntoProperty(
            enrichedProperty,
            driveTime
          );

          enrichedProperty = driveTimeMerge.property;

          if (driveTime.driveTimeMinutes !== null) {
            appliedFields.push("drive time");
            appendDiagnostic(
              createPropertyDiagnostic(
                "drive time",
                "success",
                "Drive time calculated.",
                `${driveTime.driveTimeMinutes} minutes, ${
                  driveTime.distanceMiles ?? "unknown"
                } miles`
              )
            );
          } else {
            appendDiagnostic(
              createPropertyDiagnostic(
                "drive time",
                "warning",
                "Drive time was not calculated.",
                driveTime.warnings.join(" ") || "No route result returned."
              )
            );
          }

          warnings.push(...driveTime.warnings);
        } else if (
          driveTimePayload &&
          typeof driveTimePayload.error === "string"
        ) {
          warnings.push(driveTimePayload.error);
          appendDiagnostic(
            createPropertyDiagnostic(
              "drive time",
              "failed",
              "Drive time request failed.",
              driveTimePayload.error
            )
          );
        }
      } else if (activeProfile) {
        appendDiagnostic(
          createPropertyDiagnostic(
            "drive time",
            "skipped",
            "Drive time calculation skipped.",
            canCalculateDriveTime(enrichedProperty, activeProfile)
              ? "Drive time was available but not requested."
              : "Property address or active profile commute anchor is missing."
          )
        );
      } else {
        appendDiagnostic(
          createPropertyDiagnostic(
            "drive time",
            "skipped",
            "Drive time calculation skipped.",
            "No active search profile is loaded."
          )
        );
      }

      if (activeProfile) {
        appendDiagnostic(
          createPropertyDiagnostic(
            "scoring",
            "started",
            "Calculating score.",
            `Profile: ${activeProfile.name}`
          )
        );
      }

      if (activeProfile) {
        const evaluation = evaluateProperty(enrichedProperty, activeProfile);
        const nextScoreState = addScoreEvaluation(scoreState, evaluation);
        const persistedScores = saveScoreState(
          window.localStorage,
          nextScoreState
        );

        setScoreState(persistedScores);
        appendDiagnostic(
          createPropertyDiagnostic(
            "scoring",
            "success",
            "Score calculated.",
            `${evaluation.scoreLabel}: ${evaluation.normalizedScore}/100`
          )
        );
      }

      const warningSuffix =
        warnings.length > 0
          ? ` (${warnings.length} warning${
              warnings.length === 1 ? "" : "s"
            })`
          : "";

      appendDiagnostic(
        createPropertyDiagnostic(
          "save",
          "success",
          appliedFields.length > 0
            ? `Enriched ${Array.from(new Set(appliedFields)).join(", ")}${warningSuffix}`
            : `No new data${warningSuffix}`,
          activeProfile
            ? "Property and score updates were saved locally."
            : "Property updates were saved locally."
        )
      );
      enrichedProperty = {
        ...enrichedProperty,
        photoEvidence: enrichedProperty.photoEvidence,
        sourceCaptures: enrichedProperty.sourceCaptures,
        enrichmentDiagnostics: diagnostics.slice(-80)
      };
      const nextPropertyState = upsertProperty(propertyState, enrichedProperty);
      const persistedState = savePropertyState(
        window.localStorage,
        nextPropertyState
      );

      setPropertyState(persistedState);
      setDraft(cloneProperty(enrichedProperty));
      setSelectedPropertyId(enrichedProperty.id);
      setLoadSource("storage");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        appendDiagnostic(
          createPropertyDiagnostic(
            "client",
            "info",
            "Enrichment canceled.",
            "The in-progress enrichment request was stopped by the user."
          )
        );
        setSaveStatus("Enrichment canceled");
        return;
      }

      appendDiagnostic(
        createPropertyDiagnostic(
          "client",
          "failed",
          error instanceof Error ? error.message : "Enrich failed"
        )
      );
    } finally {
      if (enrichmentAbortControllerRef.current === abortController) {
        enrichmentAbortControllerRef.current = null;
      }
      setIsEnrichingProperty(false);
    }
  }

  function handleCancelEnrichment() {
    if (!enrichmentAbortControllerRef.current) {
      return;
    }

    setSaveStatus("Canceling enrichment");
    enrichmentAbortControllerRef.current.abort();
  }

  async function handleCalculateDriveTime() {
    if (!draft || !activeProfile || !canCalculateDriveTime(draft, activeProfile)) {
      return;
    }

    setIsCalculatingDriveTime(true);
    setSaveStatus("Calculating drive time");

    try {
      const response = await fetch("/api/properties/calculate-drive-time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createDriveTimeRequest(draft, activeProfile))
      });
      const payload = await response.json();

      if (!response.ok) {
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to calculate drive time.";
        throw new Error(message);
      }

      const driveTime = calculateDriveTimeResponseSchema.parse(payload);
      const merged = mergeDriveTimeIntoProperty(draft, driveTime);
      const nextPropertyState = upsertProperty(propertyState, merged.property);
      const persistedState = savePropertyState(
        window.localStorage,
        nextPropertyState
      );
      const evaluation = evaluateProperty(merged.property, activeProfile);
      const nextScoreState = addScoreEvaluation(scoreState, evaluation);
      const persistedScores = saveScoreState(window.localStorage, nextScoreState);

      setPropertyState(persistedState);
      setDraft(cloneProperty(merged.property));
      setSelectedPropertyId(merged.property.id);
      setScoreState(persistedScores);
      setLoadSource("storage");
      setActiveTab("scoring");
      if (driveTime.driveTimeMinutes === null) {
        setSaveStatus(
          driveTime.warnings.length > 0
            ? driveTime.warnings.join(" ")
            : "No drive time calculated"
        );
      } else {
        setSaveStatus(
          `Drive time ${driveTime.driveTimeMinutes} min${
            driveTime.warnings.length > 0
              ? ` (${driveTime.warnings.length} warning${
                  driveTime.warnings.length === 1 ? "" : "s"
                })`
              : ""
          }`
        );
      }
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? error.message : "Drive time calculation failed"
      );
    } finally {
      setIsCalculatingDriveTime(false);
    }
  }

  function handleDelete() {
    if (!draft) {
      return;
    }

    const nextState = removeProperty(propertyState, draft.id);
    const nextSelected = nextState.properties[0] ?? null;
    persistState(nextState, nextSelected?.id ?? null);
  }

  function handleResetAll() {
    window.localStorage.removeItem(PROPERTY_STORAGE_KEY);
    const emptyState = createEmptyPropertyState();
    setPropertyState(emptyState);
    setSelectedPropertyId(null);
    setDraft(null);
    setLoadSource("empty");
    setSaveStatus("Reset");
  }

  function handleAddFact() {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: [...draft.facts, createPropertyFact()]
    });
  }

  function handleRemoveFact(factId: string) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: draft.facts.filter((fact) => fact.id !== factId)
    });
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      {isEnrichingProperty && draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrichment-progress-title"
            className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <RefreshCw className="size-5 animate-spin" aria-hidden="true" />
                  <h2
                    id="enrichment-progress-title"
                    className="text-lg font-semibold"
                  >
                    Enriching property
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatAddress(draft)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEnrichment}
              >
                Cancel
              </Button>
            </div>

            <div
              className="mt-5 max-h-80 space-y-2 overflow-y-auto"
              aria-live="polite"
            >
              {draft.enrichmentDiagnostics.slice(-8).map((diagnostic) => (
                <div
                  key={diagnostic.id}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{diagnostic.stage}</Badge>
                    <span className="text-sm font-medium">
                      {diagnostic.message}
                    </span>
                  </div>
                  {diagnostic.detail ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {diagnostic.detail}
                    </p>
                  ) : null}
                </div>
              ))}
              <div ref={enrichmentProgressEndRef} aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Milestone 2</Badge>
            <Badge variant={loadSource === "storage" ? "success" : "outline"}>
              {loadSource === "storage" ? "Local Data" : "No Saved Properties"}
            </Badge>
            <Badge variant="outline">{propertyState.properties.length} total</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Properties
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Track acquisition candidates, incomplete listing facts, lifecycle
            status, and due-diligence notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDirty || needsScoreRefresh ? "warning" : "success"}>
            {needsScoreRefresh && !isDirty ? "Score refresh needed" : saveStatus}
          </Badge>
          <Button type="button" variant="outline" onClick={handleResetAll}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={handleNewProperty}>
            <Plus aria-hidden="true" />
            New
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            <Save aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-md border border-border bg-card p-4 shadow-soft">
          <div className="grid gap-3">
            <Field label="Search">
              <Input
                value={query}
                placeholder="Address, town, MLS, notes"
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <Field label="Lifecycle Filter">
              <Select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as LifecycleStatus | "all")
                }
              >
                <option value="all">All Statuses</option>
                {lifecycleStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {statusCounts[option.value]
                      ? ` (${statusCounts[option.value]})`
                      : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Score Filter">
              <Select
                value={scoreFilter}
                onChange={(event) =>
                  setScoreFilter(event.target.value as PropertyScoreFilter)
                }
              >
                {propertyScoreFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sort">
              <Select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as PropertySortMode)
                }
              >
                {propertySortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Separator className="my-4" />

          {filteredProperties.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">
              No properties match the current search, lifecycle, score, and sort
              settings.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProperties.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => handleSelectProperty(property.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors",
                    property.id === selectedPropertyId
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/70"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    {property.primaryPhotoUrl ? (
                      <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                        <Image
                          src={property.primaryPhotoUrl}
                          alt={`${formatAddress(property)} listing photo`}
                          fill
                          sizes="64px"
                          className="object-cover"
                          loading="lazy"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {formatAddress(property)}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {property.city || "Town unknown"} ·{" "}
                        {formatCurrency(property.askingPrice)}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        Total {formatCurrency(getProjectedTotalInvestment(property))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline">
                        {getLifecycleLabel(property.lifecycleStatus)}
                      </Badge>
                      {activeProfile ? (
                        <PropertyScoreBadge
                          scoreState={scoreState}
                          propertyId={property.id}
                          profileId={activeProfile.id}
                        />
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card shadow-soft">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">
                  {draft ? formatAddress(draft) : "No property selected"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {draft ? (
                    <>
                      <Badge variant="outline">
                        {getLifecycleLabel(draft.lifecycleStatus)}
                      </Badge>
                      <Badge variant="outline">
                        Listing: {getListingLabel(draft.listingStatus)}
                      </Badge>
                      <Badge variant="outline">
                        Total {formatCurrency(getProjectedTotalInvestment(draft))}
                      </Badge>
                      <Badge variant="outline">{draft.facts.length} facts</Badge>
                      {latestEvaluation ? (
                        <Badge
                          variant={getScoreBadgeVariant(latestEvaluation)}
                          title={formatScoreSummaryTitle(latestEvaluation)}
                        >
                          Score {latestEvaluation.normalizedScore}/100
                        </Badge>
                      ) : activeProfile ? (
                        <Badge variant="outline">No score</Badge>
                      ) : null}
                      {latestEvaluation ? (
                        <Badge
                          variant="outline"
                          title={formatScoreSummaryTitle(latestEvaluation)}
                        >
                          {latestEvaluation.scoreLabel}
                        </Badge>
                      ) : null}
                      {latestEvaluation?.hardRejected ? (
                        <Badge
                          variant="destructive"
                          title={latestEvaluation.hardRejectReasons
                            .map((reason) => reason.detail)
                            .join("\n")}
                        >
                          Rejected by Profile
                        </Badge>
                      ) : null}
                      {latestEvaluation &&
                      latestEvaluation.missingData.length > 0 ? (
                        <Badge
                          variant="warning"
                          title={latestEvaluation.missingData.join("\n")}
                        >
                          {formatScoreGapCount(
                            latestEvaluation.missingData.length
                          )}
                        </Badge>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEnrichProperty}
                  disabled={
                    !draft || !draft.listingUrl.trim() || isEnrichingProperty
                  }
                >
                  <Sparkles aria-hidden="true" />
                  {isEnrichingProperty ? "Enriching" : "Enrich"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCalculateDriveTime}
                  disabled={
                    !canCalculateDriveTime(draft, activeProfile) ||
                    isCalculatingDriveTime
                  }
                  title={
                    canCalculateDriveTime(draft, activeProfile)
                      ? "Calculate drive time from this property to the active profile commute anchor"
                      : "Add a property address and active profile commute anchor first"
                  }
                >
                  <MapPin aria-hidden="true" />
                  {isCalculatingDriveTime ? "Calculating" : "Drive Time"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={!draft}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-secondary"
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!draft ? (
              <EmptyState onCreate={handleNewProperty} />
            ) : (
              <>
                {activeTab === "overview" ? (
                  <OverviewTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "sources" ? (
                  <SourcesTab
                    draft={draft}
                    browserCaptures={browserCaptures}
                    isLoadingCaptures={isLoadingCaptures}
                    captureStatus={captureStatus}
                    onRefreshCaptures={() => void loadBrowserCaptures("manual")}
                    onCopyBookmarklet={() => void handleCopyBookmarklet()}
                    onClearCaptures={() => void handleClearBrowserCaptures()}
                    onClearAttachedCapturedPhotos={
                      handleClearAttachedCapturedPhotos
                    }
                    onAttachCapture={handleAttachCapture}
                  />
                ) : null}
                {activeTab === "facts" ? (
                  <FactsTab
                    draft={draft}
                    addFact={handleAddFact}
                    removeFact={handleRemoveFact}
                    updateFact={updateFact}
                  />
                ) : null}
                {activeTab === "financials" ? (
                  <FinancialsTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "systems" ? (
                  <SystemsTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "notes" ? (
                  <NotesTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "diagnostics" ? (
                  <DiagnosticsTab diagnostics={draft.enrichmentDiagnostics} />
                ) : null}
                {activeTab === "scoring" ? (
                  <ScoringTab
                    activeProfileName={activeProfile?.name ?? null}
                    evaluation={latestEvaluation}
                  />
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PropertyScoreBadge({
  scoreState,
  propertyId,
  profileId
}: {
  scoreState: ScoreEvaluationState;
  propertyId: string;
  profileId: string;
}) {
  const evaluation = getLatestScoreEvaluation(scoreState, propertyId, profileId);

  if (!evaluation) {
    return <Badge variant="outline">Not scored</Badge>;
  }

  return (
    <div
      className="flex max-w-[9rem] flex-col items-end gap-1"
      title={formatScoreSummaryTitle(evaluation)}
    >
      <Badge
        variant={getScoreBadgeVariant(evaluation)}
        className="whitespace-nowrap"
      >
        Score {evaluation.normalizedScore}/100
      </Badge>
      <span className="max-w-full truncate text-[11px] leading-tight text-muted-foreground">
        {evaluation.scoreLabel}
      </span>
      {evaluation.missingData.length > 0 ? (
        <Badge variant="warning" className="whitespace-nowrap">
          {formatScoreGapCount(evaluation.missingData.length)}
        </Badge>
      ) : null}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background p-8 text-center">
      <Home className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm font-medium">No property selected</div>
      <Button type="button" onClick={onCreate}>
        <Plus aria-hidden="true" />
        Add Property
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
  action
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function OverviewTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  function updatePrimaryPhotoUrl(primaryPhotoUrl: string) {
    updateDraft({
      primaryPhotoUrl,
      photoUrls: primaryPhotoUrl
        ? Array.from(new Set([primaryPhotoUrl, ...draft.photoUrls]))
        : draft.photoUrls.filter((photoUrl) => photoUrl !== draft.primaryPhotoUrl)
    });
  }

  return (
    <div className="grid gap-5">
      <Section title="Listing Photo">
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {draft.primaryPhotoUrl ? (
            <div className="relative h-40 overflow-hidden rounded-md border border-border bg-secondary">
              <Image
                src={draft.primaryPhotoUrl}
                alt={`${formatAddress(draft)} listing photo`}
                fill
                sizes="220px"
                className="object-cover"
                loading="lazy"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
              No listing photo
            </div>
          )}
          <div className="grid content-start gap-4">
            <Field label="Primary Photo URL">
              <Input
                value={draft.primaryPhotoUrl}
                onChange={(event) => updatePrimaryPhotoUrl(event.target.value)}
              />
            </Field>
            <div className="text-sm text-muted-foreground">
              {draft.photoUrls.length} saved photo
              {draft.photoUrls.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Address And Status">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Address" className="md:col-span-2">
            <Input
              value={draft.addressLine1}
              onChange={(event) =>
                updateDraft({ addressLine1: event.target.value })
              }
            />
          </Field>
          <Field label="City">
            <Input
              value={draft.city}
              onChange={(event) => updateDraft({ city: event.target.value })}
            />
          </Field>
          <Field label="State">
            <Input
              value={draft.state}
              maxLength={2}
              onChange={(event) =>
                updateDraft({ state: event.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="Postal Code">
            <Input
              value={draft.postalCode}
              onChange={(event) =>
                updateDraft({ postalCode: event.target.value })
              }
            />
          </Field>
          <Field label="Lifecycle Status">
            <Select
              value={draft.lifecycleStatus}
              onChange={(event) =>
                updateDraft({
                  lifecycleStatus: event.target.value as LifecycleStatus
                })
              }
            >
              {lifecycleStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Listing Status">
            <Select
              value={draft.listingStatus}
              onChange={(event) =>
                updateDraft({ listingStatus: event.target.value as ListingStatus })
              }
            >
              {listingStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="MLS ID">
            <Input
              value={draft.mlsId}
              onChange={(event) => updateDraft({ mlsId: event.target.value })}
            />
          </Field>
          <Field label="Listing URL" className="md:col-span-2">
            <div className="flex gap-2">
              <Input
                value={draft.listingUrl}
                onChange={(event) =>
                  updateDraft({ listingUrl: event.target.value })
                }
              />
              {draft.listingUrl ? (
                <Button type="button" variant="outline" size="icon" asChild>
                  <a
                    href={draft.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open listing URL"
                  >
                    <LinkIcon aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Core Facts">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField
            label="Bedrooms"
            value={draft.bedrooms}
            step="0.5"
            onChange={(bedrooms) => updateDraft({ bedrooms })}
          />
          <NumberField
            label="Bathrooms"
            value={draft.bathrooms}
            step="0.5"
            onChange={(bathrooms) => updateDraft({ bathrooms })}
          />
          <NumberField
            label="Living Sqft"
            value={draft.livingSqft}
            onChange={(livingSqft) => updateDraft({ livingSqft })}
          />
          <NumberField
            label="Lot Acres"
            value={draft.lotAcres}
            step="0.1"
            onChange={(lotAcres) => updateDraft({ lotAcres })}
          />
          <NumberField
            label="Year Built"
            value={draft.yearBuilt}
            onChange={(yearBuilt) => updateDraft({ yearBuilt })}
          />
          <Field label="House Style">
            <Input
              value={draft.houseStyle}
              onChange={(event) =>
                updateDraft({ houseStyle: event.target.value })
              }
            />
          </Field>
          <NumberField
            label="Latitude"
            value={draft.latitude}
            step="0.000001"
            min={undefined}
            onChange={(latitude) => updateDraft({ latitude })}
          />
          <NumberField
            label="Longitude"
            value={draft.longitude}
            step="0.000001"
            min={undefined}
            onChange={(longitude) => updateDraft({ longitude })}
          />
        </div>
      </Section>
    </div>
  );
}

function SourcesTab({
  draft,
  browserCaptures,
  isLoadingCaptures,
  captureStatus,
  onRefreshCaptures,
  onCopyBookmarklet,
  onClearCaptures,
  onClearAttachedCapturedPhotos,
  onAttachCapture
}: {
  draft: PropertyRecord;
  browserCaptures: BrowserCaptureRecord[];
  isLoadingCaptures: boolean;
  captureStatus: string;
  onRefreshCaptures: () => void;
  onCopyBookmarklet: () => void;
  onClearCaptures: () => void;
  onClearAttachedCapturedPhotos: () => void;
  onAttachCapture: (captureId: string) => void;
}) {
  const bookmarkletCode = React.useMemo(createBrowserCaptureBookmarklet, []);
  const sourceListingUrl = getPropertySourceListingUrl(draft);
  const sourceWebsiteLabel = sourceListingUrl
    ? getSourceWebsiteLabel(sourceListingUrl)
    : "Source";
  const focusedCaptures = React.useMemo(
    () =>
      browserCaptures
        .filter((capture) => captureMatchesProperty(capture, draft))
        .map((capture) => ({
          capture,
          photoUrls: getFocusedCapturePhotoUrls(capture, draft)
        }))
        .sort(
          (a, b) =>
            new Date(b.capture.capturedAt).getTime() -
            new Date(a.capture.capturedAt).getTime()
        ),
    [browserCaptures, draft]
  );

  return (
    <div className="grid min-w-0 max-w-full gap-5 overflow-hidden">
      <Section
        title="Source Listing"
        action={
          sourceListingUrl ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href={sourceListingUrl}
                target="_blank"
                rel="noreferrer"
                title={`Open ${sourceWebsiteLabel} listing in a new tab`}
              >
                <LinkIcon aria-hidden="true" />
                Open {sourceWebsiteLabel}
              </a>
            </Button>
          ) : null
        }
      >
        {sourceListingUrl ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{sourceWebsiteLabel}</Badge>
              <a
                href={sourceListingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
                title={`Open ${sourceWebsiteLabel} listing in a new tab`}
              >
                {formatAddress(draft)}
              </a>
            </div>
            <a
              href={sourceListingUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              {sourceListingUrl}
            </a>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No Zillow or Realtor listing URL is saved for this property.
          </div>
        )}
      </Section>

      <Section
        title="Browser Capture"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{captureStatus}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopyBookmarklet}
            >
              <Clipboard aria-hidden="true" />
              Copy Link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearCaptures}
              disabled={isLoadingCaptures || browserCaptures.length === 0}
            >
              <Trash2 aria-hidden="true" />
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefreshCaptures}
              disabled={isLoadingCaptures}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(isLoadingCaptures && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        }
      >
        <div className="grid min-w-0 max-w-full gap-4">
          <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
              <div className="text-sm font-medium">Send to RE Assistant</div>
              <Badge variant="outline">bookmarklet</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Copy this code, create a browser bookmark named Send to RE
              Assistant, and paste the code into the bookmark URL. Click that
              bookmark on a visible Zillow or Realtor listing page.
            </div>
            <Textarea
              value={bookmarkletCode}
              readOnly
              rows={3}
              className="w-full min-w-0 max-w-full resize-y font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>

          {focusedCaptures.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              No browser captures match this property.
            </div>
          ) : (
            <div className="grid gap-3">
              {focusedCaptures.map(({ capture, photoUrls }) => {
                return (
                  <div
                    key={capture.id}
                    className="min-w-0 max-w-full overflow-hidden rounded-md border border-primary bg-card p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="success">Address match</Badge>
                          <Badge variant="outline">
                            {capture.sourceSite || "Unknown source"}
                          </Badge>
                          <Badge variant="outline">
                            {photoUrls.length} focused photo
                            {photoUrls.length === 1 ? "" : "s"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatCaptureDateTime(capture.capturedAt)}
                          </span>
                        </div>
                        <div className="mt-2 truncate text-sm font-medium">
                          {[
                            capture.addressLine1,
                            capture.city,
                            capture.state,
                            capture.postalCode
                          ]
                            .filter(Boolean)
                            .join(", ") || capture.title}
                        </div>
                        <a
                          href={capture.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-xs text-primary hover:underline"
                        >
                          {capture.pageUrl}
                        </a>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onAttachCapture(capture.id)}
                        disabled={photoUrls.length === 0}
                      >
                        <Plus aria-hidden="true" />
                        Attach
                      </Button>
                    </div>

                    {photoUrls.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        <div className="text-xs text-muted-foreground">
                          Showing all {photoUrls.length} focused-property
                          photos.
                        </div>
                        <div className="max-h-[24rem] max-w-full overflow-auto overscroll-contain rounded-md border border-border p-2">
                          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            {photoUrls.map((photoUrl) => (
                              <div
                                key={photoUrl}
                                className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-secondary"
                              >
                                <Image
                                  src={photoUrl}
                                  alt="Captured listing photo"
                                  fill
                                  sizes="160px"
                                  className="object-cover"
                                  loading="lazy"
                                  unoptimized
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ))}
                            </div>
                          </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Photo Evidence"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearAttachedCapturedPhotos}
            disabled={
              !draft.photoEvidence.some(
                (photo) => photo.sourceType === "browser_capture"
              ) && draft.sourceCaptures.length === 0
            }
          >
            <Trash2 aria-hidden="true" />
            Clear Captured
          </Button>
        }
      >
        {draft.photoEvidence.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No captured photo evidence is attached to this property.
          </div>
        ) : (
          <div className="grid min-w-0 max-w-full gap-3">
            <div className="max-h-[60vh] max-w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-border p-2">
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {draft.photoEvidence.map((photo) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-md border border-border bg-card"
                >
                  <div className="relative aspect-[4/3] bg-secondary">
                    <Image
                      src={photo.url}
                      alt={photo.label}
                      fill
                      sizes="220px"
                      className="object-cover"
                      loading="lazy"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="grid gap-1 p-2">
                    <div className="truncate text-xs font-medium">
                      {photo.label}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {photo.sourceSite || photo.sourceType}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>

            {draft.sourceCaptures.length > 0 ? (
              <div className="grid gap-2">
                {draft.sourceCaptures.map((capture) => (
                  <div
                    key={capture.id}
                    className="rounded-md border border-border bg-card p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{capture.sourceSite}</Badge>
                      <Badge variant="outline">
                        {capture.photoCount} photo
                        {capture.photoCount === 1 ? "" : "s"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatCaptureDateTime(capture.capturedAt)}
                      </span>
                    </div>
                    <a
                      href={capture.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block truncate text-xs text-primary hover:underline"
                    >
                      {capture.pageUrl}
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

function FactsTab({
  draft,
  addFact,
  removeFact,
  updateFact
}: {
  draft: PropertyRecord;
  addFact: () => void;
  removeFact: (factId: string) => void;
  updateFact: (id: string, patch: Partial<PropertyFact>) => void;
}) {
  return (
    <Section
      title="Flexible Facts"
      action={
        <Button type="button" variant="outline" size="sm" onClick={addFact}>
          <Plus aria-hidden="true" />
          Add Fact
        </Button>
      }
    >
      {draft.facts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          Add facts for setting, road exposure, utilities, driveway, views, and
          other observed details.
        </div>
      ) : (
        <div className="grid gap-3">
          {draft.facts.map((fact) => (
            <div
              key={fact.id}
              className="grid gap-3 rounded-md border border-border bg-card p-3 xl:grid-cols-[minmax(140px,1fr)_minmax(160px,1fr)_120px_150px_110px_80px_44px]"
            >
              <Field label="Label">
                <Input
                  value={fact.label}
                  onChange={(event) =>
                    updateFact(fact.id, { label: event.target.value })
                  }
                />
              </Field>
              <Field label="Fact Key">
                <Input
                  value={fact.factKey}
                  onChange={(event) =>
                    updateFact(fact.id, { factKey: event.target.value })
                  }
                />
              </Field>
              <Field label="Value">
                <Input
                  value={formatFactValue(fact.value)}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      value: parseFactValue(event.target.value)
                    })
                  }
                />
              </Field>
              <Field label="Source">
                <Select
                  value={fact.sourceType}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      sourceType: event.target.value as PropertyFactSourceType
                    })
                  }
                >
                  {propertyFactSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Confidence">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.05"
                  value={fact.confidence ?? ""}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      confidence: parseNullableFloat(event.target.value)
                    })
                  }
                />
              </Field>
              <Field label="Verified">
                <div className="flex h-10 items-center">
                  <Switch
                    checked={fact.verified}
                    onCheckedChange={(verified) =>
                      updateFact(fact.id, { verified })
                    }
                  />
                </div>
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeFact(fact.id)}
                  title="Remove fact"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <Field label="Source Reference" className="xl:col-span-7">
                <Input
                  value={fact.sourceReference}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      sourceReference: event.target.value
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

const renovationFactLabels = {
  low: "Low renovation estimate",
  expected: "Expected renovation cost",
  high: "High renovation estimate",
  contingencyPercent: "Renovation contingency percent",
  contingencyAmount: "Renovation contingency amount",
  closingCosts: "Closing and acquisition costs",
  projectedTotal: "Projected total investment"
};

type RenovationLineItem = {
  fact: PropertyFact;
  amount: number | null;
};

function getNumericFactValue(property: PropertyRecord, factKey: string) {
  const fact = property.facts.find((item) => item.factKey === factKey);

  return typeof fact?.value === "number" && Number.isFinite(fact.value)
    ? fact.value
    : null;
}

function upsertNumberFact(
  facts: PropertyFact[],
  factKey: string,
  label: string,
  value: number | null,
  sourceType: PropertyFactSourceType = "user_entered",
  sourceReference = "Financials"
) {
  if (value === null) {
    return facts.filter((fact) => fact.factKey !== factKey);
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);
  const observedAt = new Date().toISOString();

  if (existingFact) {
    return facts.map((fact) =>
      fact.id === existingFact.id
        ? {
            ...fact,
            label,
            value,
            sourceType,
            sourceReference,
            confidence: null,
            verified: false,
            observedAt
          }
        : fact
    );
  }

  return [
    ...facts,
    createPropertyFact({
      factKey,
      label,
      value,
      sourceType,
      sourceReference
    })
  ];
}

function getRenovationLineItems(property: PropertyRecord): RenovationLineItem[] {
  return property.facts
    .filter((fact) => fact.factKey.startsWith("renovation.line_item."))
    .map((fact) => ({
      fact,
      amount:
        typeof fact.value === "number" && Number.isFinite(fact.value)
          ? fact.value
          : null
    }));
}

function getRenovationLineItemTotal(property: PropertyRecord) {
  return getRenovationLineItems(property).reduce(
    (total, item) => total + (item.amount ?? 0),
    0
  );
}

function getCalculatedContingencyAmount(property: PropertyRecord) {
  const expected = getRenovationExpectedCost(property);
  const contingencyPercent = getNumericFactValue(
    property,
    "renovation.contingency_percent"
  );

  if (expected === null || contingencyPercent === null) {
    return null;
  }

  return Math.round(expected * (contingencyPercent / 100));
}

function refreshInvestmentFacts(property: PropertyRecord): PropertyRecord {
  const contingencyAmount = getCalculatedContingencyAmount(property);
  const basePrice = property.estimatedPurchasePrice ?? property.askingPrice;
  const expected = getRenovationExpectedCost(property);
  const projectedTotal =
    basePrice !== null && expected !== null
      ? basePrice +
        expected +
        (contingencyAmount ?? 0) +
        (getNumericFactValue(property, "finance.closing_costs") ?? 0)
      : null;
  let facts = upsertNumberFact(
    property.facts,
    "renovation.contingency_amount",
    renovationFactLabels.contingencyAmount,
    contingencyAmount,
    "api",
    "Financial model"
  );
  facts = upsertNumberFact(
    facts,
    "finance.projected_total_investment",
    renovationFactLabels.projectedTotal,
    projectedTotal,
    "api",
    "Financial model"
  );

  return {
    ...property,
    facts
  };
}

function FinancialsTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  const lowEstimate = getNumericFactValue(draft, "renovation.estimate_low");
  const expectedEstimate = getRenovationExpectedCost(draft);
  const highEstimate = getNumericFactValue(draft, "renovation.estimate_high");
  const contingencyPercent = getNumericFactValue(
    draft,
    "renovation.contingency_percent"
  );
  const contingencyAmount = getCalculatedContingencyAmount(draft);
  const closingCosts = getNumericFactValue(draft, "finance.closing_costs");
  const projectedTotal = getProjectedTotalInvestment(draft);
  const lineItems = getRenovationLineItems(draft);
  const lineItemTotal = getRenovationLineItemTotal(draft);

  function applyFinancialPatch(patch: Partial<PropertyRecord>) {
    const nextDraft = refreshInvestmentFacts({
      ...draft,
      ...patch
    });

    updateDraft(nextDraft);
  }

  function updateRenovationFact(
    factKey: string,
    label: string,
    value: number | null
  ) {
    const facts = upsertNumberFact(draft.facts, factKey, label, value);
    updateDraft(refreshInvestmentFacts({ ...draft, facts }));
  }

  function addLineItem() {
    const fact = createPropertyFact({
      factKey: `renovation.line_item.${Date.now()}`,
      label: "Renovation line item",
      value: 0,
      sourceType: "user_entered",
      sourceReference: "Renovation estimate"
    });

    updateDraft(refreshInvestmentFacts({ ...draft, facts: [...draft.facts, fact] }));
  }

  function updateLineItem(
    factId: string,
    patch: Partial<Pick<PropertyFact, "label" | "value">>
  ) {
    const observedAt = new Date().toISOString();

    updateDraft(
      refreshInvestmentFacts({
        ...draft,
        facts: draft.facts.map((fact) =>
          fact.id === factId
            ? {
                ...fact,
                ...patch,
                sourceType: "user_entered",
                sourceReference: "Renovation estimate",
                confidence: null,
                verified: false,
                observedAt
              }
            : fact
        )
      })
    );
  }

  function removeLineItem(factId: string) {
    updateDraft(
      refreshInvestmentFacts({
        ...draft,
        facts: draft.facts.filter((fact) => fact.id !== factId)
      })
    );
  }

  function useLineItemTotal() {
    updateRenovationFact(
      "renovation.expected_cost",
      renovationFactLabels.expected,
      lineItemTotal
    );
  }

  return (
    <div className="grid gap-5">
      <Section title="Purchase And Carrying Costs">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField
            label="Asking Price"
            value={draft.askingPrice}
            onChange={(askingPrice) => applyFinancialPatch({ askingPrice })}
          />
          <NumberField
            label="Estimated Purchase"
            value={draft.estimatedPurchasePrice}
            onChange={(estimatedPurchasePrice) =>
              applyFinancialPatch({ estimatedPurchasePrice })
            }
          />
          <NumberField
            label="Annual Property Tax"
            value={draft.annualPropertyTax}
            onChange={(annualPropertyTax) =>
              applyFinancialPatch({ annualPropertyTax })
            }
          />
          <NumberField
            label="HOA Fee"
            value={draft.hoaFee}
            onChange={(hoaFee) => applyFinancialPatch({ hoaFee })}
          />
          <NumberField
            label="Closing Costs"
            value={closingCosts}
            onChange={(value) =>
              updateRenovationFact(
                "finance.closing_costs",
                renovationFactLabels.closingCosts,
                value
              )
            }
          />
          <Field label="HOA Present">
            <Select
              value={
                draft.hoaPresent === null
                  ? "unknown"
                  : draft.hoaPresent
                    ? "yes"
                    : "no"
              }
              onChange={(event) =>
                applyFinancialPatch({
                  hoaPresent:
                    event.target.value === "unknown"
                      ? null
                      : event.target.value === "yes"
                })
              }
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Renovation Estimate">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <NumberField
            label="Low"
            value={lowEstimate}
            onChange={(value) =>
              updateRenovationFact(
                "renovation.estimate_low",
                renovationFactLabels.low,
                value
              )
            }
          />
          <NumberField
            label="Expected"
            value={expectedEstimate}
            onChange={(value) =>
              updateRenovationFact(
                "renovation.expected_cost",
                renovationFactLabels.expected,
                value
              )
            }
          />
          <NumberField
            label="High"
            value={highEstimate}
            onChange={(value) =>
              updateRenovationFact(
                "renovation.estimate_high",
                renovationFactLabels.high,
                value
              )
            }
          />
          <NumberField
            label="Contingency %"
            value={contingencyPercent}
            step="0.5"
            onChange={(value) =>
              updateRenovationFact(
                "renovation.contingency_percent",
                renovationFactLabels.contingencyPercent,
                value
              )
            }
          />
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Contingency
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatCurrency(contingencyAmount)}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Renovation Line Items"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={useLineItemTotal}
              disabled={lineItems.length === 0}
            >
              <BadgeDollarSign aria-hidden="true" />
              Use Total
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
              <Plus aria-hidden="true" />
              Add Item
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Line Item Total
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatCurrency(lineItemTotal)}
            </div>
          </div>
          {lineItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              No renovation line items recorded.
            </div>
          ) : (
            <div className="grid gap-3">
              {lineItems.map((item) => (
                <div
                  key={item.fact.id}
                  className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(0,1fr)_160px_44px]"
                >
                  <Field label="Item">
                    <Input
                      value={item.fact.label}
                      onChange={(event) =>
                        updateLineItem(item.fact.id, {
                          label: event.target.value
                        })
                      }
                    />
                  </Field>
                  <NumberField
                    label="Amount"
                    value={item.amount}
                    onChange={(value) =>
                      updateLineItem(item.fact.id, { value })
                    }
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeLineItem(item.fact.id)}
                      title="Remove line item"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Projected Total Investment">
        <div className="grid gap-3 md:grid-cols-4">
          <InvestmentMetric
            label="Purchase"
            value={draft.estimatedPurchasePrice ?? draft.askingPrice}
          />
          <InvestmentMetric label="Renovation" value={expectedEstimate} />
          <InvestmentMetric label="Contingency" value={contingencyAmount} />
          <InvestmentMetric label="Closing Costs" value={closingCosts} />
          <InvestmentMetric label="Projected Total" value={projectedTotal} />
        </div>
      </Section>
    </div>
  );
}

function InvestmentMetric({
  label,
  value
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{formatCurrency(value)}</div>
    </div>
  );
}

function SystemsTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <Section title="Systems And Utilities">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NumberField
          label="Garage Spaces"
          value={draft.garageSpaces}
          onChange={(garageSpaces) => updateDraft({ garageSpaces })}
        />
        <Field label="Heating Type">
          <Input
            value={draft.heatingType}
            onChange={(event) =>
              updateDraft({ heatingType: event.target.value })
            }
          />
        </Field>
        <Field label="Water Source">
          <Input
            value={draft.waterSource}
            onChange={(event) =>
              updateDraft({ waterSource: event.target.value })
            }
          />
        </Field>
        <Field label="Sewer Type">
          <Input
            value={draft.sewerType}
            onChange={(event) => updateDraft({ sewerType: event.target.value })}
          />
        </Field>
      </div>
    </Section>
  );
}

function NotesTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Listing Remarks">
        <Textarea
          value={draft.listingRemarks}
          onChange={(event) =>
            updateDraft({ listingRemarks: event.target.value })
          }
        />
      </Section>
      <Section title="Private Notes">
        <Textarea
          value={draft.notes}
          onChange={(event) => updateDraft({ notes: event.target.value })}
        />
      </Section>
    </div>
  );
}

function ScoringTab({
  activeProfileName,
  evaluation
}: {
  activeProfileName: string | null;
  evaluation: ScoreEvaluation | undefined;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Score Evaluation">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {activeProfileName ?? "No active profile"}
          </Badge>
        </div>
        {evaluation ? (
          <ScoreEvaluationPanel evaluation={evaluation} />
        ) : (
          <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No score evaluation has been saved for this property and active profile.
          </div>
        )}
      </Section>
    </div>
  );
}

function DiagnosticsTab({
  diagnostics
}: {
  diagnostics: PropertyEnrichmentDiagnostic[];
}) {
  const latestAt = diagnostics[0]?.at ?? null;
  const statusVariant: Record<
    PropertyEnrichmentDiagnostic["status"],
    React.ComponentProps<typeof Badge>["variant"]
  > = {
    started: "secondary",
    success: "success",
    warning: "warning",
    skipped: "outline",
    failed: "destructive",
    info: "secondary"
  };

  return (
    <div className="grid gap-5">
      <Section title="Enrichment Diagnostics">
        {diagnostics.length > 0 ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Last run {latestAt ? formatEvaluationDateTime(latestAt) : "unknown"}
              </Badge>
              <Badge variant="secondary">{diagnostics.length} steps</Badge>
            </div>
            <div className="grid gap-3">
              {diagnostics.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant[item.status]}>
                      {item.status}
                    </Badge>
                    <span className="text-sm font-semibold">{item.stage}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatEvaluationDateTime(item.at)}
                    </span>
                  </div>
                  <div className="text-sm text-foreground">{item.message}</div>
                  {item.detail ? (
                    <div className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                      {item.detail}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No enrichment diagnostics have been recorded for this property.
          </div>
        )}
      </Section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
  min = 0
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: string;
  min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={(event) => {
          const parsed =
            step === "1"
              ? parseNullableInteger(event.target.value)
              : parseNullableFloat(event.target.value);
          onChange(parsed);
        }}
      />
    </Field>
  );
}
