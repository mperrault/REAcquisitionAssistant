import type {
  FeaturePreference,
  ProfileCategory,
  SearchProfile
} from "@/lib/profiles/types";
import type { PropertyRecord } from "@/lib/properties/types";
import {
  type RuleResult,
  type ScoreEvaluation,
  scoringEngineVersion,
  scoreEvaluationSchema
} from "@/lib/scoring/types";

type FactValue = boolean | number | string | null;
type FactIndex = Map<string, FactValue>;

const categoryKeys: ProfileCategory[] = [
  "location",
  "setting",
  "style",
  "renovation",
  "financial",
  "resale",
  "maintenance",
  "risk",
  "utility"
];

function nowIso() {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isTruthyFact(value: FactValue) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    return ["true", "yes", "present", "nearby", "visible"].includes(
      value.trim().toLowerCase()
    );
  }

  return false;
}

function asNumber(value: FactValue | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function createFactIndex(property: PropertyRecord): FactIndex {
  const facts = new Map<string, FactValue>();

  for (const fact of property.facts) {
    facts.set(fact.factKey, fact.value);
  }

  function setDerivedFact(key: string, value: FactValue) {
    if (!facts.has(key)) {
      facts.set(key, value);
    }
  }

  if (property.city) {
    setDerivedFact("location.city", property.city);
  }

  if (property.state) {
    setDerivedFact("location.state", property.state);
  }

  if (property.houseStyle) {
    setDerivedFact(`style.${slug(property.houseStyle)}`, true);
  }

  if (property.hoaPresent !== null) {
    setDerivedFact("risk.hoa", property.hoaPresent);
  }

  if (property.garageSpaces !== null) {
    setDerivedFact("maintenance.no_garage", property.garageSpaces === 0);
  }

  const heatingType = slug(property.heatingType);
  if (heatingType) {
    setDerivedFact(`utility.${heatingType}`, true);
    setDerivedFact(
      "risk.electric_baseboard_heat",
      heatingType.includes("electric_baseboard")
    );
    setDerivedFact("utility.oil_heat", heatingType.includes("oil"));
    setDerivedFact("utility.propane", heatingType.includes("propane"));
  }

  const waterSource = slug(property.waterSource);
  if (waterSource) {
    setDerivedFact(`utility.${waterSource}`, true);
    setDerivedFact("utility.well", waterSource.includes("well"));
  }

  const sewerType = slug(property.sewerType);
  if (sewerType) {
    setDerivedFact(`utility.${sewerType}`, true);
    setDerivedFact("utility.septic", sewerType.includes("septic"));
  }

  return facts;
}

function getCategoryWeight(profile: SearchProfile, category: ProfileCategory) {
  return (
    profile.categoryWeights.find(
      (weight) => weight.enabled && weight.categoryKey === category
    )?.weight ?? 0
  );
}

function addCategoryScore(
  categoryScores: Record<ProfileCategory, number>,
  category: ProfileCategory,
  points: number,
  maxPoints: number
) {
  categoryScores[category] = clamp(
    round(categoryScores[category] + points),
    0,
    maxPoints
  );
}

function createRuleResult(
  rule: Pick<FeaturePreference, "featureKey" | "featureLabel" | "category">,
  result: RuleResult["result"],
  points: number,
  detail: string
): RuleResult {
  return {
    ruleKey: rule.featureKey,
    label: rule.featureLabel,
    category: rule.category,
    result,
    points: round(points),
    detail
  };
}

function evaluateLocation(
  property: PropertyRecord,
  profile: SearchProfile,
  facts: FactIndex,
  categoryScores: Record<ProfileCategory, number>,
  positiveFactors: RuleResult[],
  penalties: RuleResult[],
  hardRejectReasons: RuleResult[],
  missingData: string[]
) {
  const categoryWeight = getCategoryWeight(profile, "location");
  if (categoryWeight <= 0) {
    return;
  }

  const townPreference = profile.townPreferences.find(
    (preference) =>
      preference.enabled &&
      preference.town.toLowerCase() === property.city.toLowerCase() &&
      preference.state.toLowerCase() === property.state.toLowerCase()
  );
  const maxTownWeight = Math.max(
    1,
    ...profile.townPreferences
      .filter((preference) => preference.enabled)
      .map((preference) => preference.weight)
  );

  if (townPreference) {
    const townPoints = round(
      (categoryWeight * 0.45 * Math.max(0, townPreference.weight)) /
        maxTownWeight
    );
    addCategoryScore(categoryScores, "location", townPoints, categoryWeight);
    positiveFactors.push({
      ruleKey: "location.town_preference",
      label: `${townPreference.town}, ${townPreference.state}`,
      category: "location",
      result: "bonus",
      points: townPoints,
      detail: `Tier ${townPreference.tier} town preference`
    });
  } else if (property.city && property.state) {
    penalties.push({
      ruleKey: "location.town_preference",
      label: "Town preference",
      category: "location",
      result: "neutral",
      points: 0,
      detail: "Town is not ranked in the selected profile"
    });
  } else {
    missingData.push("Town/state are missing for location scoring.");
  }

  const driveTime = asNumber(facts.get("location.drive_time_minutes"));

  if (driveTime === null) {
    missingData.push("Drive time is missing for commute scoring.");
    return;
  }

  if (driveTime > profile.commute.maxMinutes) {
    hardRejectReasons.push({
      ruleKey: "location.drive_time_over_max",
      label: "Drive time over maximum",
      category: "location",
      result: "hard_reject",
      points: 0,
      detail: `${driveTime} minutes exceeds ${profile.commute.maxMinutes} minute maximum`
    });
  }

  const commuteBudget = categoryWeight * 0.55;
  let commuteFraction = 1;

  if (driveTime > profile.commute.preferredMinutes) {
    commuteFraction = 0.25;
  } else if (driveTime > profile.commute.idealMinutes) {
    commuteFraction = 0.6;
  } else if (driveTime > Math.max(0, profile.commute.idealMinutes - 5)) {
    commuteFraction = 0.85;
  }

  const commutePoints = round(commuteBudget * commuteFraction);
  addCategoryScore(categoryScores, "location", commutePoints, categoryWeight);

  const result = commuteFraction >= 0.6 ? "bonus" : "penalty";
  const target = result === "bonus" ? positiveFactors : penalties;
  target.push({
    ruleKey: "location.drive_time_minutes",
    label: "Drive time",
    category: "location",
    result,
    points: result === "bonus" ? commutePoints : round(commutePoints - commuteBudget),
    detail: `${driveTime} minutes from commute anchor`
  });
}

function evaluateBudget(
  property: PropertyRecord,
  profile: SearchProfile,
  facts: FactIndex,
  categoryScores: Record<ProfileCategory, number>,
  positiveFactors: RuleResult[],
  penalties: RuleResult[],
  missingData: string[]
) {
  const categoryWeight = getCategoryWeight(profile, "financial");
  if (categoryWeight <= 0) {
    return;
  }

  const basePrice = property.estimatedPurchasePrice ?? property.askingPrice;
  const projectedTotal =
    asNumber(facts.get("finance.projected_total_investment")) ??
    (basePrice !== null
      ? basePrice + (asNumber(facts.get("renovation.expected_cost")) ?? 0)
      : null);

  if (projectedTotal === null) {
    missingData.push("Asking price or estimated purchase price is missing.");
    return;
  }

  const target = profile.budget.totalProjectBudgetTarget;
  const max = profile.budget.totalProjectBudgetMax;
  let fraction = 1;
  let detail = "Projected total investment is within target.";

  if (target !== null && projectedTotal > target) {
    fraction = 0.7;
    detail = "Projected total investment is above target.";
  }

  if (max !== null && projectedTotal > max) {
    fraction = 0.25;
    detail = "Projected total investment is above maximum.";
  }

  const points = round(categoryWeight * fraction);
  addCategoryScore(categoryScores, "financial", points, categoryWeight);

  if (fraction >= 0.7) {
    positiveFactors.push({
      ruleKey: "finance.projected_total_investment",
      label: "Financial fit",
      category: "financial",
      result: "bonus",
      points,
      detail
    });
  } else {
    penalties.push({
      ruleKey: "finance.projected_total_investment",
      label: "Financial fit",
      category: "financial",
      result: "penalty",
      points: round(points - categoryWeight),
      detail
    });
  }
}

function evaluateFeaturePreferences(
  profile: SearchProfile,
  facts: FactIndex,
  categoryScores: Record<ProfileCategory, number>,
  positiveFactors: RuleResult[],
  penalties: RuleResult[],
  hardRejectReasons: RuleResult[],
  missingData: string[]
) {
  const enabledFeatures = profile.featurePreferences.filter(
    (preference) => preference.enabled
  );

  for (const preference of enabledFeatures) {
    const value = facts.get(preference.featureKey);
    const categoryWeight = getCategoryWeight(profile, preference.category);

    if (preference.mode === "hard_reject") {
      if (value === undefined) {
        continue;
      }

      if (isTruthyFact(value)) {
        hardRejectReasons.push(
          createRuleResult(preference, "hard_reject", 0, "Hard deal breaker matched")
        );
      }

      continue;
    }

    if (preference.mode === "neutral") {
      continue;
    }

    if (value === undefined) {
      continue;
    }

    if (!isTruthyFact(value)) {
      continue;
    }

    const rawPoints = preference.weight;
    const categoryCap = categoryWeight > 0 ? categoryWeight : Math.max(0, rawPoints);

    if (preference.mode === "bonus") {
      const points = Math.max(0, rawPoints);
      addCategoryScore(
        categoryScores,
        preference.category,
        points,
        Math.max(categoryCap, categoryScores[preference.category])
      );
      positiveFactors.push(
        createRuleResult(preference, "bonus", points, "Weighted preference matched")
      );
    } else {
      const penaltyPoints = rawPoints < 0 ? rawPoints : -rawPoints;
      addCategoryScore(
        categoryScores,
        preference.category,
        penaltyPoints,
        Math.max(categoryCap, categoryScores[preference.category])
      );
      penalties.push(
        createRuleResult(
          preference,
          "penalty",
          penaltyPoints,
          "Weighted penalty matched"
        )
      );
    }
  }

  const hasSettingPreferences = enabledFeatures.some(
    (preference) => preference.category === "setting" && preference.mode === "bonus"
  );
  const hasSettingFacts = [...facts.keys()].some((key) => key.startsWith("setting."));

  if (hasSettingPreferences && !hasSettingFacts) {
    missingData.push("Setting and view facts are missing.");
  }

  const hasStylePreferences = enabledFeatures.some(
    (preference) => preference.category === "style" && preference.mode === "bonus"
  );

  if (hasStylePreferences && ![...facts.keys()].some((key) => key.startsWith("style."))) {
    missingData.push("House style is missing.");
  }

  const hasRenovationPreferences = enabledFeatures.some(
    (preference) => preference.category === "renovation"
  );
  const hasRenovationFacts = [...facts.keys()].some((key) =>
    key.startsWith("renovation.")
  );

  if (hasRenovationPreferences && !hasRenovationFacts) {
    missingData.push("Renovation scope and expected cost are missing.");
  }
}

function scoreLabel(profile: SearchProfile, normalizedScore: number, hardRejected: boolean) {
  if (hardRejected) {
    return "Rejected by Profile";
  }

  const threshold = profile.scoreThresholds
    .slice()
    .sort((a, b) => b.minimumScore - a.minimumScore)
    .find((item) => normalizedScore >= item.minimumScore);

  return threshold?.label ?? "Unlabeled";
}

export function evaluateProperty(
  property: PropertyRecord,
  profile: SearchProfile,
  evaluatedAt = nowIso(),
  createId = createEvaluationId
): ScoreEvaluation {
  const facts = createFactIndex(property);
  const positiveFactors: RuleResult[] = [];
  const penalties: RuleResult[] = [];
  const hardRejectReasons: RuleResult[] = [];
  const missingData: string[] = [];
  const categoryScores = Object.fromEntries(
    categoryKeys.map((category) => [category, 0])
  ) as Record<ProfileCategory, number>;

  evaluateLocation(
    property,
    profile,
    facts,
    categoryScores,
    positiveFactors,
    penalties,
    hardRejectReasons,
    missingData
  );
  evaluateBudget(
    property,
    profile,
    facts,
    categoryScores,
    positiveFactors,
    penalties,
    missingData
  );
  evaluateFeaturePreferences(
    profile,
    facts,
    categoryScores,
    positiveFactors,
    penalties,
    hardRejectReasons,
    missingData
  );

  if (
    profile.acreage.isHardMinimum &&
    profile.acreage.minimumAcres !== null &&
    property.lotAcres !== null &&
    property.lotAcres < profile.acreage.minimumAcres
  ) {
    hardRejectReasons.push({
      ruleKey: "acreage.minimum",
      label: "Minimum acreage",
      category: "setting",
      result: "hard_reject",
      points: 0,
      detail: `${property.lotAcres} acres is below ${profile.acreage.minimumAcres} acre minimum`
    });
  }

  if (
    profile.acreage.minimumAcres !== null &&
    property.lotAcres === null
  ) {
    missingData.push("Lot acreage is missing.");
  }

  const totalConfiguredWeight =
    profile.categoryWeights
      .filter((weight) => weight.enabled)
      .reduce((total, weight) => total + weight.weight, 0) || 100;
  const rawScore = round(
    Object.values(categoryScores).reduce((total, value) => total + value, 0)
  );
  const normalizedScore = clamp(
    Math.round((rawScore / totalConfiguredWeight) * 100),
    0,
    100
  );
  const hardRejected = hardRejectReasons.length > 0;

  return scoreEvaluationSchema.parse({
    id: createId(),
    propertyId: property.id,
    profileId: profile.id,
    profileVersion: profile.version,
    scoringEngineVersion,
    rawScore,
    normalizedScore,
    scoreLabel: scoreLabel(profile, normalizedScore, hardRejected),
    hardRejected,
    hardRejectReasons,
    positiveFactors: positiveFactors.sort((a, b) => b.points - a.points),
    penalties: penalties.sort((a, b) => a.points - b.points),
    missingData: [...new Set(missingData)],
    categoryScores,
    evaluatedAt
  });
}

export function createEvaluationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `score-${Date.now()}`;
}
