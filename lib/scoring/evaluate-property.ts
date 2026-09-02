import type {
  FeaturePreference,
  ProfileCategory,
  SearchProfile
} from "@/lib/profiles/types";
import { matchesTownPreference } from "@/lib/profiles/town-matching";
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

function asString(value: FactValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const renovationScopeFromText = [
  {
    factKey: "renovation.kitchen",
    pattern: /\bkitchen|cabinet|countertop|backsplash\b/i
  },
  {
    factKey: "renovation.bathrooms",
    pattern: /\bbath(?:room)?|shower|tub|vanity|toilet\b/i
  },
  {
    factKey: "renovation.flooring",
    pattern: /\bfloor|flooring|carpet|hardwood|vinyl|tile\b/i
  },
  {
    factKey: "renovation.paint",
    pattern: /\bpaint|wallpaper|interior refresh\b/i
  },
  {
    factKey: "renovation.lighting",
    pattern: /\blight|lighting|fixture\b/i
  },
  {
    factKey: "renovation.landscaping",
    pattern: /\blandscap|yard|grounds?|brush|tree\b/i
  },
  {
    factKey: "renovation.windows",
    pattern: /\bwindow\b/i
  },
  {
    factKey: "renovation.siding",
    pattern: /\bsiding|exterior paint|clapboard\b/i
  },
  {
    factKey: "renovation.deck_porch",
    pattern: /\bdeck|porch|stairs?|railing\b/i
  },
  {
    factKey: "renovation.minor_layout",
    pattern: /\blayout|partition|opening|wall removal\b/i
  }
] as const;

const strongResaleSettingKeys = [
  "setting.country_mountain_view",
  "setting.open_fields_pastoral",
  "setting.horse_property",
  "setting.small_farm",
  "setting.river_frontage",
  "setting.lake_view",
  "setting.pond_view",
  "setting.lake_frontage",
  "setting.pond_frontage",
  "setting.woods_privacy"
];

function inferRenovationScopeFactKey(factKey: string, label: string) {
  if (!factKey.startsWith("renovation.line_item.")) {
    return null;
  }

  const searchText = `${factKey} ${label}`;

  return (
    renovationScopeFromText.find((scope) => scope.pattern.test(searchText))
      ?.factKey ?? null
  );
}

function createFactIndex(property: PropertyRecord, profile: SearchProfile): FactIndex {
  const facts = new Map<string, FactValue>();

  for (const fact of property.facts) {
    facts.set(fact.factKey, fact.value);

    const derivedRenovationScope = inferRenovationScopeFactKey(
      fact.factKey,
      fact.label
    );

    if (derivedRenovationScope && !facts.has(derivedRenovationScope)) {
      facts.set(derivedRenovationScope, true);
    }
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

  if (property.bedrooms !== null) {
    setDerivedFact("resale.three_plus_bedrooms", property.bedrooms >= 3);
  }

  if (property.bathrooms !== null) {
    setDerivedFact("resale.two_plus_baths", property.bathrooms >= 2);
  }

  if (property.lotAcres !== null) {
    setDerivedFact("resale.usable_acreage", property.lotAcres >= 0.75);
  }

  const basePrice = property.estimatedPurchasePrice ?? property.askingPrice;

  if (basePrice !== null && profile.budget.purchasePriceTarget !== null) {
    setDerivedFact(
      "resale.below_purchase_target",
      basePrice <= profile.budget.purchasePriceTarget
    );
  }

  const townPreference = profile.townPreferences.find(
    (preference) =>
      preference.enabled &&
      preference.tier <= 2 &&
      matchesTownPreference(preference, property.city, property.state)
  );

  if (property.city && property.state) {
    setDerivedFact("resale.desirable_town", Boolean(townPreference));
  }

  setDerivedFact(
    "resale.strong_setting",
    strongResaleSettingKeys.some((key) => isTruthyFact(facts.get(key) ?? null))
  );

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
      matchesTownPreference(preference, property.city, property.state)
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
    const driveTimeError = asString(facts.get("location.drive_time_error"));
    const hasCommuteAnchor =
      Boolean(profile.commute.anchorAddress.trim()) ||
      (profile.commute.anchorLat !== null && profile.commute.anchorLng !== null);
    const hasPropertyAddress = Boolean(
      property.addressLine1.trim() && property.city.trim() && property.state.trim()
    );

    if (driveTimeError) {
      missingData.push(
        `Drive time is missing for commute scoring: ${driveTimeError}`
      );
    } else if (!hasCommuteAnchor) {
      missingData.push(
        "Drive time is missing for commute scoring because the active profile has no commute anchor address or coordinates."
      );
    } else if (!hasPropertyAddress) {
      missingData.push(
        "Drive time is missing for commute scoring because the property address is incomplete."
      );
    } else {
      missingData.push(
        "Drive time is missing for commute scoring. Run Drive Time or Enrich to calculate it from the active profile commute anchor."
      );
    }

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

  const renovationLineItemTotal = [...facts.entries()]
    .filter(([key]) => key.startsWith("renovation.line_item."))
    .reduce((total, [, value]) => total + (asNumber(value) ?? 0), 0);
  const expectedRenovationCost =
    asNumber(facts.get("renovation.expected_cost")) ??
    (renovationLineItemTotal > 0 ? renovationLineItemTotal : null);
  const basePrice = property.estimatedPurchasePrice ?? property.askingPrice;
  const contingencyAmount = asNumber(facts.get("renovation.contingency_amount"));
  const closingCosts = asNumber(facts.get("finance.closing_costs"));
  const storedProjectedTotal = asNumber(
    facts.get("finance.projected_total_investment")
  );
  const projectedTotal =
    storedProjectedTotal ??
    (basePrice !== null && expectedRenovationCost !== null
      ? basePrice +
        expectedRenovationCost +
        (contingencyAmount ?? 0) +
        (closingCosts ?? 0)
      : null);

  if (projectedTotal === null) {
    if (basePrice === null) {
      missingData.push("Asking price or estimated purchase price is missing.");
    }

    if (storedProjectedTotal === null && expectedRenovationCost === null) {
      missingData.push(
        "Expected renovation cost is missing for total investment scoring."
      );
    }

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

  const hasStyleFacts = enabledFeatures.some(
    (preference) =>
      preference.category === "style" &&
      preference.mode === "bonus" &&
      isTruthyFact(facts.get(preference.featureKey) ?? null)
  );

  if (hasStylePreferences && !hasStyleFacts) {
    const styleError = asString(facts.get("style.inference_error"));

    missingData.push(
      styleError ? `House style is missing: ${styleError}` : "House style is missing."
    );
  }

  const hasRenovationPreferences = enabledFeatures.some(
    (preference) => preference.category === "renovation"
  );
  const hasRenovationFacts = [...facts.keys()].some((key) =>
    key.startsWith("renovation.")
  );

  if (hasRenovationPreferences && !hasRenovationFacts) {
    missingData.push("Renovation scope is missing.");
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
  const facts = createFactIndex(property, profile);
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
