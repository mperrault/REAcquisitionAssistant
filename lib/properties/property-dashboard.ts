import type { LifecycleStatus, PropertyRecord } from "@/lib/properties/types";
import { getLatestScoreEvaluation } from "@/lib/scoring/score-persistence";
import type { ScoreEvaluation, ScoreEvaluationState } from "@/lib/scoring/types";

export type DashboardPropertySummary = {
  property: PropertyRecord;
  latestEvaluation: ScoreEvaluation | undefined;
  score: number | null;
  scoreLabel: string;
  scoreGapCount: number;
  hardRejected: boolean;
};

export type DashboardSections = {
  topCandidates: DashboardPropertySummary[];
  recentProperties: DashboardPropertySummary[];
  watchList: DashboardPropertySummary[];
  worthVisiting: DashboardPropertySummary[];
  rejectedByProfile: DashboardPropertySummary[];
};

export type DashboardCounts = {
  total: number;
  scored: number;
  unscored: number;
  hardRejected: number;
  scoreGaps: number;
  watchList: number;
  worthVisiting: number;
};

const inactiveLifecycleStatuses = new Set<LifecycleStatus>([
  "rejected",
  "sold_unavailable"
]);

const worthVisitingStatuses = new Set<LifecycleStatus>([
  "worth_visiting",
  "visit_scheduled",
  "visited",
  "interested",
  "offer_candidate",
  "offer_submitted",
  "under_contract"
]);

function compareByUpdatedDesc(a: PropertyRecord, b: PropertyRecord) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function compareByScoreDesc(
  a: DashboardPropertySummary,
  b: DashboardPropertySummary
) {
  return (
    (b.score ?? -1) - (a.score ?? -1) ||
    compareByUpdatedDesc(a.property, b.property)
  );
}

export function createDashboardPropertySummary(
  property: PropertyRecord,
  scoreState: ScoreEvaluationState,
  profileId?: string
): DashboardPropertySummary {
  const latestEvaluation = getLatestScoreEvaluation(
    scoreState,
    property.id,
    profileId
  );

  return {
    property,
    latestEvaluation,
    score: latestEvaluation?.normalizedScore ?? null,
    scoreLabel: latestEvaluation?.scoreLabel ?? "Not scored",
    scoreGapCount: latestEvaluation?.missingData.length ?? 0,
    hardRejected: latestEvaluation?.hardRejected ?? false
  };
}

export function createDashboardSummaries({
  properties,
  scoreState,
  profileId
}: {
  properties: PropertyRecord[];
  scoreState: ScoreEvaluationState;
  profileId?: string;
}) {
  return properties.map((property) =>
    createDashboardPropertySummary(property, scoreState, profileId)
  );
}

export function getDashboardCounts(
  summaries: DashboardPropertySummary[]
): DashboardCounts {
  return {
    total: summaries.length,
    scored: summaries.filter((summary) => summary.latestEvaluation).length,
    unscored: summaries.filter((summary) => !summary.latestEvaluation).length,
    hardRejected: summaries.filter((summary) => summary.hardRejected).length,
    scoreGaps: summaries.filter((summary) => summary.scoreGapCount > 0).length,
    watchList: summaries.filter(
      (summary) => summary.property.lifecycleStatus === "watch_list"
    ).length,
    worthVisiting: summaries.filter((summary) =>
      worthVisitingStatuses.has(summary.property.lifecycleStatus)
    ).length
  };
}

export function getDashboardSections(
  summaries: DashboardPropertySummary[],
  limit = 5
): DashboardSections {
  return {
    topCandidates: summaries
      .filter(
        (summary) =>
          summary.latestEvaluation &&
          !summary.hardRejected &&
          !inactiveLifecycleStatuses.has(summary.property.lifecycleStatus)
      )
      .sort(compareByScoreDesc)
      .slice(0, limit),
    recentProperties: summaries
      .slice()
      .sort((a, b) => compareByUpdatedDesc(a.property, b.property))
      .slice(0, limit),
    watchList: summaries
      .filter((summary) => summary.property.lifecycleStatus === "watch_list")
      .sort(compareByScoreDesc)
      .slice(0, limit),
    worthVisiting: summaries
      .filter((summary) =>
        worthVisitingStatuses.has(summary.property.lifecycleStatus)
      )
      .sort(compareByScoreDesc)
      .slice(0, limit),
    rejectedByProfile: summaries
      .filter((summary) => summary.hardRejected)
      .sort((a, b) => compareByUpdatedDesc(a.property, b.property))
      .slice(0, limit)
  };
}

export function getDefaultComparePropertyIds(
  summaries: DashboardPropertySummary[],
  limit = 4
) {
  const scored = summaries
    .filter(
      (summary) =>
        summary.latestEvaluation &&
        !summary.hardRejected &&
        !inactiveLifecycleStatuses.has(summary.property.lifecycleStatus)
    )
    .sort(compareByScoreDesc);
  const activeFallback = summaries
    .filter(
      (summary) =>
        !summary.hardRejected &&
        !inactiveLifecycleStatuses.has(summary.property.lifecycleStatus) &&
        !scored.some((item) => item.property.id === summary.property.id)
    )
    .sort((a, b) => compareByUpdatedDesc(a.property, b.property));
  const lastResort = summaries
    .filter(
      (summary) =>
        ![...scored, ...activeFallback].some(
          (item) => item.property.id === summary.property.id
        )
    )
    .sort((a, b) => compareByUpdatedDesc(a.property, b.property));

  return [...scored, ...activeFallback, ...lastResort]
    .slice(0, limit)
    .map((summary) => summary.property.id);
}
