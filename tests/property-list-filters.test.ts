import { describe, expect, it } from "vitest";

import {
  filterAndSortProperties
} from "@/lib/properties/property-list-filters";
import {
  createPropertyFact,
  createPropertyRecord
} from "@/lib/properties/property-persistence";
import { quietCornerSeedProfile } from "@/lib/profiles/quiet-corner-seed";
import { evaluateProperty } from "@/lib/scoring/evaluate-property";
import {
  addScoreEvaluation,
  createEmptyScoreState
} from "@/lib/scoring/score-persistence";
import type { ScoreEvaluation } from "@/lib/scoring/types";

function createEvaluation(
  property: ReturnType<typeof createPropertyRecord>,
  patch: Partial<ScoreEvaluation> = {}
) {
  return {
    ...evaluateProperty(
      property,
      quietCornerSeedProfile,
      patch.evaluatedAt ?? "2026-08-12T14:00:00.000Z",
      () => patch.id ?? `score-${property.id}`
    ),
    ...patch
  };
}

describe("property list score filters", () => {
  it("filters by latest active-profile score state and sorts by score", () => {
    const strong = createPropertyRecord({
      id: "property-strong",
      addressLine1: "12 Pasture Road",
      city: "Woodstock",
      state: "CT",
      askingPrice: 390000,
      updatedAt: "2026-08-12T13:00:00.000Z"
    });
    const rejected = createPropertyRecord({
      id: "property-rejected",
      addressLine1: "44 HOA Lane",
      city: "Stafford",
      state: "CT",
      askingPrice: 250000,
      hoaPresent: true,
      updatedAt: "2026-08-12T13:10:00.000Z",
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 25
        })
      ]
    });
    const unscored = createPropertyRecord({
      id: "property-unscored",
      addressLine1: "9 Unknown Way",
      city: "Union",
      state: "CT",
      askingPrice: null,
      updatedAt: "2026-08-12T13:20:00.000Z"
    });
    const scoreState = addScoreEvaluation(
      addScoreEvaluation(
        createEmptyScoreState(),
        createEvaluation(strong, {
          id: "score-strong",
          normalizedScore: 86,
          scoreLabel: "Strong Candidate",
          missingData: []
        })
      ),
      createEvaluation(rejected, {
        id: "score-rejected",
        hardRejected: true,
        normalizedScore: 34,
        scoreLabel: "Rejected by Profile",
        missingData: ["Renovation scope is missing."]
      })
    );
    const baseInput = {
      properties: [unscored, rejected, strong],
      scoreState,
      profileId: quietCornerSeedProfile.id,
      query: "",
      lifecycleStatus: "all" as const
    };

    expect(
      filterAndSortProperties({
        ...baseInput,
        scoreFilter: "all",
        sortMode: "score_desc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-strong", "property-rejected", "property-unscored"]);
    expect(
      filterAndSortProperties({
        ...baseInput,
        scoreFilter: "all",
        sortMode: "score_asc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-rejected", "property-strong", "property-unscored"]);
    expect(
      filterAndSortProperties({
        ...baseInput,
        scoreFilter: "hard_rejected",
        sortMode: "updated_desc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-rejected"]);
    expect(
      filterAndSortProperties({
        ...baseInput,
        scoreFilter: "missing_data",
        sortMode: "updated_desc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-rejected"]);
    expect(
      filterAndSortProperties({
        ...baseInput,
        scoreFilter: "not_scored",
        sortMode: "updated_desc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-unscored"]);
  });

  it("combines text search, lifecycle status, and price sorting", () => {
    const pasture = createPropertyRecord({
      id: "property-pasture",
      addressLine1: "12 Pasture Road",
      city: "Woodstock",
      state: "CT",
      askingPrice: 360000,
      lifecycleStatus: "watch_list",
      notes: "Quiet pasture setting"
    });
    const road = createPropertyRecord({
      id: "property-road",
      addressLine1: "90 Roadside Drive",
      city: "Woodstock",
      state: "CT",
      askingPrice: 290000,
      lifecycleStatus: "watch_list",
      notes: "Pasture view but busy road"
    });
    const differentStatus = createPropertyRecord({
      id: "property-different-status",
      addressLine1: "1 Pasture Hill",
      city: "Woodstock",
      state: "CT",
      askingPrice: 200000,
      lifecycleStatus: "rejected"
    });

    expect(
      filterAndSortProperties({
        properties: [pasture, differentStatus, road],
        scoreState: createEmptyScoreState(),
        profileId: quietCornerSeedProfile.id,
        query: "pasture",
        lifecycleStatus: "watch_list",
        scoreFilter: "all",
        sortMode: "price_asc"
      }).properties.map((property) => property.id)
    ).toEqual(["property-road", "property-pasture"]);
  });

  it("uses the supplied profile id when deciding scored versus unscored", () => {
    const property = createPropertyRecord({
      id: "property-profile-specific",
      addressLine1: "3 Cross Profile Road",
      city: "Ashford",
      state: "CT"
    });
    const otherProfileScore = createEvaluation(property, {
      id: "score-other-profile",
      profileId: "profile-other",
      profileVersion: 1,
      normalizedScore: 74,
      scoreLabel: "Other Profile Candidate"
    });
    const scoreState = addScoreEvaluation(
      createEmptyScoreState(),
      otherProfileScore
    );

    expect(
      filterAndSortProperties({
        properties: [property],
        scoreState,
        profileId: quietCornerSeedProfile.id,
        query: "",
        lifecycleStatus: "all",
        scoreFilter: "scored",
        sortMode: "updated_desc"
      }).properties
    ).toEqual([]);
    expect(
      filterAndSortProperties({
        properties: [property],
        scoreState,
        profileId: quietCornerSeedProfile.id,
        query: "",
        lifecycleStatus: "all",
        scoreFilter: "not_scored",
        sortMode: "updated_desc"
      }).properties.map((item) => item.id)
    ).toEqual(["property-profile-specific"]);
    expect(
      filterAndSortProperties({
        properties: [property],
        scoreState,
        query: "",
        lifecycleStatus: "all",
        scoreFilter: "scored",
        sortMode: "updated_desc"
      }).properties.map((item) => item.id)
    ).toEqual(["property-profile-specific"]);
  });
});
