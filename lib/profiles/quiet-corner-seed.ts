import type {
  CategoryWeight,
  FeaturePreference,
  ProfileCategory,
  ScoreThreshold,
  SearchProfile,
  TownPreference
} from "@/lib/profiles/types";

const seededAt = "2026-08-10T00:00:00.000Z";

function idFrom(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const townData = [
  ["Stafford / Stafford Springs", "CT", 1, 1, 15],
  ["Woodstock", "CT", 2, 1, 14],
  ["Union", "CT", 3, 1, 13],
  ["Ashford", "CT", 4, 1, 12],
  ["Somers", "CT", 5, 2, 10],
  ["Ellington", "CT", 6, 2, 9],
  ["Mansfield", "CT", 7, 2, 8],
  ["Pomfret", "CT", 8, 2, 7],
  ["Thompson", "CT", 9, 3, 6],
  ["Brooklyn", "CT", 10, 3, 5],
  ["Hampton", "CT", 11, 3, 4],
  ["Tolland", "CT", 12, 3, 3],
  ["Brimfield", "MA", 13, 3, 2],
  ["Wales", "MA", 14, 3, 1]
] as const;

const settingPreferences = [
  ["setting.waterfront_or_water_access", "Waterfront / Water Access", 1, 12],
  ["setting.lake_frontage", "Lake Frontage", 2, 18],
  ["setting.pond_frontage", "Pond Frontage", 3, 16],
  ["setting.river_frontage", "River Frontage", 4, 16],
  ["setting.lake_view", "Lake View", 5, 14],
  ["setting.pond_view", "Pond View", 6, 12],
  ["setting.country_mountain_view", "Country / Mountain View", 7, 12],
  ["setting.open_fields_pastoral", "Open Fields / Pastoral", 8, 10],
  ["setting.horse_property", "Horse Property", 9, 8],
  ["setting.small_farm", "Small Farm", 10, 8],
  ["setting.woods_privacy", "Woods / Privacy", 11, 4]
] as const;

const stylePreferences = [
  ["style.cape", "Cape", 1, 7],
  ["style.cottage", "Cottage", 2, 6],
  ["style.farmhouse", "Farmhouse", 3, 5],
  ["style.ranch", "Ranch", 4, 3],
  ["style.colonial", "Colonial", 5, 2],
  ["style.contemporary", "Contemporary", 6, 1],
  ["style.log_home", "Log Home", 7, 0]
] as const;

const hardDealBreakers = [
  ["risk.busy_road", "Busy road"],
  ["risk.flood_zone", "Flood zone"],
  ["risk.hoa", "HOA"],
  ["risk.steep_driveway", "Steep driveway"],
  ["risk.electric_baseboard_heat", "Electric baseboard heat"],
  ["risk.high_voltage_power_lines", "High-voltage power lines nearby"],
  ["risk.visible_cell_tower", "Visible cell tower"],
  ["risk.railroad_nearby", "Railroad nearby"],
  ["location.drive_time_over_max", "Drive time over maximum"]
] as const;

const neutralFacts = [
  ["utility.shared_driveway", "Shared driveway"],
  ["utility.oil_heat", "Oil heat"],
  ["utility.propane", "Propane"],
  ["utility.well", "Well"],
  ["utility.septic", "Septic"],
  ["maintenance.no_garage", "No garage"],
  ["risk.wetlands", "Wetlands"]
] as const;

function categoryFromFeatureKey(featureKey: string): ProfileCategory {
  if (featureKey.startsWith("maintenance.")) {
    return "maintenance";
  }

  if (featureKey.startsWith("risk.")) {
    return "risk";
  }

  if (featureKey.startsWith("location.")) {
    return "location";
  }

  return "utility";
}

const retiredRenovationPreferenceKeys = [
  "renovation.paint",
  "renovation.flooring",
  "renovation.kitchen",
  "renovation.bathrooms",
  "renovation.lighting",
  "renovation.landscaping",
  "renovation.windows",
  "renovation.siding",
  "renovation.deck_porch",
  "renovation.minor_layout",
  "renovation.foundation_repair",
  "renovation.structural_rehabilitation",
  "renovation.whole_house_gut",
  "renovation.major_addition",
  "renovation.extensive_systems_replacement"
] as const;

export const retiredSeedPreferenceKeys = new Set<string>([
  ...retiredRenovationPreferenceKeys
]);

const financialPreferences = [
  ["financial.low_price_per_sqft", "Low price per sqft", 1, 8],
  ["financial.very_low_price_per_sqft", "Very low price per sqft", 2, 4]
] as const;

const resalePreferences = [
  ["resale.strong_setting", "Strong scarce setting", 1, 4],
  ["resale.waterfront_demand", "Waterfront resale demand", 2, 5],
  ["resale.desirable_town", "Desirable Quiet Corner town", 3, 3],
  ["resale.below_purchase_target", "Below purchase target", 4, 2],
  ["resale.three_plus_bedrooms", "3+ bedrooms", 5, 1],
  ["resale.two_plus_baths", "2+ baths", 6, 1],
  ["resale.usable_acreage", "Usable acreage", 7, 1]
] as const;

export const quietCornerSeedProfile: SearchProfile = {
  id: "seed-quiet-corner-second-home",
  name: "Quiet Corner Second Home",
  description:
    "Acquire a well-located Quiet Corner second home with strong setting, value, manageable condition, and resale fundamentals.",
  strategy:
    "Prioritize scarce water/setting attributes, short commute, good value, and manageable renovation exposure.",
  isActive: true,
  isArchived: false,
  version: 1,
  createdAt: seededAt,
  updatedAt: seededAt,
  budget: {
    purchasePriceTarget: 300000,
    purchasePriceMax: 350000,
    renovationBudgetTarget: 75000,
    renovationBudgetMax: 125000,
    totalProjectBudgetTarget: 400000,
    totalProjectBudgetMax: 450000
  },
  commute: {
    anchorLabel: "Commute anchor",
    anchorAddress: "",
    anchorLat: null,
    anchorLng: null,
    idealMinutes: 30,
    preferredMinutes: 35,
    maxMinutes: 40
  },
  acreage: {
    minimumAcres: null,
    isHardMinimum: false
  },
  renovationTolerance: "moderate_remodel",
  townPreferences: townData.map(
    ([town, state, rank, tier, weight]): TownPreference => ({
      id: `town-${idFrom(`${town}-${state}`)}`,
      town,
      state,
      rank,
      tier,
      weight,
      enabled: true
    })
  ),
  featurePreferences: [
    ...settingPreferences.map(
      ([featureKey, featureLabel, rank, weight]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "setting",
        rank,
        weight,
        mode: "bonus",
        enabled: true
      })
    ),
    ...stylePreferences.map(
      ([featureKey, featureLabel, rank, weight]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "style",
        rank,
        weight,
        mode: "bonus",
        enabled: true
      })
    ),
    ...hardDealBreakers.map(
      ([featureKey, featureLabel]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: featureKey.startsWith("location.") ? "location" : "risk",
        rank: null,
        weight: -100,
        mode: "hard_reject",
        enabled: true
      })
    ),
    ...neutralFacts.map(
      ([featureKey, featureLabel]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: categoryFromFeatureKey(featureKey),
        rank: null,
        weight: 0,
        mode: "neutral",
        enabled: true
      })
    ),
    ...financialPreferences.map(
      ([featureKey, featureLabel, rank, weight]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "financial",
        rank,
        weight,
        mode: "bonus",
        enabled: true
      })
    ),
    ...resalePreferences.map(
      ([featureKey, featureLabel, rank, weight]): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "resale",
        rank,
        weight,
        mode: "bonus",
        enabled: true
      })
    )
  ],
  categoryWeights: (
    [
      ["location", "Location / commute", 18],
      ["setting", "Setting / views", 28],
      ["style", "House character / style", 6],
      ["renovation", "Condition / renovation burden", 10],
      ["financial", "Financial fit", 22],
      ["resale", "Resale potential", 16],
      ["maintenance", "Maintenance burden", 0],
      ["risk", "Risk / nuisances", 0],
      ["utility", "Utilities", 0]
    ] as const
  ).map(
    ([categoryKey, categoryLabel, weight]): CategoryWeight => ({
      id: `category-${categoryKey}`,
      categoryKey,
      categoryLabel,
      weight,
      enabled: weight > 0
    })
  ),
  scoreThresholds: (
    [
      ["Exceptional", 90, 1],
      ["Strong Candidate", 80, 2],
      ["Worth Reviewing", 70, 3],
      ["Marginal", 60, 4],
      ["Weak Match", 0, 5]
    ] as const
  ).map(
    ([label, minimumScore, sortOrder]): ScoreThreshold => ({
      id: `threshold-${idFrom(label)}`,
      label,
      minimumScore,
      sortOrder
    })
  )
};

export const quietCornerSeedProfiles = [quietCornerSeedProfile] as const;
