import type { LifecycleStatus, PropertyRecord } from "@/lib/properties/types";
import { getLatestScoreEvaluation } from "@/lib/scoring/score-persistence";
import type { ScoreEvaluation, ScoreEvaluationState } from "@/lib/scoring/types";

export type PropertyScoreFilter =
  | "all"
  | "scored"
  | "not_scored"
  | "hard_rejected"
  | "missing_data";

export type PropertySortMode =
  | "updated_desc"
  | "score_desc"
  | "score_asc"
  | "price_asc"
  | "price_desc";

export type PropertyScoreSummary = {
  latestEvaluation: ScoreEvaluation | undefined;
  missingDataCount: number;
  hardRejected: boolean;
};

export type FilterAndSortPropertiesInput = {
  properties: PropertyRecord[];
  scoreState: ScoreEvaluationState;
  profileId?: string;
  query: string;
  lifecycleStatus: LifecycleStatus | "all";
  scoreFilter: PropertyScoreFilter;
  sortMode: PropertySortMode;
};

export type FilterAndSortPropertiesResult = {
  properties: PropertyRecord[];
  scoreSummaries: Map<string, PropertyScoreSummary>;
};

function searchableText(property: PropertyRecord) {
  return [
    property.addressLine1,
    property.city,
    property.state,
    property.postalCode,
    property.mlsId,
    property.primaryPhotoUrl,
    property.houseStyle,
    property.listingRemarks,
    property.notes
  ]
    .join(" ")
    .toLowerCase();
}

function numberForSort(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getPropertyScoreSummary(
  property: PropertyRecord,
  scoreState: ScoreEvaluationState,
  profileId?: string
): PropertyScoreSummary {
  const latestEvaluation = getLatestScoreEvaluation(
    scoreState,
    property.id,
    profileId
  );

  return {
    latestEvaluation,
    missingDataCount: latestEvaluation?.missingData.length ?? 0,
    hardRejected: latestEvaluation?.hardRejected ?? false
  };
}

function matchesScoreFilter(
  summary: PropertyScoreSummary,
  filter: PropertyScoreFilter
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "scored") {
    return Boolean(summary.latestEvaluation);
  }

  if (filter === "not_scored") {
    return !summary.latestEvaluation;
  }

  if (filter === "hard_rejected") {
    return summary.hardRejected;
  }

  if (filter === "missing_data") {
    return summary.missingDataCount > 0;
  }

  return true;
}

function compareProperties(
  a: PropertyRecord,
  b: PropertyRecord,
  sortMode: PropertySortMode,
  summaries: Map<string, PropertyScoreSummary>
) {
  if (sortMode === "score_desc") {
    return (
      numberForSort(
        summaries.get(b.id)?.latestEvaluation?.normalizedScore,
        -1
      ) -
      numberForSort(summaries.get(a.id)?.latestEvaluation?.normalizedScore, -1)
    );
  }

  if (sortMode === "score_asc") {
    return (
      numberForSort(
        summaries.get(a.id)?.latestEvaluation?.normalizedScore,
        Number.POSITIVE_INFINITY
      ) -
      numberForSort(
        summaries.get(b.id)?.latestEvaluation?.normalizedScore,
        Number.POSITIVE_INFINITY
      )
    );
  }

  if (sortMode === "price_asc") {
    return (
      numberForSort(a.askingPrice, Number.POSITIVE_INFINITY) -
      numberForSort(b.askingPrice, Number.POSITIVE_INFINITY)
    );
  }

  if (sortMode === "price_desc") {
    return numberForSort(b.askingPrice, -1) - numberForSort(a.askingPrice, -1);
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function filterAndSortProperties({
  properties,
  scoreState,
  profileId,
  query,
  lifecycleStatus,
  scoreFilter,
  sortMode
}: FilterAndSortPropertiesInput): FilterAndSortPropertiesResult {
  const normalizedQuery = query.trim().toLowerCase();
  const scoreSummaries = new Map<string, PropertyScoreSummary>();

  for (const property of properties) {
    scoreSummaries.set(
      property.id,
      getPropertyScoreSummary(property, scoreState, profileId)
    );
  }

  return {
    properties: properties
      .filter((property) => {
        const matchesQuery =
          !normalizedQuery || searchableText(property).includes(normalizedQuery);
        const matchesLifecycle =
          lifecycleStatus === "all" ||
          property.lifecycleStatus === lifecycleStatus;
        const summary = scoreSummaries.get(property.id);
        const matchesScore = summary
          ? matchesScoreFilter(summary, scoreFilter)
          : false;

        return matchesQuery && matchesLifecycle && matchesScore;
      })
      .sort((a, b) => compareProperties(a, b, sortMode, scoreSummaries)),
    scoreSummaries
  };
}
