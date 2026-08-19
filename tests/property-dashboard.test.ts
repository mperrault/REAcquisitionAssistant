import { describe, expect, it } from "vitest";

import {
  getDashboardCounts,
  getDashboardSections,
  getDefaultComparePropertyIds,
  getProjectedTotalInvestment,
  getRenovationExpectedCost,
  createDashboardSummaries
} from "@/lib/properties/property-dashboard";
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
  patch: Partial<ScoreEvaluation>
) {
  return {
    ...evaluateProperty(
      property,
      quietCornerSeedProfile,
      patch.evaluatedAt ?? "2026-08-19T12:00:00.000Z",
      () => patch.id ?? `score-${property.id}`
    ),
    ...patch
  };
}

describe("property dashboard summaries", () => {
  it("groups properties into Milestone 4 dashboard sections", () => {
    const strong = createPropertyRecord({
      id: "property-strong",
      addressLine1: "10 Hill Road",
      lifecycleStatus: "reviewing",
      updatedAt: "2026-08-19T13:00:00.000Z"
    });
    const watch = createPropertyRecord({
      id: "property-watch",
      addressLine1: "20 Field Lane",
      lifecycleStatus: "watch_list",
      updatedAt: "2026-08-19T13:10:00.000Z"
    });
    const visit = createPropertyRecord({
      id: "property-visit",
      addressLine1: "30 Pond Road",
      lifecycleStatus: "worth_visiting",
      updatedAt: "2026-08-19T13:20:00.000Z"
    });
    const rejected = createPropertyRecord({
      id: "property-rejected",
      addressLine1: "40 Reject Street",
      lifecycleStatus: "reviewing",
      updatedAt: "2026-08-19T13:30:00.000Z"
    });
    const unscored = createPropertyRecord({
      id: "property-unscored",
      addressLine1: "50 Unknown Way",
      lifecycleStatus: "new",
      updatedAt: "2026-08-19T13:40:00.000Z"
    });

    const scoreState = [
      createEvaluation(strong, {
        normalizedScore: 82,
        scoreLabel: "Strong Candidate",
        missingData: []
      }),
      createEvaluation(watch, {
        normalizedScore: 70,
        scoreLabel: "Possible Candidate",
        missingData: ["Drive time is missing for commute scoring."]
      }),
      createEvaluation(visit, {
        normalizedScore: 76,
        scoreLabel: "Strong Candidate",
        missingData: []
      }),
      createEvaluation(rejected, {
        normalizedScore: 10,
        scoreLabel: "Rejected by Profile",
        hardRejected: true,
        hardRejectReasons: [
          {
            ruleKey: "location.drive_time_over_max",
            label: "Drive time over maximum",
            category: "location",
            result: "hard_reject",
            points: 0,
            detail: "Drive time exceeds maximum"
          }
        ],
        missingData: []
      })
    ].reduce(addScoreEvaluation, createEmptyScoreState());

    const summaries = createDashboardSummaries({
      properties: [strong, watch, visit, rejected, unscored],
      scoreState,
      profileId: quietCornerSeedProfile.id
    });
    const counts = getDashboardCounts(summaries);
    const sections = getDashboardSections(summaries, 5);

    expect(counts).toMatchObject({
      total: 5,
      scored: 4,
      unscored: 1,
      hardRejected: 1,
      scoreGaps: 1,
      watchList: 1,
      worthVisiting: 1
    });
    expect(sections.topCandidates.map((item) => item.property.id)).toEqual([
      "property-strong",
      "property-visit",
      "property-watch"
    ]);
    expect(sections.watchList.map((item) => item.property.id)).toEqual([
      "property-watch"
    ]);
    expect(sections.worthVisiting.map((item) => item.property.id)).toEqual([
      "property-visit"
    ]);
    expect(sections.rejectedByProfile.map((item) => item.property.id)).toEqual([
      "property-rejected"
    ]);
  });

  it("selects the strongest non-rejected properties for comparison by default", () => {
    const first = createPropertyRecord({ id: "first" });
    const second = createPropertyRecord({ id: "second" });
    const rejected = createPropertyRecord({ id: "rejected" });
    const unscored = createPropertyRecord({ id: "unscored" });
    const scoreState = [
      createEvaluation(first, {
        normalizedScore: 65,
        scoreLabel: "Possible Candidate"
      }),
      createEvaluation(second, {
        normalizedScore: 88,
        scoreLabel: "Strong Candidate"
      }),
      createEvaluation(rejected, {
        normalizedScore: 95,
        scoreLabel: "Rejected by Profile",
        hardRejected: true
      })
    ].reduce(addScoreEvaluation, createEmptyScoreState());

    const summaries = createDashboardSummaries({
      properties: [first, second, rejected, unscored],
      scoreState,
      profileId: quietCornerSeedProfile.id
    });

    expect(getDefaultComparePropertyIds(summaries, 3)).toEqual([
      "second",
      "first",
      "unscored"
    ]);
  });

  it("calculates renovation and projected total investment from property facts", () => {
    const calculated = createPropertyRecord({
      askingPrice: 250000,
      estimatedPurchasePrice: 240000,
      facts: [
        createPropertyFact({
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 60000
        })
      ]
    });
    const stored = createPropertyRecord({
      askingPrice: 250000,
      facts: [
        createPropertyFact({
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 60000
        }),
        createPropertyFact({
          factKey: "finance.projected_total_investment",
          label: "Projected total investment",
          value: 325000
        })
      ]
    });

    expect(getRenovationExpectedCost(calculated)).toBe(60000);
    expect(getProjectedTotalInvestment(calculated)).toBe(300000);
    expect(getProjectedTotalInvestment(stored)).toBe(325000);
  });
});
