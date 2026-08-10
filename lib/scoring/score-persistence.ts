import {
  type ScoreEvaluation,
  type ScoreEvaluationState,
  scoreEvaluationSchema,
  scoreEvaluationStateSchema
} from "@/lib/scoring/types";

export const SCORE_STORAGE_KEY = "re-acquisition-assistant.score-evaluations.v1";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type LoadScoreStateResult = {
  state: ScoreEvaluationState;
  source: "storage" | "empty" | "reset";
};

export function createEmptyScoreState(): ScoreEvaluationState {
  return {
    schemaVersion: 1,
    evaluations: []
  };
}

export function loadScoreState(storage: StorageLike): LoadScoreStateResult {
  const rawValue = storage.getItem(SCORE_STORAGE_KEY);

  if (!rawValue) {
    return {
      state: createEmptyScoreState(),
      source: "empty"
    };
  }

  try {
    return {
      state: scoreEvaluationStateSchema.parse(JSON.parse(rawValue)),
      source: "storage"
    };
  } catch {
    return {
      state: createEmptyScoreState(),
      source: "reset"
    };
  }
}

export function saveScoreState(
  storage: StorageLike,
  state: ScoreEvaluationState
): ScoreEvaluationState {
  const parsed = scoreEvaluationStateSchema.parse(state);
  storage.setItem(SCORE_STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

export function addScoreEvaluation(
  state: ScoreEvaluationState,
  evaluation: ScoreEvaluation
): ScoreEvaluationState {
  const parsedEvaluation = scoreEvaluationSchema.parse(evaluation);

  return {
    ...state,
    evaluations: [parsedEvaluation, ...state.evaluations]
  };
}

export function getLatestScoreEvaluation(
  state: ScoreEvaluationState,
  propertyId: string,
  profileId?: string
) {
  return state.evaluations
    .filter(
      (evaluation) =>
        evaluation.propertyId === propertyId &&
        (!profileId || evaluation.profileId === profileId)
    )
    .sort(
      (a, b) =>
        new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
    )[0];
}
