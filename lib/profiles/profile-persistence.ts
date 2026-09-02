import {
  type ProfileState,
  type SearchProfile,
  profileStateSchema,
  searchProfileSchema
} from "@/lib/profiles/types";
import {
  quietCornerSeedProfile,
  quietCornerSeedProfiles
} from "@/lib/profiles/quiet-corner-seed";

export const PROFILE_STORAGE_KEY = "re-acquisition-assistant.profiles.v1";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type LoadProfileStateResult = {
  state: ProfileState;
  source: "storage" | "seed" | "reset";
};

function nowIso() {
  return new Date().toISOString();
}

function cloneProfile(profile: SearchProfile): SearchProfile {
  return searchProfileSchema.parse(JSON.parse(JSON.stringify(profile)));
}

export function createDefaultProfileState(): ProfileState {
  const profiles = quietCornerSeedProfiles.map((profile) => cloneProfile(profile));
  const activeProfile = profiles.find((profile) => profile.isActive) ?? profiles[0];

  return {
    schemaVersion: 1,
    activeProfileId: activeProfile?.id ?? null,
    profiles
  };
}

export function loadProfileState(storage: StorageLike): LoadProfileStateResult {
  const rawValue = storage.getItem(PROFILE_STORAGE_KEY);

  if (!rawValue) {
    return {
      state: createDefaultProfileState(),
      source: "seed"
    };
  }

  try {
    const parsed = profileStateSchema.parse(JSON.parse(rawValue));

    if (parsed.profiles.length === 0) {
      return {
        state: createDefaultProfileState(),
        source: "reset"
      };
    }

    return {
      state: normalizeActiveProfile(reconcileSeedProfiles(parsed)),
      source: "storage"
    };
  } catch {
    return {
      state: createDefaultProfileState(),
      source: "reset"
    };
  }
}

export function saveProfileState(
  storage: StorageLike,
  state: ProfileState
): ProfileState {
  const parsed = profileStateSchema.parse(normalizeActiveProfile(state));
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

export function upsertProfile(
  state: ProfileState,
  profile: SearchProfile,
  timestamp = nowIso()
): ProfileState {
  const parsedProfile = searchProfileSchema.parse({
    ...profile,
    version: profile.version + 1,
    updatedAt: timestamp
  });
  const existingProfile = state.profiles.find((item) => item.id === profile.id);
  const profiles = existingProfile
    ? state.profiles.map((item) =>
        item.id === profile.id ? parsedProfile : item
      )
    : [...state.profiles, parsedProfile];

  return normalizeActiveProfile({
    ...state,
    profiles
  });
}

export function duplicateProfile(
  state: ProfileState,
  profileId: string,
  createId = createProfileId,
  timestamp = nowIso()
): ProfileState {
  const source = state.profiles.find((profile) => profile.id === profileId);

  if (!source) {
    return state;
  }

  const duplicate = searchProfileSchema.parse({
    ...cloneProfile(source),
    id: createId(),
    name: `${source.name} Copy`,
    isActive: false,
    isArchived: false,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  return normalizeActiveProfile({
    ...state,
    profiles: [...state.profiles, duplicate]
  });
}

export function setActiveProfile(
  state: ProfileState,
  profileId: string,
  timestamp = nowIso()
): ProfileState {
  return normalizeActiveProfile({
    ...state,
    activeProfileId: profileId,
    profiles: state.profiles.map((profile) => {
      const shouldBeActive = profile.id === profileId && !profile.isArchived;

      if (profile.isActive === shouldBeActive) {
        return profile;
      }

      return {
        ...profile,
        isActive: shouldBeActive,
        version: profile.version + 1,
        updatedAt: timestamp
      };
    })
  });
}

export function archiveProfile(
  state: ProfileState,
  profileId: string,
  timestamp = nowIso()
): ProfileState {
  return normalizeActiveProfile({
    ...state,
    profiles: state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      return {
        ...profile,
        isActive: false,
        isArchived: true,
        version: profile.version + 1,
        updatedAt: timestamp
      };
    })
  });
}

export function createProfileId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `profile-${Date.now()}`;
}

function normalizeActiveProfile(state: ProfileState): ProfileState {
  const activeProfile = state.profiles.find(
    (profile) => profile.id === state.activeProfileId && !profile.isArchived
  );
  const fallbackActiveProfile =
    activeProfile ??
    state.profiles.find((profile) => profile.isActive && !profile.isArchived) ??
    state.profiles.find((profile) => !profile.isArchived) ??
    null;

  const activeProfileId = fallbackActiveProfile?.id ?? null;

  return {
    ...state,
    activeProfileId,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      isActive: profile.id === activeProfileId && !profile.isArchived
    }))
  };
}

function reconcileSeedProfiles(state: ProfileState): ProfileState {
  const existingProfileIds = new Set(state.profiles.map((profile) => profile.id));
  let renamedSeedProfile = false;
  let updatedSeedProfilePreferences = false;
  const reconciledProfiles = state.profiles.map((profile) => {
    const seedProfile = quietCornerSeedProfiles.find(
      (candidate) => candidate.id === profile.id
    );
    let nextProfile = profile;

    if (
      profile.id === quietCornerSeedProfile.id &&
      profile.name === "Quiet Corner Second Home"
    ) {
      renamedSeedProfile = true;

      nextProfile = {
        ...profile,
        name: quietCornerSeedProfile.name
      };
    }

    if (!seedProfile) {
      return nextProfile;
    }

    const existingFeatureKeys = new Set(
      nextProfile.featurePreferences.map((preference) => preference.featureKey)
    );
    const missingFeaturePreferences = seedProfile.featurePreferences.filter(
      (preference) => !existingFeatureKeys.has(preference.featureKey)
    );
    const existingCategoryKeys = new Set(
      nextProfile.categoryWeights.map((weight) => weight.categoryKey)
    );
    const missingCategoryWeights = seedProfile.categoryWeights.filter(
      (weight) => !existingCategoryKeys.has(weight.categoryKey)
    );

    if (
      missingFeaturePreferences.length === 0 &&
      missingCategoryWeights.length === 0
    ) {
      return nextProfile;
    }

    updatedSeedProfilePreferences = true;

    return {
      ...nextProfile,
      featurePreferences: [
        ...nextProfile.featurePreferences,
        ...missingFeaturePreferences
      ],
      categoryWeights: [...nextProfile.categoryWeights, ...missingCategoryWeights],
      version: nextProfile.version + 1,
      updatedAt: nowIso()
    };
  });
  const missingSeedProfiles = quietCornerSeedProfiles
    .filter((profile) => !existingProfileIds.has(profile.id))
    .map((profile) => ({
      ...cloneProfile(profile),
      isActive: false
    }));

  if (
    missingSeedProfiles.length === 0 &&
    !renamedSeedProfile &&
    !updatedSeedProfilePreferences
  ) {
    return state;
  }

  return {
    ...state,
    profiles: [...reconciledProfiles, ...missingSeedProfiles]
  };
}
