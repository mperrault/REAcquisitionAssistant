"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Eye,
  ExternalLink,
  Home,
  ListChecks,
  Star,
  XCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createDashboardSummaries,
  getDashboardCounts,
  getDashboardSections,
  type DashboardPropertySummary
} from "@/lib/properties/property-dashboard";
import {
  createEmptyPropertyState,
  loadPropertyState,
  savePropertyState,
  upsertProperty
} from "@/lib/properties/property-persistence";
import {
  lifecycleStatusOptions,
  type LifecycleStatus,
  type PropertyRecord
} from "@/lib/properties/types";
import {
  createDefaultProfileState,
  loadProfileState
} from "@/lib/profiles/profile-persistence";
import type { ProfileState } from "@/lib/profiles/types";
import {
  createEmptyScoreState,
  loadScoreState
} from "@/lib/scoring/score-persistence";
import type { ScoreEvaluationState } from "@/lib/scoring/types";

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

function formatAddress(property: PropertyRecord) {
  const line = [property.addressLine1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return line || "Untitled property";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getLifecycleLabel(status: LifecycleStatus) {
  return (
    lifecycleStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
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

function getActiveProfileName(profileState: ProfileState) {
  const activeProfile = profileState.profiles.find(
    (profile) => profile.id === profileState.activeProfileId
  );

  return activeProfile?.name ?? "No active profile";
}

export function DashboardManager() {
  const [propertyState, setPropertyState] = React.useState(() =>
    createEmptyPropertyState()
  );
  const [scoreState, setScoreState] = React.useState<ScoreEvaluationState>(() =>
    createEmptyScoreState()
  );
  const [profileState, setProfileState] = React.useState<ProfileState | null>(
    null
  );

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
  const counts = React.useMemo(() => getDashboardCounts(summaries), [summaries]);
  const sections = React.useMemo(
    () => getDashboardSections(summaries, 5),
    [summaries]
  );

  function updateLifecycleStatus(
    property: PropertyRecord,
    lifecycleStatus: LifecycleStatus
  ) {
    const nextState = upsertProperty(propertyState, {
      ...property,
      lifecycleStatus
    });
    const persisted = savePropertyState(window.localStorage, nextState);

    setPropertyState(persisted);
  }

  return (
    <div className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary">Milestone 4</Badge>
            <Badge variant="success">Local Data</Badge>
            <Badge variant="outline">
              {getActiveProfileName(profileState ?? createDefaultProfileState())}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review the acquisition queue by score, status, and recent activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/properties">
              <Home aria-hidden="true" />
              Properties
            </Link>
          </Button>
          <Button asChild>
            <Link href="/compare">
              <BarChart3 aria-hidden="true" />
              Compare
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Properties" value={counts.total} />
        <Metric label="Scored" value={counts.scored} />
        <Metric label="Unscored" value={counts.unscored} />
        <Metric label="Score Gaps" value={counts.scoreGaps} />
        <Metric label="Watch List" value={counts.watchList} />
        <Metric label="Worth Visiting" value={counts.worthVisiting} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardSection
          title="Top Candidates"
          icon={Star}
          items={sections.topCandidates}
          emptyText="No scored candidates yet."
          viewAllHref="/properties?scoreFilter=scored&sort=score_desc"
          onLifecycleChange={updateLifecycleStatus}
        />
        <DashboardSection
          title="Recent Properties"
          icon={Clock3}
          items={sections.recentProperties}
          emptyText="No properties saved yet."
          viewAllHref="/properties?sort=updated_desc"
          onLifecycleChange={updateLifecycleStatus}
        />
        <DashboardSection
          title="Watch List"
          icon={Eye}
          items={sections.watchList}
          emptyText="No watch-list properties yet."
          viewAllHref="/properties?status=watch_list"
          onLifecycleChange={updateLifecycleStatus}
        />
        <DashboardSection
          title="Worth Visiting"
          icon={ListChecks}
          items={sections.worthVisiting}
          emptyText="No properties marked worth visiting yet."
          viewAllHref="/properties?status=worth_visiting"
          onLifecycleChange={updateLifecycleStatus}
        />
        <DashboardSection
          title="Rejected By Profile"
          icon={AlertTriangle}
          items={sections.rejectedByProfile}
          emptyText="No profile hard rejects yet."
          className="xl:col-span-2"
          viewAllHref="/properties?scoreFilter=hard_rejected"
          onLifecycleChange={updateLifecycleStatus}
        />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function DashboardSection({
  title,
  icon: Icon,
  items,
  emptyText,
  className,
  viewAllHref,
  onLifecycleChange
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: DashboardPropertySummary[];
  emptyText: string;
  className?: string;
  viewAllHref: string;
  onLifecycleChange: (
    property: PropertyRecord,
    lifecycleStatus: LifecycleStatus
  ) => void;
}) {
  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold">{title}</h2>
        <Badge variant="outline">{items.length}</Badge>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href={viewAllHref}>View All</Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {items.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <PropertyRow
                key={item.property.id}
                item={item}
                onLifecycleChange={onLifecycleChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyRow({
  item,
  onLifecycleChange
}: {
  item: DashboardPropertySummary;
  onLifecycleChange: (
    property: PropertyRecord,
    lifecycleStatus: LifecycleStatus
  ) => void;
}) {
  const { property } = item;

  return (
    <div className="flex min-w-0 gap-3 p-3">
      {property.primaryPhotoUrl ? (
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
          <Image
            src={property.primaryPhotoUrl}
            alt={`${formatAddress(property)} listing photo`}
            fill
            sizes="80px"
            className="object-cover"
            loading="lazy"
            unoptimized
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-secondary">
          <Home className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {formatAddress(property)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{formatCurrency(property.askingPrice)}</span>
          <span>{property.bedrooms ?? "-"} bd</span>
          <span>{property.bathrooms ?? "-"} ba</span>
          <span>{property.livingSqft?.toLocaleString() ?? "-"} sqft</span>
          <span>Updated {formatDate(property.updatedAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">
            {getLifecycleLabel(property.lifecycleStatus)}
          </Badge>
          <Badge variant={getScoreVariant(item)}>
            {item.score === null ? "No score" : `Score ${item.score}/100`}
          </Badge>
          {item.latestEvaluation ? (
            <Badge variant="outline">{item.scoreLabel}</Badge>
          ) : null}
          {item.scoreGapCount > 0 ? (
            <Badge variant="warning">
              {item.scoreGapCount}{" "}
              {item.scoreGapCount === 1 ? "score gap" : "score gaps"}
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties?propertyId=${encodeURIComponent(property.id)}`}>
              <ExternalLink aria-hidden="true" />
              Open
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onLifecycleChange(property, "watch_list")}
            disabled={property.lifecycleStatus === "watch_list"}
          >
            <Eye aria-hidden="true" />
            Watch
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onLifecycleChange(property, "worth_visiting")}
            disabled={property.lifecycleStatus === "worth_visiting"}
          >
            <ListChecks aria-hidden="true" />
            Visit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onLifecycleChange(property, "rejected")}
            disabled={property.lifecycleStatus === "rejected"}
          >
            <XCircle aria-hidden="true" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
