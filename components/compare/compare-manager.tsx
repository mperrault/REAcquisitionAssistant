"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { Check, ExternalLink, Home, RotateCcw, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createDashboardSummaries,
  getDefaultComparePropertyIds,
  getPropertyNumericFact,
  type DashboardPropertySummary
} from "@/lib/properties/property-dashboard";
import {
  createEmptyPropertyState,
  loadPropertyState
} from "@/lib/properties/property-persistence";
import {
  lifecycleStatusOptions,
  type LifecycleStatus,
  type PropertyRecord
} from "@/lib/properties/types";
import { loadProfileState } from "@/lib/profiles/profile-persistence";
import type { ProfileState } from "@/lib/profiles/types";
import {
  createEmptyScoreState,
  loadScoreState
} from "@/lib/scoring/score-persistence";
import type { ScoreEvaluationState } from "@/lib/scoring/types";
import { cn } from "@/lib/utils";

const COMPARE_SELECTION_STORAGE_KEY =
  "re-acquisition-assistant.compare-selection.v1";

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Price unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number | null) {
  return value === null ? "-" : value.toLocaleString();
}

function formatText(value: string) {
  return value.trim() || "-";
}

function formatAddress(property: PropertyRecord) {
  const line = [property.addressLine1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return line || "Untitled property";
}

function getLifecycleLabel(status: LifecycleStatus) {
  return (
    lifecycleStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

function getActiveProfileName(profileState: ProfileState | null) {
  if (!profileState) {
    return "Loading profile";
  }

  const activeProfile = profileState.profiles.find(
    (profile) => profile.id === profileState.activeProfileId
  );

  return activeProfile?.name ?? "No active profile";
}

function getScoreVariant(summary: DashboardPropertySummary) {
  if (summary.hardRejected) {
    return "destructive" as const;
  }

  if ((summary.score ?? 0) >= 70) {
    return "success" as const;
  }

  if ((summary.score ?? 0) >= 45) {
    return "secondary" as const;
  }

  return summary.latestEvaluation ? ("warning" as const) : ("outline" as const);
}

function loadCompareSelection(storage: Storage, validIds: Set<string>) {
  const rawValue = storage.getItem(COMPARE_SELECTION_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value, index, values) => values.indexOf(value) === index)
      .filter((value) => validIds.has(value))
      .slice(0, 4);
  } catch {
    return [];
  }
}

export function CompareManager() {
  const [propertyState, setPropertyState] = React.useState(() =>
    createEmptyPropertyState()
  );
  const [scoreState, setScoreState] = React.useState<ScoreEvaluationState>(() =>
    createEmptyScoreState()
  );
  const [profileState, setProfileState] = React.useState<ProfileState | null>(
    null
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [hasInitializedSelection, setHasInitializedSelection] =
    React.useState(false);

  React.useEffect(() => {
    const propertyResult = loadPropertyState(window.localStorage);
    const scoreResult = loadScoreState(window.localStorage);
    const profileResult = loadProfileState(window.localStorage);

    setPropertyState(propertyResult.state);
    setScoreState(scoreResult.state);
    setProfileState(profileResult.state);
  }, []);

  const activeProfileId = profileState?.activeProfileId ?? undefined;
  const summaries = React.useMemo(
    () =>
      createDashboardSummaries({
        properties: propertyState.properties,
        scoreState,
        profileId: activeProfileId
      }),
    [activeProfileId, propertyState.properties, scoreState]
  );
  const selectedSummaries = React.useMemo(
    () =>
      selectedIds
        .map((id) => summaries.find((summary) => summary.property.id === id))
        .filter((summary): summary is DashboardPropertySummary =>
          Boolean(summary)
        ),
    [selectedIds, summaries]
  );

  React.useEffect(() => {
    if (hasInitializedSelection || summaries.length === 0) {
      return;
    }

    const validIds = new Set(summaries.map((summary) => summary.property.id));
    const storedSelection = loadCompareSelection(window.localStorage, validIds);
    setSelectedIds(
      storedSelection.length >= 2
        ? storedSelection
        : getDefaultComparePropertyIds(summaries, 4)
    );
    setHasInitializedSelection(true);
  }, [hasInitializedSelection, summaries]);

  React.useEffect(() => {
    if (!hasInitializedSelection) {
      return;
    }

    window.localStorage.setItem(
      COMPARE_SELECTION_STORAGE_KEY,
      JSON.stringify(selectedIds)
    );
  }, [hasInitializedSelection, selectedIds]);

  function resetSelection() {
    setSelectedIds(getDefaultComparePropertyIds(summaries, 4));
  }

  function toggleSelection(propertyId: string) {
    setSelectedIds((current) => {
      if (current.includes(propertyId)) {
        return current.filter((id) => id !== propertyId);
      }

      if (current.length >= 4) {
        return current;
      }

      return [...current, propertyId];
    });
  }

  return (
    <div className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary">Milestone 4</Badge>
            <Badge variant="success">Local Data</Badge>
            <Badge variant="outline">{getActiveProfileName(profileState)}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-normal">Compare</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Compare two to four properties by score, price, facts, and decision
            status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={resetSelection}>
            <RotateCcw aria-hidden="true" />
            Reset Selection
          </Button>
          <Button asChild variant="outline">
            <Link href="/properties">
              <Home aria-hidden="true" />
              Properties
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-md border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Select Properties</h2>
              <Badge variant="outline">{selectedIds.length}/4 selected</Badge>
            </div>
          </div>
          <div className="max-h-[44rem] overflow-auto">
            {summaries.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No properties are available to compare.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {summaries.map((summary) => {
                  const selected = selectedIds.includes(summary.property.id);
                  const disabled = !selected && selectedIds.length >= 4;

                  return (
                    <button
                      key={summary.property.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleSelection(summary.property.id)}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-3 p-3 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                        selected && "bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background"
                        )}
                      >
                        {selected ? (
                          <Check className="size-3" aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {formatAddress(summary.property)}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2">
                          <Badge variant={getScoreVariant(summary)}>
                            {summary.score === null
                              ? "No score"
                              : `Score ${summary.score}/100`}
                          </Badge>
                          <Badge variant="outline">
                            {formatCurrency(summary.property.askingPrice)}
                          </Badge>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <ComparisonTable selectedSummaries={selectedSummaries} />
      </section>
    </div>
  );
}

function ComparisonTable({
  selectedSummaries
}: {
  selectedSummaries: DashboardPropertySummary[];
}) {
  if (selectedSummaries.length < 2) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card p-8 text-center">
        <Scale className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="text-sm font-medium">
          Select at least two properties to compare.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/70">
            <th className="sticky left-0 z-10 w-44 bg-secondary/95 p-3 text-left font-medium">
              Property
            </th>
            {selectedSummaries.map((summary) => (
              <th
                key={summary.property.id}
                className="w-64 p-3 text-left align-top font-medium"
              >
                <PropertyColumnHeader summary={summary} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ComparisonRow label="Score">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                <Badge variant={getScoreVariant(summary)}>
                  {summary.score === null ? "No score" : `${summary.score}/100`}
                </Badge>
                {summary.latestEvaluation ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {summary.scoreLabel}
                  </div>
                ) : null}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Status">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {getLifecycleLabel(summary.property.lifecycleStatus)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Price">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top font-medium">
                {formatCurrency(summary.property.askingPrice)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Estimated Purchase">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatCurrency(summary.property.estimatedPurchasePrice)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Renovation Estimate">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatCurrency(summary.renovationExpectedCost)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Closing Costs">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatCurrency(
                  getPropertyNumericFact(summary.property, "finance.closing_costs")
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Total Investment">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top font-medium">
                {formatCurrency(summary.projectedTotalInvestment)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Beds / Baths">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.property.bedrooms ?? "-"} bd /{" "}
                {summary.property.bathrooms ?? "-"} ba
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Sqft">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatNumber(summary.property.livingSqft)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Acres">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.property.lotAcres ?? "-"}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Year Built">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.property.yearBuilt ?? "-"}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Taxes">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatCurrency(summary.property.annualPropertyTax)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Style">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {formatText(summary.property.houseStyle)}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Systems">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                <ComparisonList
                  items={[
                    `Heat: ${formatText(summary.property.heatingType)}`,
                    `Water: ${formatText(summary.property.waterSource)}`,
                    `Sewer: ${formatText(summary.property.sewerType)}`,
                    `Garage: ${
                      summary.property.garageSpaces === null
                        ? "-"
                        : summary.property.garageSpaces
                    }`
                  ]}
                />
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Category Scores">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.latestEvaluation ? (
                  <ComparisonList
                    items={Object.entries(summary.latestEvaluation.categoryScores)
                      .filter(([, points]) => points !== 0)
                      .map(([category, points]) => `${category}: ${points}`)}
                  />
                ) : (
                  "None"
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Hard Rejects">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.latestEvaluation?.hardRejectReasons.length ? (
                  <ComparisonList
                    items={summary.latestEvaluation.hardRejectReasons.map(
                      (item) => `${item.label}: ${item.detail}`
                    )}
                  />
                ) : (
                  "None"
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Penalties">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.latestEvaluation?.penalties.length ? (
                  <ComparisonList
                    items={summary.latestEvaluation.penalties
                      .slice(0, 5)
                      .map((item) => `${item.label}: ${item.detail}`)}
                  />
                ) : (
                  "None"
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Score Gaps">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.latestEvaluation?.missingData.length ? (
                  <ComparisonList items={summary.latestEvaluation.missingData} />
                ) : (
                  "None"
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Positive Factors">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                {summary.latestEvaluation?.positiveFactors.length ? (
                  <ComparisonList
                    items={summary.latestEvaluation.positiveFactors
                      .slice(0, 5)
                      .map((item) => `${item.label}: ${item.detail}`)}
                  />
                ) : (
                  "None"
                )}
              </td>
            ))}
          </ComparisonRow>
          <ComparisonRow label="Notes">
            {selectedSummaries.map((summary) => (
              <td key={summary.property.id} className="p-3 align-top">
                <div className="line-clamp-4 text-xs text-muted-foreground">
                  {summary.property.notes ||
                    summary.property.listingRemarks ||
                    "No notes recorded."}
                </div>
              </td>
            ))}
          </ComparisonRow>
        </tbody>
      </table>
    </div>
  );
}

function PropertyColumnHeader({
  summary
}: {
  summary: DashboardPropertySummary;
}) {
  const { property } = summary;

  return (
    <div className="grid gap-2">
      {property.primaryPhotoUrl ? (
        <div className="relative h-28 overflow-hidden rounded-md border border-border bg-secondary">
          <Image
            src={property.primaryPhotoUrl}
            alt={`${formatAddress(property)} listing photo`}
            fill
            sizes="256px"
            className="object-cover"
            loading="lazy"
            unoptimized
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}
      <div className="line-clamp-2 font-semibold">{formatAddress(property)}</div>
      <Button asChild variant="outline" size="sm">
        <Link href={`/properties?propertyId=${encodeURIComponent(property.id)}`}>
          <ExternalLink aria-hidden="true" />
          Open
        </Link>
      </Button>
    </div>
  );
}

function ComparisonList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return "None";
  }

  return (
    <ul className="grid gap-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ComparisonRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th className="sticky left-0 z-10 bg-card p-3 text-left text-xs font-medium uppercase text-muted-foreground">
        {label}
      </th>
      {children}
    </tr>
  );
}
