import type { TownPreference } from "@/lib/profiles/types";

export function normalizeTownMatchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createTownMatchKey(town: string, state: string) {
  return `${normalizeTownMatchText(town)}|${normalizeTownMatchText(state)}`;
}

export function splitTownPreferenceAliases(townPreference: TownPreference) {
  return townPreference.town
    .split(/\s*\/\s*|\s+\bor\s+/i)
    .map(normalizeTownMatchText)
    .filter(Boolean);
}

export function matchesTownPreference(
  townPreference: TownPreference,
  city: string,
  state: string
) {
  const propertyTownKey = createTownMatchKey(city, state);

  return splitTownPreferenceAliases(townPreference).some(
    (townAlias) =>
      createTownMatchKey(townAlias, townPreference.state) === propertyTownKey
  );
}
