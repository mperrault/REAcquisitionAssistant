"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  DollarSign,
  Home,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PROFILE_STORAGE_KEY,
  archiveProfile,
  createDefaultProfileState,
  duplicateProfile,
  loadProfileState,
  saveProfileState,
  setActiveProfile,
  upsertProfile
} from "@/lib/profiles/profile-persistence";
import type {
  CategoryWeight,
  FeaturePreference,
  ProfileCategory,
  ProfileState,
  ScoreThreshold,
  SearchProfile,
  TownPreference
} from "@/lib/profiles/types";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "geography"
  | "budget"
  | "priorities"
  | "deal_breakers"
  | "score_bands";

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "geography", label: "Geography", icon: MapPin },
  { id: "budget", label: "Budget", icon: DollarSign },
  { id: "priorities", label: "Scoring Priorities", icon: SlidersHorizontal },
  { id: "deal_breakers", label: "Deal Breakers", icon: ShieldAlert },
  { id: "score_bands", label: "Score Bands", icon: SlidersHorizontal }
];

const featureGroups: Array<{ category: ProfileCategory; label: string }> = [
  { category: "setting", label: "Setting & Views" },
  { category: "style", label: "House Style" },
  { category: "financial", label: "Financial Value" },
  { category: "resale", label: "Resale Signals" },
  { category: "renovation", label: "Renovation Fit" },
  { category: "utility", label: "Systems & Utilities" },
  { category: "maintenance", label: "Maintenance Burden" },
  { category: "location", label: "Location Signals" },
  { category: "risk", label: "Risk Penalties" }
];

type PreferenceImpact =
  | "strong_bonus"
  | "bonus"
  | "small_bonus"
  | "penalty"
  | "ignore";

const preferenceImpacts: Array<{ value: PreferenceImpact; label: string }> = [
  { value: "strong_bonus", label: "Strong reward" },
  { value: "bonus", label: "Reward" },
  { value: "small_bonus", label: "Small reward" },
  { value: "penalty", label: "Penalty" },
  { value: "ignore", label: "Ignore" }
];

const profileCategories: Array<{ value: ProfileCategory; label: string }> = [
  { value: "location", label: "Location" },
  { value: "setting", label: "Setting" },
  { value: "style", label: "Style" },
  { value: "renovation", label: "Renovation" },
  { value: "financial", label: "Financial" },
  { value: "resale", label: "Resale" },
  { value: "maintenance", label: "Maintenance" },
  { value: "risk", label: "Risk" },
  { value: "utility", label: "Utility" }
];

const categoryHelp: Record<ProfileCategory, string> = {
  location: "Town fit and commute distance.",
  setting: "Water, views, privacy, acreage, and scarce setting.",
  style: "House character and architectural fit.",
  renovation: "Condition burden and expected renovation cost.",
  financial: "Budget fit and price per square foot.",
  resale: "Comparable-sales support and exit spread.",
  maintenance: "Ownership burden items such as garage or upkeep issues.",
  risk: "Nuisances, insurance risk, and deal-risk facts.",
  utility: "Heating, water, sewer, driveway, and utility systems."
};

const maxScoreWeightTotal = 100;

function parseInteger(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNullableInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableFloat(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneProfile(profile: SearchProfile): SearchProfile {
  return JSON.parse(JSON.stringify(profile)) as SearchProfile;
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

function getPreferenceImpact(preference: FeaturePreference): PreferenceImpact {
  if (!preference.enabled || preference.mode === "neutral") {
    return "ignore";
  }

  if (preference.mode === "penalty") {
    return "penalty";
  }

  if (preference.weight >= 10) {
    return "strong_bonus";
  }

  if (preference.weight >= 4) {
    return "bonus";
  }

  return "small_bonus";
}

function patchForPreferenceImpact(
  impact: PreferenceImpact
): Partial<FeaturePreference> {
  if (impact === "strong_bonus") {
    return { enabled: true, mode: "bonus", weight: 12 };
  }

  if (impact === "bonus") {
    return { enabled: true, mode: "bonus", weight: 6 };
  }

  if (impact === "small_bonus") {
    return { enabled: true, mode: "bonus", weight: 2 };
  }

  if (impact === "penalty") {
    return { enabled: true, mode: "penalty", weight: -6 };
  }

  return { enabled: false, mode: "neutral", weight: 0 };
}

function formatCategoryShare(weight: CategoryWeight, totalWeight: number) {
  if (!weight.enabled || weight.weight <= 0 || totalWeight <= 0) {
    return "Off";
  }

  return `${Math.round((weight.weight / totalWeight) * 100)}%`;
}

function getAssignedCategoryWeight(categoryWeights: CategoryWeight[]) {
  return categoryWeights.reduce(
    (total, weight) => total + (weight.enabled ? weight.weight : 0),
    0
  );
}

function getCategoryWeightLimit(
  categoryWeights: CategoryWeight[],
  categoryWeight: CategoryWeight
) {
  const otherAssignedWeight = categoryWeights.reduce(
    (total, weight) =>
      weight.id === categoryWeight.id || !weight.enabled
        ? total
        : total + weight.weight,
    0
  );

  return Math.max(0, maxScoreWeightTotal - otherAssignedWeight);
}

function normalizeCategoryWeights(categoryWeights: CategoryWeight[]) {
  const activeWeights = categoryWeights.filter(
    (weight) => weight.enabled && weight.weight > 0
  );
  const activeTotal = getAssignedCategoryWeight(activeWeights);

  if (activeTotal <= 0) {
    return categoryWeights;
  }

  const normalizedRows = activeWeights.map((weight) => {
    const exactWeight = (weight.weight / activeTotal) * maxScoreWeightTotal;

    return {
      id: weight.id,
      baseWeight: Math.floor(exactWeight),
      remainder: exactWeight - Math.floor(exactWeight)
    };
  });
  let remainingPoints =
    maxScoreWeightTotal -
    normalizedRows.reduce((total, row) => total + row.baseWeight, 0);
  const extrasById = new Map<string, number>();

  normalizedRows
    .slice()
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((row) => {
      const extra = remainingPoints > 0 ? 1 : 0;
      extrasById.set(row.id, extra);
      remainingPoints -= extra;
    });

  const baseWeightsById = new Map(
    normalizedRows.map((row) => [row.id, row.baseWeight])
  );

  return categoryWeights.map((weight) => {
    if (!baseWeightsById.has(weight.id)) {
      return { ...weight, weight: 0, enabled: false };
    }

    const nextWeight =
      (baseWeightsById.get(weight.id) ?? 0) + (extrasById.get(weight.id) ?? 0);

    return {
      ...weight,
      weight: nextWeight,
      enabled: nextWeight > 0
    };
  });
}

function profileFingerprint(profile: SearchProfile | null) {
  return profile ? JSON.stringify(profile) : "";
}

export function SearchProfileEditor() {
  const [profileState, setProfileState] = React.useState<ProfileState>(() =>
    createDefaultProfileState()
  );
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(
    profileState.activeProfileId
  );
  const [draft, setDraft] = React.useState<SearchProfile | null>(
    cloneProfile(profileState.profiles[0])
  );
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [loadSource, setLoadSource] = React.useState<"storage" | "seed" | "reset">(
    "seed"
  );
  const [saveStatus, setSaveStatus] = React.useState("Ready");

  React.useEffect(() => {
    const result = loadProfileState(window.localStorage);
    setProfileState(result.state);
    setLoadSource(result.source);
    const selectedId = result.state.activeProfileId ?? result.state.profiles[0]?.id ?? null;
    setSelectedProfileId(selectedId);
    const selected = result.state.profiles.find((profile) => profile.id === selectedId);
    setDraft(selected ? cloneProfile(selected) : null);
  }, []);

  const selectedProfile = React.useMemo(
    () => profileState.profiles.find((profile) => profile.id === selectedProfileId),
    [profileState.profiles, selectedProfileId]
  );

  const visibleProfiles = profileState.profiles.filter(
    (profile) => !profile.isArchived
  );
  const hasMultipleVisibleProfiles = visibleProfiles.length > 1;

  const isDirty =
    profileFingerprint(draft) !== profileFingerprint(selectedProfile ?? null);

  const totalCategoryWeight =
    draft?.categoryWeights.reduce(
      (total, weight) => total + (weight.enabled ? weight.weight : 0),
      0
    ) ?? 0;
  const hardRejectCount =
    draft?.featurePreferences.filter(
      (feature) => feature.enabled && feature.mode === "hard_reject"
    ).length ?? 0;

  function replaceDraft(next: SearchProfile) {
    setDraft(next);
    setSaveStatus("Unsaved changes");
  }

  function updateDraft(patch: Partial<SearchProfile>) {
    if (!draft) {
      return;
    }

    replaceDraft({ ...draft, ...patch });
  }

  function updateTownPreference(id: string, patch: Partial<TownPreference>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      townPreferences: draft.townPreferences.map((preference) =>
        preference.id === id ? { ...preference, ...patch } : preference
      )
    });
  }

  function updateFeaturePreference(id: string, patch: Partial<FeaturePreference>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      featurePreferences: draft.featurePreferences.map((preference) =>
        preference.id === id ? { ...preference, ...patch } : preference
      )
    });
  }

  function updateCategoryWeight(id: string, patch: Partial<CategoryWeight>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      categoryWeights: draft.categoryWeights.map((weight) =>
        weight.id === id ? { ...weight, ...patch } : weight
      )
    });
  }

  function updateScoreThreshold(id: string, patch: Partial<ScoreThreshold>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      scoreThresholds: draft.scoreThresholds.map((threshold) =>
        threshold.id === id ? { ...threshold, ...patch } : threshold
      )
    });
  }

  function persistState(nextState: ProfileState, nextSelectedId?: string | null) {
    const persisted = saveProfileState(window.localStorage, nextState);
    setProfileState(persisted);

    const targetSelectedId =
      nextSelectedId ?? persisted.activeProfileId ?? persisted.profiles[0]?.id ?? null;
    setSelectedProfileId(targetSelectedId);
    const nextSelected = persisted.profiles.find(
      (profile) => profile.id === targetSelectedId
    );
    setDraft(nextSelected ? cloneProfile(nextSelected) : null);
    setSaveStatus("Saved");
  }

  function handleSelectProfile(profileId: string) {
    const profile = profileState.profiles.find((item) => item.id === profileId);

    if (!profile) {
      return;
    }

    setSelectedProfileId(profileId);
    setDraft(cloneProfile(profile));
    setSaveStatus("Ready");
  }

  function handleSave() {
    if (!draft) {
      return;
    }

    persistState(upsertProfile(profileState, draft), draft.id);
  }

  function handleSetActive() {
    if (!draft) {
      return;
    }

    const savedState = isDirty ? upsertProfile(profileState, draft) : profileState;
    persistState(setActiveProfile(savedState, draft.id), draft.id);
  }

  function handleDuplicate() {
    if (!draft) {
      return;
    }

    const nextState = duplicateProfile(profileState, draft.id);
    const duplicate = nextState.profiles[nextState.profiles.length - 1];
    persistState(nextState, duplicate?.id ?? draft.id);
  }

  function handleArchive() {
    if (!draft) {
      return;
    }

    const nextState = archiveProfile(profileState, draft.id);
    persistState(nextState, nextState.activeProfileId);
  }

  function handleResetSeed() {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    const resetState = createDefaultProfileState();
    saveProfileState(window.localStorage, resetState);
    setProfileState(resetState);
    setSelectedProfileId(resetState.activeProfileId);
    setDraft(cloneProfile(resetState.profiles[0]));
    setLoadSource("seed");
    setSaveStatus("Seed restored");
  }

  function handleAddTown() {
    if (!draft) {
      return;
    }

    const rank =
      Math.max(0, ...draft.townPreferences.map((preference) => preference.rank)) + 1;
    replaceDraft({
      ...draft,
      townPreferences: [
        ...draft.townPreferences,
        {
          id: `town-custom-${Date.now()}`,
          town: "New Town",
          state: "CT",
          rank,
          tier: 3,
          weight: 0,
          enabled: true
        }
      ]
    });
  }

  function handleAddFeature(category: ProfileCategory) {
    if (!draft) {
      return;
    }

    const rank =
      Math.max(
        0,
        ...draft.featurePreferences
          .filter((preference) => preference.category === category)
          .map((preference) => preference.rank ?? 0)
      ) + 1;

    replaceDraft({
      ...draft,
      featurePreferences: [
        ...draft.featurePreferences,
        {
          id: `feature-custom-${Date.now()}`,
          featureKey: `${category}.custom_${Date.now()}`,
          featureLabel: "New Preference",
          category,
          rank,
          weight: 0,
          mode: "neutral",
          enabled: true
        }
      ]
    });
  }

  function handleAddDealBreaker() {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      featurePreferences: [
        ...draft.featurePreferences,
        {
          id: `feature-deal-breaker-${Date.now()}`,
          featureKey: `risk.custom_${Date.now()}`,
          featureLabel: "New Deal Breaker",
          category: "risk",
          rank: null,
          weight: -100,
          mode: "hard_reject",
          enabled: true
        }
      ]
    });
  }

  function handleAddThreshold() {
    if (!draft) {
      return;
    }

    const sortOrder =
      Math.max(0, ...draft.scoreThresholds.map((threshold) => threshold.sortOrder)) +
      1;

    replaceDraft({
      ...draft,
      scoreThresholds: [
        ...draft.scoreThresholds,
        {
          id: `threshold-custom-${Date.now()}`,
          label: "New Label",
          minimumScore: 50,
          sortOrder
        }
      ]
    });
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Milestone 1</Badge>
            <Badge variant={loadSource === "storage" ? "success" : "warning"}>
              {loadSource === "storage" ? "Local Data" : "Seed Data"}
            </Badge>
            <Badge variant="outline">v{draft?.version ?? 1}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Scoring Settings
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure the active acquisition scoring setup, including weights,
            value criteria, deal breakers, and score labels.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDirty ? "warning" : "success"}>{saveStatus}</Badge>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetSeed}
            title="Restore seed profile"
          >
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!draft || !isDirty}
            title="Save profile"
          >
            <Save aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-md border border-border bg-card p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Scoring Setup</h2>
              <p className="text-xs text-muted-foreground">
                {hasMultipleVisibleProfiles
                  ? `${visibleProfiles.length} saved configurations`
                  : "Single active configuration"}
              </p>
            </div>
            {hasMultipleVisibleProfiles ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={!draft}
                title="Duplicate selected configuration"
              >
                <Copy aria-hidden="true" />
                Copy
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            {visibleProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelectProfile(profile.id)}
                className={cn(
                  "w-full rounded-md border p-3 text-left transition-colors",
                  profile.id === selectedProfileId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-secondary/70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {profile.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      Updated {new Date(profile.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {profile.isActive ? (
                    <CheckCircle2
                      className="size-4 shrink-0 text-primary"
                      aria-label="Active"
                    />
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Category Weight" value={totalCategoryWeight.toString()} />
            <Metric label="Hard Rejects" value={hardRejectCount.toString()} />
            <Metric
              label="Target Project"
              value={formatCurrency(draft?.budget.totalProjectBudgetTarget ?? null)}
            />
            <Metric
              label="Max Drive"
              value={`${draft?.commute.maxMinutes ?? 0} min`}
            />
          </div>
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card shadow-soft">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">
                  {draft?.name ?? "No scoring setup selected"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={draft?.isActive ? "success" : "outline"}>
                    {draft?.isActive ? "Active Setup" : "Inactive Setup"}
                  </Badge>
                  <Badge variant="outline">
                    {draft?.townPreferences.length ?? 0} towns
                  </Badge>
                  <Badge variant="outline">
                    {draft?.featurePreferences.length ?? 0} rules
                  </Badge>
                </div>
              </div>
              {hasMultipleVisibleProfiles ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSetActive}
                    disabled={!draft || draft.isActive}
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Set Active
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleArchive}
                    disabled={!draft}
                  >
                    <Archive aria-hidden="true" />
                    Archive
                  </Button>
                </div>
              ) : null}
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
              <EmptyState />
            ) : (
              <>
                {activeTab === "overview" ? (
                  <OverviewTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "geography" ? (
                  <GeographyTab
                    draft={draft}
                    updateDraft={updateDraft}
                    updateTownPreference={updateTownPreference}
                    addTown={handleAddTown}
                  />
                ) : null}
                {activeTab === "budget" ? (
                  <BudgetTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "priorities" ? (
                  <ScoringPrioritiesTab
                    draft={draft}
                    updateDraft={updateDraft}
                    updateCategoryWeight={updateCategoryWeight}
                    updateFeaturePreference={updateFeaturePreference}
                    addFeature={handleAddFeature}
                  />
                ) : null}
                {activeTab === "deal_breakers" ? (
                  <DealBreakersTab
                    draft={draft}
                    updateFeaturePreference={updateFeaturePreference}
                    addDealBreaker={handleAddDealBreaker}
                  />
                ) : null}
                {activeTab === "score_bands" ? (
                  <ScoreBandsTab
                    draft={draft}
                    updateScoreThreshold={updateScoreThreshold}
                    addThreshold={handleAddThreshold}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background p-8 text-center">
      <Search className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm font-medium">No scoring setup selected</div>
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
  draft: SearchProfile;
  updateDraft: (patch: Partial<SearchProfile>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Scoring Setup">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Setup Name">
            <Input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
            />
          </Field>
          <Field label="Renovation Tolerance">
            <Input
              value={draft.renovationTolerance}
              onChange={(event) =>
                updateDraft({ renovationTolerance: event.target.value })
              }
            />
          </Field>
          <Field label="Description" className="lg:col-span-2">
            <Textarea
              value={draft.description}
              onChange={(event) =>
                updateDraft({ description: event.target.value })
              }
            />
          </Field>
          <Field label="Strategy" className="lg:col-span-2">
            <Textarea
              value={draft.strategy}
              onChange={(event) => updateDraft({ strategy: event.target.value })}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function GeographyTab({
  draft,
  updateDraft,
  updateTownPreference,
  addTown
}: {
  draft: SearchProfile;
  updateDraft: (patch: Partial<SearchProfile>) => void;
  updateTownPreference: (id: string, patch: Partial<TownPreference>) => void;
  addTown: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Commute">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Anchor Label" className="md:col-span-2">
            <Input
              value={draft.commute.anchorLabel}
              onChange={(event) =>
                updateDraft({
                  commute: { ...draft.commute, anchorLabel: event.target.value }
                })
              }
            />
          </Field>
          <Field label="Anchor Address" className="md:col-span-2 xl:col-span-4">
            <Input
              value={draft.commute.anchorAddress}
              placeholder="Street address, town, state"
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    anchorAddress: event.target.value
                  }
                })
              }
            />
          </Field>
          <Field label="Latitude">
            <Input
              type="number"
              value={draft.commute.anchorLat ?? ""}
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    anchorLat: parseNullableFloat(event.target.value)
                  }
                })
              }
            />
          </Field>
          <Field label="Longitude">
            <Input
              type="number"
              value={draft.commute.anchorLng ?? ""}
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    anchorLng: parseNullableFloat(event.target.value)
                  }
                })
              }
            />
          </Field>
          <Field label="Ideal Minutes">
            <Input
              type="number"
              min={0}
              value={draft.commute.idealMinutes}
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    idealMinutes: parseInteger(event.target.value)
                  }
                })
              }
            />
          </Field>
          <Field label="Preferred Minutes">
            <Input
              type="number"
              min={0}
              value={draft.commute.preferredMinutes}
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    preferredMinutes: parseInteger(event.target.value)
                  }
                })
              }
            />
          </Field>
          <Field label="Max Minutes">
            <Input
              type="number"
              min={0}
              value={draft.commute.maxMinutes}
              onChange={(event) =>
                updateDraft({
                  commute: {
                    ...draft.commute,
                    maxMinutes: parseInteger(event.target.value)
                  }
                })
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Town Ranking"
        action={
          <Button type="button" variant="outline" size="sm" onClick={addTown}>
            <Plus aria-hidden="true" />
            Add Town
          </Button>
        }
      >
        <div className="grid gap-3">
          {draft.townPreferences
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((preference) => (
              <div
                key={preference.id}
                className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(160px,1.5fr)_70px_80px_80px_100px_80px]"
              >
                <Field label="Town">
                  <Input
                    value={preference.town}
                    onChange={(event) =>
                      updateTownPreference(preference.id, {
                        town: event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="State">
                  <Input
                    value={preference.state}
                    maxLength={2}
                    onChange={(event) =>
                      updateTownPreference(preference.id, {
                        state: event.target.value.toUpperCase()
                      })
                    }
                  />
                </Field>
                <Field label="Rank">
                  <Input
                    type="number"
                    min={1}
                    value={preference.rank}
                    onChange={(event) =>
                      updateTownPreference(preference.id, {
                        rank: parseInteger(event.target.value, 1)
                      })
                    }
                  />
                </Field>
                <Field label="Tier">
                  <Input
                    type="number"
                    min={1}
                    value={preference.tier}
                    onChange={(event) =>
                      updateTownPreference(preference.id, {
                        tier: parseInteger(event.target.value, 1)
                      })
                    }
                  />
                </Field>
                <Field label="Weight">
                  <Input
                    type="number"
                    value={preference.weight}
                    onChange={(event) =>
                      updateTownPreference(preference.id, {
                        weight: parseInteger(event.target.value)
                      })
                    }
                  />
                </Field>
                <Field label="Enabled">
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={preference.enabled}
                      onCheckedChange={(enabled) =>
                        updateTownPreference(preference.id, { enabled })
                      }
                    />
                  </div>
                </Field>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

function BudgetTab({
  draft,
  updateDraft
}: {
  draft: SearchProfile;
  updateDraft: (patch: Partial<SearchProfile>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Budget Settings">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MoneyField
            label="Purchase Target"
            value={draft.budget.purchasePriceTarget}
            onChange={(purchasePriceTarget) =>
              updateDraft({
                budget: { ...draft.budget, purchasePriceTarget }
              })
            }
          />
          <MoneyField
            label="Purchase Max"
            value={draft.budget.purchasePriceMax}
            onChange={(purchasePriceMax) =>
              updateDraft({
                budget: { ...draft.budget, purchasePriceMax }
              })
            }
          />
          <MoneyField
            label="Renovation Target"
            value={draft.budget.renovationBudgetTarget}
            onChange={(renovationBudgetTarget) =>
              updateDraft({
                budget: { ...draft.budget, renovationBudgetTarget }
              })
            }
          />
          <MoneyField
            label="Renovation Max"
            value={draft.budget.renovationBudgetMax}
            onChange={(renovationBudgetMax) =>
              updateDraft({
                budget: { ...draft.budget, renovationBudgetMax }
              })
            }
          />
          <MoneyField
            label="Total Project Target"
            value={draft.budget.totalProjectBudgetTarget}
            onChange={(totalProjectBudgetTarget) =>
              updateDraft({
                budget: { ...draft.budget, totalProjectBudgetTarget }
              })
            }
          />
          <MoneyField
            label="Total Project Max"
            value={draft.budget.totalProjectBudgetMax}
            onChange={(totalProjectBudgetMax) =>
              updateDraft({
                budget: { ...draft.budget, totalProjectBudgetMax }
              })
            }
          />
        </div>
      </Section>

      <Section title="Acreage">
        <div className="grid gap-4 md:grid-cols-[minmax(180px,280px)_160px]">
          <Field label="Minimum Acres">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={draft.acreage.minimumAcres ?? ""}
              onChange={(event) =>
                updateDraft({
                  acreage: {
                    ...draft.acreage,
                    minimumAcres: parseNullableFloat(event.target.value)
                  }
                })
              }
            />
          </Field>
          <Field label="Hard Minimum">
            <div className="flex h-10 items-center">
              <Switch
                checked={draft.acreage.isHardMinimum}
                onCheckedChange={(isHardMinimum) =>
                  updateDraft({
                    acreage: { ...draft.acreage, isHardMinimum }
                  })
                }
              />
            </div>
          </Field>
        </div>
      </Section>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={1000}
        value={value ?? ""}
        onChange={(event) => onChange(parseNullableInteger(event.target.value))}
      />
    </Field>
  );
}

function ScoringPrioritiesTab({
  draft,
  updateDraft,
  updateCategoryWeight,
  updateFeaturePreference,
  addFeature
}: {
  draft: SearchProfile;
  updateDraft: (patch: Partial<SearchProfile>) => void;
  updateCategoryWeight: (id: string, patch: Partial<CategoryWeight>) => void;
  updateFeaturePreference: (id: string, patch: Partial<FeaturePreference>) => void;
  addFeature: (category: ProfileCategory) => void;
}) {
  const totalWeight = getAssignedCategoryWeight(draft.categoryWeights);
  const unassignedWeight = Math.max(0, maxScoreWeightTotal - totalWeight);
  const totalWeightStatus =
    totalWeight === maxScoreWeightTotal
      ? "Fully assigned"
      : `${unassignedWeight} unassigned`;
  const enabledCategoryCount = draft.categoryWeights.filter(
    (weight) => weight.enabled && weight.weight > 0
  ).length;

  function updateCategoryWeightValue(weight: CategoryWeight, requested: number) {
    const limit = getCategoryWeightLimit(draft.categoryWeights, weight);
    const nextWeight = Math.min(Math.max(0, requested), limit);

    updateCategoryWeight(weight.id, {
      weight: nextWeight,
      enabled: nextWeight > 0
    });
  }

  function updateCategoryWeightEnabled(
    weight: CategoryWeight,
    enabled: boolean
  ) {
    if (!enabled) {
      updateCategoryWeight(weight.id, { enabled: false, weight: 0 });
      return;
    }

    const limit = getCategoryWeightLimit(draft.categoryWeights, weight);

    if (limit <= 0) {
      return;
    }

    updateCategoryWeight(weight.id, {
      enabled: true,
      weight: Math.min(Math.max(1, weight.weight), limit)
    });
  }

  return (
    <div className="grid gap-5">
      <Section
        title="Score Allocation"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                totalWeight === maxScoreWeightTotal ? "success" : "warning"
              }
            >
              {totalWeight} / {maxScoreWeightTotal} assigned
            </Badge>
            <Badge variant="outline">{totalWeightStatus}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateDraft({
                  categoryWeights: normalizeCategoryWeights(
                    draft.categoryWeights
                  )
                })
              }
              disabled={totalWeight <= 0 || totalWeight === maxScoreWeightTotal}
            >
              <RotateCcw aria-hidden="true" />
              Normalize
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Assigned"
            value={`${totalWeight} / ${maxScoreWeightTotal}`}
          />
          <Metric label="Remaining" value={unassignedWeight.toString()} />
          <Metric
            label="Enabled Categories"
            value={enabledCategoryCount.toString()}
          />
        </div>
      </Section>

      {featureGroups.map((group) => {
        const categoryWeight = draft.categoryWeights.find(
          (weight) => weight.categoryKey === group.category
        );
        const preferences = draft.featurePreferences
          .filter(
            (preference) =>
              preference.category === group.category &&
              preference.mode !== "hard_reject"
          )
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

        if (!categoryWeight && preferences.length === 0) {
          return null;
        }

        const rowLimit = categoryWeight
          ? getCategoryWeightLimit(draft.categoryWeights, categoryWeight)
          : 0;
        const rowValue =
          categoryWeight && categoryWeight.enabled ? categoryWeight.weight : 0;
        const canEnable =
          Boolean(categoryWeight?.enabled) || rowLimit > 0;

        return (
          <Section
            key={group.category}
            title={group.label}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {categoryWeight ? (
                  <>
                    <Badge
                      variant={categoryWeight.enabled ? "secondary" : "outline"}
                    >
                      {rowValue} pts
                    </Badge>
                    <Badge variant="outline">
                      {formatCategoryShare(categoryWeight, totalWeight)}
                    </Badge>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFeature(group.category)}
                >
                  <Plus aria-hidden="true" />
                  Add Rule
                </Button>
              </div>
            }
          >
            <div className="grid gap-3">
              {categoryWeight ? (
                <div className="grid gap-3 rounded-md border border-border bg-card p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_minmax(220px,2fr)_120px_90px] lg:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        Category Importance
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {categoryHelp[categoryWeight.categoryKey]}
                      </div>
                    </div>
                    <Field label="Max Points">
                      <input
                        type="range"
                        min={0}
                        max={rowLimit}
                        value={rowValue}
                        onChange={(event) =>
                          updateCategoryWeightValue(
                            categoryWeight,
                            parseInteger(event.target.value)
                          )
                        }
                        className="h-10 w-full accent-primary"
                        disabled={rowLimit <= 0}
                      />
                    </Field>
                    <Field label="Points">
                      <Input
                        type="number"
                        min={0}
                        max={rowLimit}
                        value={rowValue}
                        onChange={(event) =>
                          updateCategoryWeightValue(
                            categoryWeight,
                            parseInteger(event.target.value)
                          )
                        }
                        disabled={rowLimit <= 0}
                      />
                    </Field>
                    <div className="flex items-center gap-2 lg:justify-end">
                      <Badge
                        variant={categoryWeight.enabled ? "secondary" : "outline"}
                      >
                        {formatCategoryShare(categoryWeight, totalWeight)}
                      </Badge>
                      <Switch
                        checked={categoryWeight.enabled}
                        onCheckedChange={(enabled) =>
                          updateCategoryWeightEnabled(categoryWeight, enabled)
                        }
                        disabled={!canEnable}
                      />
                    </div>
                  </div>
                  <details className="rounded-md border border-border bg-background p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Advanced category fields
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_160px]">
                      <Field label="Category Label">
                        <Input
                          value={categoryWeight.categoryLabel}
                          onChange={(event) =>
                            updateCategoryWeight(categoryWeight.id, {
                              categoryLabel: event.target.value
                            })
                          }
                        />
                      </Field>
                      <Field label="Category">
                        <Select
                          value={categoryWeight.categoryKey}
                          onChange={(event) =>
                            updateCategoryWeight(categoryWeight.id, {
                              categoryKey: event.target.value as ProfileCategory
                            })
                          }
                        >
                          {profileCategories.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </details>
                </div>
              ) : null}

              {preferences.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
                  No specific scoring preferences configured.
                </div>
              ) : null}

              {preferences.map((preference) => (
                <div
                  key={preference.id}
                  className="grid gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px]">
                    <Field label="Preference">
                      <Input
                        value={preference.featureLabel}
                        onChange={(event) =>
                          updateFeaturePreference(preference.id, {
                            featureLabel: event.target.value
                          })
                        }
                      />
                    </Field>
                    <Field label="Impact">
                      <Select
                        value={getPreferenceImpact(preference)}
                        onChange={(event) =>
                          updateFeaturePreference(
                            preference.id,
                            patchForPreferenceImpact(
                              event.target.value as PreferenceImpact
                            )
                          )
                        }
                      >
                        {preferenceImpacts.map((impact) => (
                          <option key={impact.value} value={impact.value}>
                            {impact.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <details className="rounded-md border border-border bg-background p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Advanced scoring fields
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_150px_100px_110px_90px]">
                      <Field label="Fact Key">
                        <Input
                          value={preference.featureKey}
                          onChange={(event) =>
                            updateFeaturePreference(preference.id, {
                              featureKey: event.target.value
                            })
                          }
                        />
                      </Field>
                      <Field label="Category">
                        <Select
                          value={preference.category}
                          onChange={(event) =>
                            updateFeaturePreference(preference.id, {
                              category: event.target.value as ProfileCategory
                            })
                          }
                        >
                          {profileCategories.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Rank">
                        <Input
                          type="number"
                          min={1}
                          value={preference.rank ?? ""}
                          onChange={(event) =>
                            updateFeaturePreference(preference.id, {
                              rank: parseNullableInteger(event.target.value)
                            })
                          }
                        />
                      </Field>
                      <Field label="Points">
                        <Input
                          type="number"
                          value={preference.weight}
                          onChange={(event) =>
                            updateFeaturePreference(preference.id, {
                              weight: parseInteger(event.target.value)
                            })
                          }
                        />
                      </Field>
                      <Field label="Enabled">
                        <div className="flex h-10 items-center">
                          <Switch
                            checked={preference.enabled}
                            onCheckedChange={(enabled) =>
                              updateFeaturePreference(preference.id, {
                                enabled
                              })
                            }
                          />
                        </div>
                      </Field>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function DealBreakersTab({
  draft,
  updateFeaturePreference,
  addDealBreaker
}: {
  draft: SearchProfile;
  updateFeaturePreference: (id: string, patch: Partial<FeaturePreference>) => void;
  addDealBreaker: () => void;
}) {
  const dealBreakers = draft.featurePreferences
    .filter((preference) => preference.mode === "hard_reject")
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return (
    <div className="grid gap-5">
      <Section
        title="Deal Breakers"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDealBreaker}
          >
            <Plus aria-hidden="true" />
            Add Deal Breaker
          </Button>
        }
      >
        <div className="grid gap-3">
          {dealBreakers.map((preference) => (
            <div
              key={preference.id}
              className="grid gap-3 rounded-md border border-border bg-card p-3"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px]">
                <Field label="Deal Breaker">
                  <Input
                    value={preference.featureLabel}
                    onChange={(event) =>
                      updateFeaturePreference(preference.id, {
                        featureLabel: event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="Reject If Present">
                  <div className="flex h-10 items-center gap-3">
                    <Switch
                      checked={preference.enabled}
                      onCheckedChange={(enabled) =>
                        updateFeaturePreference(preference.id, { enabled })
                      }
                    />
                    <Badge variant={preference.enabled ? "destructive" : "outline"}>
                      {preference.enabled ? "Rejects" : "Ignored"}
                    </Badge>
                  </div>
                </Field>
              </div>

              <details className="rounded-md border border-border bg-background p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Advanced scoring fields
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_150px_110px]">
                  <Field label="Fact Key">
                    <Input
                      value={preference.featureKey}
                      onChange={(event) =>
                        updateFeaturePreference(preference.id, {
                          featureKey: event.target.value
                        })
                      }
                    />
                  </Field>
                  <Field label="Category">
                    <Select
                      value={preference.category}
                      onChange={(event) =>
                        updateFeaturePreference(preference.id, {
                          category: event.target.value as ProfileCategory
                        })
                      }
                    >
                      {profileCategories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Weight">
                    <Input
                      type="number"
                      value={preference.weight}
                      onChange={(event) =>
                        updateFeaturePreference(preference.id, {
                          weight: parseInteger(event.target.value)
                        })
                      }
                    />
                  </Field>
                </div>
              </details>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ScoreBandsTab({
  draft,
  updateScoreThreshold,
  addThreshold
}: {
  draft: SearchProfile;
  updateScoreThreshold: (id: string, patch: Partial<ScoreThreshold>) => void;
  addThreshold: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Section
        title="Score Bands"
        action={
          <Button type="button" variant="outline" size="sm" onClick={addThreshold}>
            <Plus aria-hidden="true" />
            Add Band
          </Button>
        }
      >
        <div className="grid gap-3">
          {draft.scoreThresholds
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((threshold) => (
              <div
                key={threshold.id}
                className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_140px_120px]"
              >
                <Field label="Label">
                  <Input
                    value={threshold.label}
                    onChange={(event) =>
                      updateScoreThreshold(threshold.id, {
                        label: event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="Minimum Score">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={threshold.minimumScore}
                    onChange={(event) =>
                      updateScoreThreshold(threshold.id, {
                        minimumScore: parseInteger(event.target.value)
                      })
                    }
                  />
                </Field>
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={threshold.sortOrder}
                    onChange={(event) =>
                      updateScoreThreshold(threshold.id, {
                        sortOrder: parseInteger(event.target.value)
                      })
                    }
                  />
                </Field>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}
