"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import {
  BadgeDollarSign,
  BarChart3,
  FileText,
  Home,
  LinkIcon,
  MapPin,
  Plus,
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
import { listingCandidateEnrichmentResponseSchema } from "@/lib/listing-alerts/listing-enrichment";
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
  type PropertyFact,
  type PropertyFactSourceType,
  type PropertyRecord,
  type PropertyState,
  lifecycleStatusOptions,
  listingStatusOptions,
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
import type { ScoreEvaluation, ScoreEvaluationState } from "@/lib/scoring/types";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "facts"
  | "financials"
  | "systems"
  | "notes"
  | "scoring";

const tabs: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "facts", label: "Facts", icon: Search },
  { id: "financials", label: "Financials", icon: BadgeDollarSign },
  { id: "systems", label: "Systems", icon: Wrench },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "scoring", label: "Scoring", icon: BarChart3 }
];

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

function formatEvaluationDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
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

function createPropertyEnrichmentCandidate(property: PropertyRecord) {
  return {
    id: property.id,
    listingUrl: property.listingUrl.trim(),
    addressLine1: property.addressLine1,
    city: property.city,
    state: property.state,
    postalCode: property.postalCode,
    askingPrice: property.askingPrice,
    primaryPhotoUrl: property.primaryPhotoUrl,
    photoUrls: property.photoUrls
  };
}

function mergeEnrichmentIntoProperty(
  property: PropertyRecord,
  enrichment: ReturnType<typeof listingCandidateEnrichmentResponseSchema.parse>
) {
  const shouldApplyPrice =
    property.askingPrice === null && enrichment.updates.askingPrice !== null;
  const shouldApplyPhoto =
    !property.primaryPhotoUrl && Boolean(enrichment.updates.primaryPhotoUrl);
  const primaryPhotoUrl = shouldApplyPhoto
    ? enrichment.updates.primaryPhotoUrl
    : property.primaryPhotoUrl;
  const photoUrls = Array.from(
    new Set([
      ...(primaryPhotoUrl ? [primaryPhotoUrl] : []),
      ...enrichment.updates.photoUrls,
      ...property.photoUrls
    ])
  );

  return {
    property: refreshInvestmentFacts({
      ...property,
      askingPrice: shouldApplyPrice
        ? enrichment.updates.askingPrice
        : property.askingPrice,
      primaryPhotoUrl,
      photoUrls,
      updatedAt:
        shouldApplyPrice || shouldApplyPhoto
          ? enrichment.fetchedAt
          : property.updatedAt
    }),
    changed: shouldApplyPrice || shouldApplyPhoto,
    appliedFields: [
      shouldApplyPrice ? "price" : null,
      shouldApplyPhoto ? "photo" : null
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
    return {
      property,
      changed: false
    };
  }

  const routeReference =
    driveTime.origin && driveTime.destination
      ? `${driveTime.origin.label} to ${driveTime.destination.label}`
      : "Calculated commute route";
  let facts = upsertSourcedNumberFact(
    property.facts,
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
  const [isCalculatingDriveTime, setIsCalculatingDriveTime] =
    React.useState(false);
  const [loadSource, setLoadSource] = React.useState<"storage" | "empty" | "reset">(
    "empty"
  );
  const [saveStatus, setSaveStatus] = React.useState("Ready");

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

  const selectedProperty = React.useMemo(
    () =>
      propertyState.properties.find(
        (property) => property.id === selectedPropertyId
      ) ?? null,
    [propertyState.properties, selectedPropertyId]
  );
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

    persistState(upsertProperty(propertyState, draft), draft.id);
  }

  function handleEvaluate() {
    if (!draft || !activeProfile) {
      return;
    }

    const savedPropertyState = upsertProperty(propertyState, draft);
    const evaluation = evaluateProperty(draft, activeProfile);
    const nextScoreState = addScoreEvaluation(scoreState, evaluation);
    const persistedScores = saveScoreState(window.localStorage, nextScoreState);

    setScoreState(persistedScores);
    persistState(savedPropertyState, draft.id);
    setSaveStatus("Scored");
    setActiveTab("scoring");
  }

  async function handleEnrichProperty() {
    if (!draft || !draft.listingUrl.trim()) {
      return;
    }

    setIsEnrichingProperty(true);
    setSaveStatus("Enriching");

    try {
      const response = await fetch("/api/listing-alerts/enrich-listing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          candidate: createPropertyEnrichmentCandidate(draft)
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to enrich property.";
        throw new Error(message);
      }

      const enrichment = listingCandidateEnrichmentResponseSchema.parse(payload);
      const merged = mergeEnrichmentIntoProperty(draft, enrichment);
      const nextPropertyState = upsertProperty(propertyState, merged.property);
      const persistedState = savePropertyState(
        window.localStorage,
        nextPropertyState
      );

      setPropertyState(persistedState);
      setDraft(cloneProperty(merged.property));
      setSelectedPropertyId(merged.property.id);
      setLoadSource("storage");

      if (activeProfile) {
        const evaluation = evaluateProperty(merged.property, activeProfile);
        const nextScoreState = addScoreEvaluation(scoreState, evaluation);
        const persistedScores = saveScoreState(
          window.localStorage,
          nextScoreState
        );

        setScoreState(persistedScores);
        setActiveTab("scoring");
      }

      const warningSuffix =
        enrichment.warnings.length > 0
          ? ` (${enrichment.warnings.length} warning${
              enrichment.warnings.length === 1 ? "" : "s"
            })`
          : "";

      setSaveStatus(
        merged.changed
          ? `Enriched ${merged.appliedFields.join(", ")}${warningSuffix}`
          : `No new data${warningSuffix}`
      );
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Enrich failed");
    } finally {
      setIsEnrichingProperty(false);
    }
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

      if (!merged.changed) {
        setSaveStatus(
          driveTime.warnings.length > 0
            ? driveTime.warnings.join(" ")
            : "No drive time calculated"
        );
        return;
      }

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
      setSaveStatus(
        `Drive time ${driveTime.driveTimeMinutes} min${
          driveTime.warnings.length > 0
            ? ` (${driveTime.warnings.length} warning${
                driveTime.warnings.length === 1 ? "" : "s"
              })`
            : ""
        }`
      );
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
          <Badge variant={isDirty ? "warning" : "success"}>{saveStatus}</Badge>
          <Button type="button" variant="outline" onClick={handleResetAll}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={handleNewProperty}>
            <Plus aria-hidden="true" />
            New
          </Button>
          <Button type="button" onClick={handleSave} disabled={!draft || !isDirty}>
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
                  variant="outline"
                  onClick={handleEvaluate}
                  disabled={!draft || !activeProfile}
                >
                  <BarChart3 aria-hidden="true" />
                  Evaluate
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
                {activeTab === "scoring" ? (
                  <ScoringTab
                    activeProfileName={activeProfile?.name ?? null}
                    evaluation={latestEvaluation}
                    onEvaluate={handleEvaluate}
                    canEvaluate={Boolean(activeProfile)}
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
  value: number | null
) {
  if (value === null) {
    return facts.filter((fact) => fact.factKey !== factKey);
  }

  const existingFact = facts.find((fact) => fact.factKey === factKey);

  if (existingFact) {
    return facts.map((fact) =>
      fact.id === existingFact.id ? { ...fact, label, value } : fact
    );
  }

  return [
    ...facts,
    createPropertyFact({
      factKey,
      label,
      value,
      sourceType: "user_entered",
      sourceReference: "Financials"
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
    contingencyAmount
  );
  facts = upsertNumberFact(
    facts,
    "finance.projected_total_investment",
    renovationFactLabels.projectedTotal,
    projectedTotal
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
    updateDraft(
      refreshInvestmentFacts({
        ...draft,
        facts: draft.facts.map((fact) =>
          fact.id === factId ? { ...fact, ...patch } : fact
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
  evaluation,
  onEvaluate,
  canEvaluate
}: {
  activeProfileName: string | null;
  evaluation: ScoreEvaluation | undefined;
  onEvaluate: () => void;
  canEvaluate: boolean;
}) {
  return (
    <div className="grid gap-5">
      <Section
        title="Score Evaluation"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEvaluate}
            disabled={!canEvaluate}
          >
            <BarChart3 aria-hidden="true" />
            Evaluate
          </Button>
        }
      >
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
