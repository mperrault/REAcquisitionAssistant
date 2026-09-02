import { describe, expect, it } from "vitest";

import {
  PROFILE_STORAGE_KEY,
  archiveProfile,
  createDefaultProfileState,
  duplicateProfile,
  loadProfileState,
  saveProfileState,
  setActiveProfile,
  upsertProfile,
  type StorageLike
} from "@/lib/profiles/profile-persistence";
import type { ProfileState, SearchProfile } from "@/lib/profiles/types";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function cloneProfile(profile: SearchProfile): SearchProfile {
  return JSON.parse(JSON.stringify(profile)) as SearchProfile;
}

function firstProfile(state: ProfileState) {
  const profile = state.profiles[0];

  if (!profile) {
    throw new Error("Expected a profile");
  }

  return profile;
}

describe("profile persistence", () => {
  it("seeds the initial Quiet Corner profiles when storage is empty", () => {
    const storage = new MemoryStorage();
    const result = loadProfileState(storage);
    const profile = firstProfile(result.state);
    const turnkeyProfile = result.state.profiles.find(
      (item) => item.id === "seed-quiet-corner-turnkey"
    );

    expect(result.source).toBe("seed");
    expect(result.state.profiles).toHaveLength(2);
    expect(profile.name).toBe("Quiet Corner Second Home Rehab");
    expect(profile.isActive).toBe(true);
    expect(profile.townPreferences).toHaveLength(14);
    expect(profile.featurePreferences.length).toBeGreaterThan(30);
    expect(profile.categoryWeights).toHaveLength(8);
    expect(profile.scoreThresholds).toHaveLength(5);
    expect(turnkeyProfile).toMatchObject({
      name: "Quiet Corner Turnkey",
      isActive: false,
      renovationTolerance: "turnkey_minimal_refresh",
      budget: {
        renovationBudgetMax: 15000,
        totalProjectBudgetTarget: 400000,
        totalProjectBudgetMax: 450000
      }
    });
  });

  it("reconciles stored seed profiles without wiping user edits", () => {
    const storage = new MemoryStorage();
    const oldSeed = cloneProfile(firstProfile(createDefaultProfileState()));
    const editedProfile = {
      ...oldSeed,
      name: "Quiet Corner Second Home",
      budget: {
        ...oldSeed.budget,
        totalProjectBudgetTarget: 425000
      }
    };

    storage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: editedProfile.id,
        profiles: [editedProfile]
      })
    );

    const result = loadProfileState(storage);
    const rehabProfile = result.state.profiles.find(
      (profile) => profile.id === oldSeed.id
    );
    const turnkeyProfile = result.state.profiles.find(
      (profile) => profile.id === "seed-quiet-corner-turnkey"
    );

    expect(result.source).toBe("storage");
    expect(result.state.profiles).toHaveLength(2);
    expect(rehabProfile).toMatchObject({
      name: "Quiet Corner Second Home Rehab",
      budget: {
        totalProjectBudgetTarget: 425000
      },
      isActive: true
    });
    expect(turnkeyProfile).toMatchObject({
      name: "Quiet Corner Turnkey",
      isActive: false
    });
  });

  it("adds missing seed preferences to stored seed profiles", () => {
    const storage = new MemoryStorage();
    const oldSeed = cloneProfile(firstProfile(createDefaultProfileState()));
    const storedProfile = {
      ...oldSeed,
      budget: {
        ...oldSeed.budget,
        totalProjectBudgetTarget: 425000
      },
      featurePreferences: oldSeed.featurePreferences.filter(
        (preference) => !preference.featureKey.startsWith("resale.")
      )
    };

    storage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: storedProfile.id,
        profiles: [storedProfile]
      })
    );

    const result = loadProfileState(storage);
    const profile = firstProfile(result.state);

    expect(result.source).toBe("storage");
    expect(profile.budget.totalProjectBudgetTarget).toBe(425000);
    expect(profile.version).toBe(storedProfile.version + 1);
    expect(profile.featurePreferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureKey: "resale.strong_setting",
          category: "resale"
        }),
        expect.objectContaining({
          featureKey: "resale.desirable_town",
          category: "resale"
        })
      ])
    );
  });

  it("persists edits across every seeded preference area", () => {
    const storage = new MemoryStorage();
    const state = createDefaultProfileState();
    const draft = cloneProfile(firstProfile(state));

    draft.name = "Edited Quiet Corner";
    draft.budget.totalProjectBudgetTarget = 425000;
    draft.commute.anchorAddress = "100 Main St, Stafford Springs, CT";
    draft.commute.maxMinutes = 38;
    draft.acreage.minimumAcres = 2.5;
    draft.townPreferences[0] = {
      ...draft.townPreferences[0],
      town: "Stafford",
      tier: 2,
      weight: 11
    };
    draft.featurePreferences[0] = {
      ...draft.featurePreferences[0],
      mode: "penalty",
      weight: -4
    };
    draft.categoryWeights[0] = {
      ...draft.categoryWeights[0],
      weight: 21
    };
    draft.scoreThresholds[0] = {
      ...draft.scoreThresholds[0],
      label: "Must See",
      minimumScore: 92
    };

    const updatedState = upsertProfile(
      state,
      draft,
      "2026-08-10T18:00:00.000Z"
    );
    saveProfileState(storage, updatedState);
    const reloaded = loadProfileState(storage);
    const profile = firstProfile(reloaded.state);

    expect(reloaded.source).toBe("storage");
    expect(profile.name).toBe("Edited Quiet Corner");
    expect(profile.version).toBe(2);
    expect(profile.budget.totalProjectBudgetTarget).toBe(425000);
    expect(profile.commute.anchorAddress).toBe(
      "100 Main St, Stafford Springs, CT"
    );
    expect(profile.commute.maxMinutes).toBe(38);
    expect(profile.acreage.minimumAcres).toBe(2.5);
    expect(profile.townPreferences[0]?.town).toBe("Stafford");
    expect(profile.townPreferences[0]?.tier).toBe(2);
    expect(profile.townPreferences[0]?.weight).toBe(11);
    expect(profile.featurePreferences[0]?.mode).toBe("penalty");
    expect(profile.featurePreferences[0]?.weight).toBe(-4);
    expect(profile.categoryWeights[0]?.weight).toBe(21);
    expect(profile.scoreThresholds[0]?.label).toBe("Must See");
    expect(profile.scoreThresholds[0]?.minimumScore).toBe(92);
  });

  it("loads stored profiles that predate commute anchor addresses", () => {
    const storage = new MemoryStorage();
    const state = createDefaultProfileState();
    const legacyProfile = cloneProfile(firstProfile(state));
    const legacyProfileJson = JSON.parse(JSON.stringify(legacyProfile)) as Record<
      string,
      unknown
    >;
    const legacyCommute = legacyProfileJson.commute as Record<string, unknown>;

    delete legacyCommute.anchorAddress;

    storage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: legacyProfile.id,
        profiles: [legacyProfileJson]
      })
    );

    const result = loadProfileState(storage);
    const profile = firstProfile(result.state);

    expect(result.source).toBe("storage");
    expect(profile.commute.anchorAddress).toBe("");
  });

  it("keeps only one active profile after duplication and activation", () => {
    const state = createDefaultProfileState();
    const duplicated = duplicateProfile(
      state,
      firstProfile(state).id,
      () => "profile-copy",
      "2026-08-10T19:00:00.000Z"
    );
    const activated = setActiveProfile(
      duplicated,
      "profile-copy",
      "2026-08-10T19:05:00.000Z"
    );

    expect(activated.profiles).toHaveLength(3);
    expect(activated.activeProfileId).toBe("profile-copy");
    expect(activated.profiles.filter((profile) => profile.isActive)).toHaveLength(1);
    expect(
      activated.profiles.find((profile) => profile.id === "profile-copy")?.isActive
    ).toBe(true);
  });

  it("archives an active profile and falls back to another available profile", () => {
    const state = createDefaultProfileState();
    const duplicated = duplicateProfile(
      state,
      firstProfile(state).id,
      () => "profile-copy",
      "2026-08-10T20:00:00.000Z"
    );
    const archived = archiveProfile(
      duplicated,
      firstProfile(state).id,
      "2026-08-10T20:10:00.000Z"
    );

    expect(archived.activeProfileId).toBe("seed-quiet-corner-turnkey");
    expect(archived.profiles.find((profile) => profile.id === firstProfile(state).id))
      .toMatchObject({
        isActive: false,
        isArchived: true
      });
    expect(
      archived.profiles.find((profile) => profile.id === "seed-quiet-corner-turnkey")
        ?.isActive
    ).toBe(true);
  });
});
