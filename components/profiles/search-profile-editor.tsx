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
  PreferenceMode,
  ProfileCategory,
  ProfileState,
  ScoreThreshold,
  SearchProfile,
  TownPreference
} from "@/lib/profiles/types";
import { cn } from "@/lib/utils";

type TabId = "overview" | "geography" | "budget" | "preferences" | "weights";

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "geography", label: "Geography", icon: MapPin },
  { id: "budget", label: "Budget", icon: DollarSign },
  { id: "preferences", label: "Preferences", icon: ShieldAlert },
  { id: "weights", label: "Weights", icon: SlidersHorizontal }
];

const featureGroups: Array<{ category: ProfileCategory; label: string }> = [
  { category: "setting", label: "Setting Preferences" },
  { category: "style", label: "House Style" },
  { category: "renovation", label: "Renovation Fit" },
  { category: "risk", label: "Risks And Deal Breakers" },
  { category: "utility", label: "Utilities And Neutral Facts" },
  { category: "maintenance", label: "Maintenance Burden" },
  { category: "location", label: "Location Rules" }
];

const preferenceModes: Array<{ value: PreferenceMode; label: string }> = [
  { value: "bonus", label: "Bonus" },
  { value: "penalty", label: "Penalty" },
  { value: "hard_reject", label: "Hard Reject" },
  { value: "neutral", label: "Neutral" }
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
            Search Profiles
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure acquisition preferences, deal breakers, weights, and score
            labels.
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
              <h2 className="text-sm font-semibold">Profiles</h2>
              <p className="text-xs text-muted-foreground">
                {visibleProfiles.length} active configuration
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              disabled={!draft}
              title="Duplicate selected profile"
            >
              <Copy aria-hidden="true" />
              Copy
            </Button>
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
                  {draft?.name ?? "No profile selected"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {draft?.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                  <Badge variant="outline">
                    {draft?.townPreferences.length ?? 0} towns
                  </Badge>
                  <Badge variant="outline">
                    {draft?.featurePreferences.length ?? 0} rules
                  </Badge>
                </div>
              </div>
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
                {activeTab === "preferences" ? (
                  <PreferencesTab
                    draft={draft}
                    updateFeaturePreference={updateFeaturePreference}
                    addFeature={handleAddFeature}
                  />
                ) : null}
                {activeTab === "weights" ? (
                  <WeightsTab
                    draft={draft}
                    updateCategoryWeight={updateCategoryWeight}
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
      <div className="text-sm font-medium">No profile selected</div>
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
      <Section title="Profile">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Profile Name">
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

function PreferencesTab({
  draft,
  updateFeaturePreference,
  addFeature
}: {
  draft: SearchProfile;
  updateFeaturePreference: (id: string, patch: Partial<FeaturePreference>) => void;
  addFeature: (category: ProfileCategory) => void;
}) {
  return (
    <div className="grid gap-5">
      {featureGroups.map((group) => {
        const preferences = draft.featurePreferences
          .filter((preference) => preference.category === group.category)
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

        if (preferences.length === 0 && group.category === "financial") {
          return null;
        }

        return (
          <Section
            key={group.category}
            title={group.label}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFeature(group.category)}
              >
                <Plus aria-hidden="true" />
                Add Rule
              </Button>
            }
          >
            <div className="grid gap-3">
              {preferences.map((preference) => (
                <div
                  key={preference.id}
                  className="grid gap-3 rounded-md border border-border bg-card p-3 xl:grid-cols-[minmax(170px,1fr)_minmax(180px,1.2fr)_130px_90px_100px_80px]"
                >
                  <Field label="Label">
                    <Input
                      value={preference.featureLabel}
                      onChange={(event) =>
                        updateFeaturePreference(preference.id, {
                          featureLabel: event.target.value
                        })
                      }
                    />
                  </Field>
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
                  <Field label="Mode">
                    <Select
                      value={preference.mode}
                      onChange={(event) =>
                        updateFeaturePreference(preference.id, {
                          mode: event.target.value as PreferenceMode
                        })
                      }
                    >
                      {preferenceModes.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
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
                  <Field label="Enabled">
                    <div className="flex h-10 items-center">
                      <Switch
                        checked={preference.enabled}
                        onCheckedChange={(enabled) =>
                          updateFeaturePreference(preference.id, { enabled })
                        }
                      />
                    </div>
                  </Field>
                </div>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function WeightsTab({
  draft,
  updateCategoryWeight,
  updateScoreThreshold,
  addThreshold
}: {
  draft: SearchProfile;
  updateCategoryWeight: (id: string, patch: Partial<CategoryWeight>) => void;
  updateScoreThreshold: (id: string, patch: Partial<ScoreThreshold>) => void;
  addThreshold: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Category Weights">
        <div className="grid gap-3">
          {draft.categoryWeights.map((weight) => (
            <div
              key={weight.id}
              className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_150px_120px_80px]"
            >
              <Field label="Label">
                <Input
                  value={weight.categoryLabel}
                  onChange={(event) =>
                    updateCategoryWeight(weight.id, {
                      categoryLabel: event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Category">
                <Select
                  value={weight.categoryKey}
                  onChange={(event) =>
                    updateCategoryWeight(weight.id, {
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
              <Field label="Weight">
                <Input
                  type="number"
                  min={0}
                  value={weight.weight}
                  onChange={(event) =>
                    updateCategoryWeight(weight.id, {
                      weight: parseInteger(event.target.value)
                    })
                  }
                />
              </Field>
              <Field label="Enabled">
                <div className="flex h-10 items-center">
                  <Switch
                    checked={weight.enabled}
                    onCheckedChange={(enabled) =>
                      updateCategoryWeight(weight.id, { enabled })
                    }
                  />
                </div>
              </Field>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Score Labels"
        action={
          <Button type="button" variant="outline" size="sm" onClick={addThreshold}>
            <Plus aria-hidden="true" />
            Add Label
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
