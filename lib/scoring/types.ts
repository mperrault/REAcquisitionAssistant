import { z } from "zod";

import { profileCategorySchema } from "@/lib/profiles/types";

export const scoringEngineVersion = "0.2.0";

export const ruleResultSchema = z.object({
  ruleKey: z.string().min(1),
  label: z.string().min(1),
  category: profileCategorySchema,
  result: z.enum(["bonus", "penalty", "hard_reject", "neutral"]),
  points: z.number(),
  detail: z.string()
});

export type RuleResult = z.infer<typeof ruleResultSchema>;

export const scoreEvaluationSchema = z.object({
  id: z.string().min(1),
  propertyId: z.string().min(1),
  profileId: z.string().min(1),
  profileVersion: z.number().int().positive(),
  scoringEngineVersion: z.string().min(1),
  rawScore: z.number(),
  normalizedScore: z.number().int().min(0).max(100),
  scoreLabel: z.string().min(1),
  hardRejected: z.boolean(),
  hardRejectReasons: z.array(ruleResultSchema),
  positiveFactors: z.array(ruleResultSchema),
  penalties: z.array(ruleResultSchema),
  missingData: z.array(z.string()),
  categoryScores: z.record(profileCategorySchema, z.number()),
  evaluatedAt: z.string().datetime()
});

export type ScoreEvaluation = z.infer<typeof scoreEvaluationSchema>;

export const scoreEvaluationStateSchema = z.object({
  schemaVersion: z.literal(1),
  evaluations: z.array(scoreEvaluationSchema)
});

export type ScoreEvaluationState = z.infer<typeof scoreEvaluationStateSchema>;
