import {
  createPropertyDraftFromListingCandidate
} from "@/lib/listing-alerts/listing-alert-parser";
import { OUTSIDE_PROFILE_GEOGRAPHY_WARNING } from "@/lib/listing-alerts/geography-filter";
import type {
  ListingAlertState,
  ListingCandidate,
  ListingCandidateStatus
} from "@/lib/listing-alerts/types";
import type { SearchProfile } from "@/lib/profiles/types";
import { evaluateProperty } from "@/lib/scoring/evaluate-property";
import type { ScoreEvaluation } from "@/lib/scoring/types";

export const LOW_CONFIDENCE_THRESHOLD = 0.65;

export type CandidateTriageFilter =
  | "all"
  | "needs_review"
  | "has_photo"
  | "missing_photo"
  | "low_confidence"
  | "warnings"
  | "outside_geography"
  | "strong_score"
  | "rejected_by_profile";

export type CandidateSortMode =
  | "updated_desc"
  | "received_desc"
  | "score_desc"
  | "confidence_desc"
  | "confidence_asc"
  | "price_asc"
  | "price_desc";

export type CandidateScorePreview = {
  candidateId: string;
  evaluation: ScoreEvaluation;
};

export type CandidateTriageResult = {
  candidates: ListingCandidate[];
  scorePreviews: Map<string, CandidateScorePreview>;
};

export type FilterAndSortListingCandidatesInput = {
  state: ListingAlertState;
  selectedSourceId: string | null;
  statusFilter: ListingCandidateStatus | "all";
  triageFilter: CandidateTriageFilter;
  sortMode: CandidateSortMode;
  activeProfile: SearchProfile | null;
};

export function getListingCandidateReceivedAt(
  candidate: ListingCandidate,
  state: ListingAlertState
) {
  const message = state.messages.find(
    (item) =>
      item.id === candidate.messageId ||
      item.externalMessageId === candidate.externalMessageId
  );

  return message?.receivedAt ?? candidate.createdAt;
}

export function createListingCandidateScorePreview(
  candidate: ListingCandidate,
  activeProfile: SearchProfile | null
): CandidateScorePreview | null {
  if (!activeProfile) {
    return null;
  }

  const property = createPropertyDraftFromListingCandidate(
    candidate,
    candidate.updatedAt,
    () => `preview-property-${candidate.id}`
  );
  const evaluation = evaluateProperty(
    property,
    activeProfile,
    candidate.updatedAt,
    () => `preview-score-${candidate.id}`
  );

  return {
    candidateId: candidate.id,
    evaluation
  };
}

export function createListingCandidateScorePreviewMap(
  candidates: ListingCandidate[],
  activeProfile: SearchProfile | null
) {
  const previews = new Map<string, CandidateScorePreview>();

  for (const candidate of candidates) {
    const preview = createListingCandidateScorePreview(candidate, activeProfile);

    if (preview) {
      previews.set(candidate.id, preview);
    }
  }

  return previews;
}

function hasMissingPhoto(candidate: ListingCandidate) {
  return !candidate.primaryPhotoUrl;
}

function hasWarnings(candidate: ListingCandidate) {
  return candidate.warnings.length > 0;
}

function isLowConfidence(candidate: ListingCandidate) {
  return candidate.confidence < LOW_CONFIDENCE_THRESHOLD;
}

function isOutsideGeography(candidate: ListingCandidate) {
  return candidate.warnings.includes(OUTSIDE_PROFILE_GEOGRAPHY_WARNING);
}

function matchesTriageFilter(
  candidate: ListingCandidate,
  filter: CandidateTriageFilter,
  scorePreview: CandidateScorePreview | undefined
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "needs_review") {
    return (
      hasWarnings(candidate) ||
      isLowConfidence(candidate) ||
      hasMissingPhoto(candidate) ||
      Boolean(scorePreview?.evaluation.hardRejected)
    );
  }

  if (filter === "has_photo") {
    return Boolean(candidate.primaryPhotoUrl);
  }

  if (filter === "missing_photo") {
    return hasMissingPhoto(candidate);
  }

  if (filter === "low_confidence") {
    return isLowConfidence(candidate);
  }

  if (filter === "warnings") {
    return hasWarnings(candidate);
  }

  if (filter === "outside_geography") {
    return isOutsideGeography(candidate);
  }

  if (filter === "strong_score") {
    return (
      !scorePreview?.evaluation.hardRejected &&
      (scorePreview?.evaluation.normalizedScore ?? 0) >= 70
    );
  }

  if (filter === "rejected_by_profile") {
    return Boolean(scorePreview?.evaluation.hardRejected);
  }

  return true;
}

function numberForSort(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compareCandidates(
  a: ListingCandidate,
  b: ListingCandidate,
  sortMode: CandidateSortMode,
  state: ListingAlertState,
  scorePreviews: Map<string, CandidateScorePreview>
) {
  if (sortMode === "received_desc") {
    return (
      new Date(getListingCandidateReceivedAt(b, state)).getTime() -
      new Date(getListingCandidateReceivedAt(a, state)).getTime()
    );
  }

  if (sortMode === "score_desc") {
    return (
      numberForSort(scorePreviews.get(b.id)?.evaluation.normalizedScore, -1) -
      numberForSort(scorePreviews.get(a.id)?.evaluation.normalizedScore, -1)
    );
  }

  if (sortMode === "confidence_desc") {
    return b.confidence - a.confidence;
  }

  if (sortMode === "confidence_asc") {
    return a.confidence - b.confidence;
  }

  if (sortMode === "price_asc") {
    return numberForSort(a.askingPrice, Number.POSITIVE_INFINITY) -
      numberForSort(b.askingPrice, Number.POSITIVE_INFINITY);
  }

  if (sortMode === "price_desc") {
    return numberForSort(b.askingPrice, -1) - numberForSort(a.askingPrice, -1);
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function filterAndSortListingCandidates({
  state,
  selectedSourceId,
  statusFilter,
  triageFilter,
  sortMode,
  activeProfile
}: FilterAndSortListingCandidatesInput): CandidateTriageResult {
  const sourceAndStatusCandidates = state.candidates.filter((candidate) => {
    const matchesStatus =
      statusFilter === "all" || candidate.status === statusFilter;
    const matchesSource =
      !selectedSourceId || candidate.sourceId === selectedSourceId;

    return matchesStatus && matchesSource;
  });
  const scorePreviews = createListingCandidateScorePreviewMap(
    sourceAndStatusCandidates,
    activeProfile
  );
  const candidates = sourceAndStatusCandidates
    .filter((candidate) =>
      matchesTriageFilter(candidate, triageFilter, scorePreviews.get(candidate.id))
    )
    .sort((a, b) => compareCandidates(a, b, sortMode, state, scorePreviews));

  return {
    candidates,
    scorePreviews
  };
}
