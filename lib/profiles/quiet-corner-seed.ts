import type {
  CategoryWeight,
  FeaturePreference,
  PreferenceMode,
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
  ["setting.country_mountain_view", "Country / Mountain View", 1, 18],
  ["setting.open_fields_pastoral", "Open Fields / Pastoral", 2, 16],
  ["setting.horse_property", "Horse Property", 3, 14],
  ["setting.small_farm", "Small Farm", 4, 13],
  ["setting.river_frontage", "River Frontage", 5, 12],
  ["setting.lake_view", "Lake View", 6, 10],
  ["setting.pond_view", "Pond View", 7, 8],
  ["setting.lake_frontage", "Lake Frontage", 8, 7],
  ["setting.pond_frontage", "Pond Frontage", 9, 6],
  ["setting.historic_new_england", "Historic New England Setting", 10, 5],
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

const renovationScope = [
  ["renovation.paint", "Paint", "bonus", 2],
  ["renovation.flooring", "Flooring", "bonus", 2],
  ["renovation.kitchen", "Kitchen", "bonus", 3],
  ["renovation.bathrooms", "Bathrooms", "bonus", 3],
  ["renovation.lighting", "Lighting", "bonus", 1],
  ["renovation.landscaping", "Landscaping", "bonus", 1],
  ["renovation.windows", "Windows", "bonus", 1],
  ["renovation.siding", "Siding", "bonus", 1],
  ["renovation.deck_porch", "Deck / porch", "bonus", 1],
  ["renovation.minor_layout", "Minor layout changes", "bonus", 2],
  ["renovation.foundation_repair", "Foundation repair", "penalty", -12],
  ["renovation.structural_rehabilitation", "Structural rehabilitation", "penalty", -14],
  ["renovation.whole_house_gut", "Whole-house gut renovation", "penalty", -16],
  ["renovation.major_addition", "Major addition", "penalty", -12],
  [
    "renovation.extensive_systems_replacement",
    "Extensive electrical/plumbing replacement",
    "penalty",
    -12
  ]
] as const;

const turnkeyRenovationScope = [
  ["renovation.paint", "Paint", "bonus", 2],
  ["renovation.flooring", "Flooring", "bonus", 1],
  ["renovation.kitchen", "Kitchen", "penalty", -8],
  ["renovation.bathrooms", "Bathrooms", "penalty", -8],
  ["renovation.lighting", "Lighting", "bonus", 1],
  ["renovation.landscaping", "Landscaping", "bonus", 1],
  ["renovation.windows", "Windows", "penalty", -6],
  ["renovation.siding", "Siding", "penalty", -6],
  ["renovation.deck_porch", "Deck / porch", "penalty", -4],
  ["renovation.minor_layout", "Minor layout changes", "penalty", -6],
  ["renovation.foundation_repair", "Foundation repair", "penalty", -16],
  [
    "renovation.structural_rehabilitation",
    "Structural rehabilitation",
    "penalty",
    -18
  ],
  ["renovation.whole_house_gut", "Whole-house gut renovation", "penalty", -20],
  ["renovation.major_addition", "Major addition", "penalty", -16],
  [
    "renovation.extensive_systems_replacement",
    "Extensive electrical/plumbing replacement",
    "penalty",
    -16
  ]
] as const;

export const quietCornerSeedProfile: SearchProfile = {
  id: "seed-quiet-corner-second-home",
  name: "Quiet Corner Second Home Rehab",
  description:
    "Acquire a dated or cosmetically unattractive home on an exceptional property, then complete a moderate renovation.",
  strategy:
    "Prioritize scarce setting and resale attributes over current interior finishes.",
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
    ...renovationScope.map(
      ([featureKey, featureLabel, mode, weight], index): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "renovation",
        rank: index + 1,
        weight,
        mode: mode as PreferenceMode,
        enabled: true
      })
    )
  ],
  categoryWeights: (
    [
    ["location", "Location / commute", 18],
    ["setting", "Setting / views", 28],
    ["style", "House character / style", 8],
    ["renovation", "Renovation fit", 14],
    ["financial", "Financial fit", 14],
    ["resale", "Resale potential", 12],
    ["maintenance", "Maintenance burden", 4],
    ["risk", "Risk / nuisances", 2]
    ] as const
  ).map(
    ([categoryKey, categoryLabel, weight]): CategoryWeight => ({
      id: `category-${categoryKey}`,
      categoryKey,
      categoryLabel,
      weight,
      enabled: true
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

export const quietCornerTurnkeySeedProfile: SearchProfile = {
  ...quietCornerSeedProfile,
  id: "seed-quiet-corner-turnkey",
  name: "Quiet Corner Turnkey",
  description:
    "Acquire a move-in-ready Quiet Corner second home with exceptional setting and only minimal refresh work.",
  strategy:
    "Prioritize scarce setting and resale attributes while avoiding properties that require meaningful renovation.",
  isActive: false,
  budget: {
    ...quietCornerSeedProfile.budget,
    renovationBudgetTarget: 7500,
    renovationBudgetMax: 15000
  },
  renovationTolerance: "turnkey_minimal_refresh",
  featurePreferences: [
    ...quietCornerSeedProfile.featurePreferences.filter(
      (preference) => preference.category !== "renovation"
    ),
    ...turnkeyRenovationScope.map(
      ([featureKey, featureLabel, mode, weight], index): FeaturePreference => ({
        id: `feature-${idFrom(featureKey)}`,
        featureKey,
        featureLabel,
        category: "renovation",
        rank: index + 1,
        weight,
        mode: mode as PreferenceMode,
        enabled: true
      })
    )
  ]
};

export const quietCornerSeedProfiles = [
  quietCornerSeedProfile,
  quietCornerTurnkeySeedProfile
] as const;
