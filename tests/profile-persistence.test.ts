import { describe, expect, it } from "vitest";

import {
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
  it("seeds the initial Quiet Corner profile when storage is empty", () => {
    const storage = new MemoryStorage();
    const result = loadProfileState(storage);
    const profile = firstProfile(result.state);

    expect(result.source).toBe("seed");
    expect(profile.name).toBe("Quiet Corner Second Home");
    expect(profile.isActive).toBe(true);
    expect(profile.townPreferences).toHaveLength(14);
    expect(profile.featurePreferences.length).toBeGreaterThan(30);
    expect(profile.categoryWeights).toHaveLength(8);
    expect(profile.scoreThresholds).toHaveLength(5);
  });

  it("persists edits across every seeded preference area", () => {
    const storage = new MemoryStorage();
    const state = createDefaultProfileState();
    const draft = cloneProfile(firstProfile(state));

    draft.name = "Edited Quiet Corner";
    draft.budget.totalProjectBudgetTarget = 425000;
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

    expect(activated.profiles).toHaveLength(2);
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

    expect(archived.activeProfileId).toBe("profile-copy");
    expect(archived.profiles.find((profile) => profile.id === firstProfile(state).id))
      .toMatchObject({
        isActive: false,
        isArchived: true
      });
    expect(
      archived.profiles.find((profile) => profile.id === "profile-copy")?.isActive
    ).toBe(true);
  });
});
