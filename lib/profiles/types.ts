import { z } from "zod";

export const preferenceModeSchema = z.enum([
  "bonus",
  "penalty",
  "hard_reject",
  "neutral"
]);

export type PreferenceMode = z.infer<typeof preferenceModeSchema>;

export const profileCategorySchema = z.enum([
  "location",
  "setting",
  "style",
  "renovation",
  "financial",
  "resale",
  "maintenance",
  "risk",
  "utility"
]);

export type ProfileCategory = z.infer<typeof profileCategorySchema>;

export const townPreferenceSchema = z.object({
  id: z.string().min(1),
  town: z.string().min(1),
  state: z.string().min(2).max(2),
  rank: z.number().int().positive(),
  tier: z.number().int().positive(),
  weight: z.number().int(),
  enabled: z.boolean()
});

export type TownPreference = z.infer<typeof townPreferenceSchema>;

export const featurePreferenceSchema = z.object({
  id: z.string().min(1),
  featureKey: z.string().min(1),
  featureLabel: z.string().min(1),
  category: profileCategorySchema,
  rank: z.number().int().positive().nullable(),
  weight: z.number().int(),
  mode: preferenceModeSchema,
  enabled: z.boolean()
});

export type FeaturePreference = z.infer<typeof featurePreferenceSchema>;

export const categoryWeightSchema = z.object({
  id: z.string().min(1),
  categoryKey: profileCategorySchema,
  categoryLabel: z.string().min(1),
  weight: z.number().int().min(0),
  enabled: z.boolean()
});

export type CategoryWeight = z.infer<typeof categoryWeightSchema>;

export const scoreThresholdSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  minimumScore: z.number().int().min(0).max(100),
  sortOrder: z.number().int()
});

export type ScoreThreshold = z.infer<typeof scoreThresholdSchema>;

export const budgetSettingsSchema = z.object({
  purchasePriceTarget: z.number().int().nonnegative().nullable(),
  purchasePriceMax: z.number().int().nonnegative().nullable(),
  renovationBudgetTarget: z.number().int().nonnegative().nullable(),
  renovationBudgetMax: z.number().int().nonnegative().nullable(),
  totalProjectBudgetTarget: z.number().int().nonnegative().nullable(),
  totalProjectBudgetMax: z.number().int().nonnegative().nullable()
});

export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;

export const commuteSettingsSchema = z.object({
  anchorLabel: z.string(),
  anchorLat: z.number().nullable(),
  anchorLng: z.number().nullable(),
  idealMinutes: z.number().int().nonnegative(),
  preferredMinutes: z.number().int().nonnegative(),
  maxMinutes: z.number().int().nonnegative()
});

export type CommuteSettings = z.infer<typeof commuteSettingsSchema>;

export const acreageSettingsSchema = z.object({
  minimumAcres: z.number().nonnegative().nullable(),
  isHardMinimum: z.boolean()
});

export type AcreageSettings = z.infer<typeof acreageSettingsSchema>;

export const searchProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  strategy: z.string(),
  isActive: z.boolean(),
  isArchived: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  budget: budgetSettingsSchema,
  commute: commuteSettingsSchema,
  acreage: acreageSettingsSchema,
  renovationTolerance: z.string().min(1),
  townPreferences: z.array(townPreferenceSchema),
  featurePreferences: z.array(featurePreferenceSchema),
  categoryWeights: z.array(categoryWeightSchema),
  scoreThresholds: z.array(scoreThresholdSchema)
});

export type SearchProfile = z.infer<typeof searchProfileSchema>;

export const profileStateSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfileId: z.string().nullable(),
  profiles: z.array(searchProfileSchema)
});

export type ProfileState = z.infer<typeof profileStateSchema>;
