import {
  listingAlertStateSchema,
  type ListingAlertState,
  type ListingCandidate
} from "@/lib/listing-alerts/types";
import type { SearchProfile, TownPreference } from "@/lib/profiles/types";

export const OUTSIDE_PROFILE_GEOGRAPHY_WARNING =
  "Outside active profile geography.";

export type ListingCandidateGeographyFilterResult = {
  state: ListingAlertState;
  ignoredCount: number;
};

function normalizeGeographyText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createTownKey(town: string, state: string) {
  return `${normalizeGeographyText(town)}|${normalizeGeographyText(state)}`;
}

function splitTownAliases(townPreference: TownPreference) {
  return townPreference.town
    .split(/\s*\/\s*|\s+\bor\b\s+/i)
    .map(normalizeGeographyText)
    .filter(Boolean);
}

function createEnabledTownKeySet(profile: SearchProfile | null) {
  const townKeys = new Set<string>();

  for (const townPreference of profile?.townPreferences ?? []) {
    if (!townPreference.enabled) {
      continue;
    }

    for (const townAlias of splitTownAliases(townPreference)) {
      townKeys.add(createTownKey(townAlias, townPreference.state));
    }
  }

  return townKeys;
}

function hasParsedCandidateTown(candidate: ListingCandidate) {
  return Boolean(candidate.city.trim() && candidate.state.trim());
}

function shouldIgnoreCandidateForGeography(
  candidate: ListingCandidate,
  townKeys: Set<string>
) {
  if (candidate.status !== "new" || !hasParsedCandidateTown(candidate)) {
    return false;
  }

  return !townKeys.has(createTownKey(candidate.city, candidate.state));
}

function addWarning(warnings: string[], warning: string) {
  return warnings.includes(warning) ? warnings : [...warnings, warning];
}

export function countEnabledProfileTowns(profile: SearchProfile | null) {
  return (
    profile?.townPreferences.filter((townPreference) => townPreference.enabled)
      .length ?? 0
  );
}

export function isListingCandidateInsideProfileGeography(
  candidate: ListingCandidate,
  profile: SearchProfile | null
) {
  const townKeys = createEnabledTownKeySet(profile);

  if (townKeys.size === 0 || !hasParsedCandidateTown(candidate)) {
    return true;
  }

  return townKeys.has(createTownKey(candidate.city, candidate.state));
}

export function applyListingCandidateGeographyFilter(
  state: ListingAlertState,
  profile: SearchProfile | null,
  timestamp = new Date().toISOString()
): ListingCandidateGeographyFilterResult {
  const townKeys = createEnabledTownKeySet(profile);

  if (townKeys.size === 0) {
    return { state, ignoredCount: 0 };
  }

  let ignoredCount = 0;
  const candidates = state.candidates.map((candidate) => {
    if (!shouldIgnoreCandidateForGeography(candidate, townKeys)) {
      return candidate;
    }

    ignoredCount += 1;

    return {
      ...candidate,
      status: "ignored" as const,
      warnings: addWarning(
        candidate.warnings,
        OUTSIDE_PROFILE_GEOGRAPHY_WARNING
      ),
      updatedAt: timestamp
    };
  });

  if (ignoredCount === 0) {
    return { state, ignoredCount };
  }

  return {
    state: listingAlertStateSchema.parse({
      ...state,
      candidates
    }),
    ignoredCount
  };
}
