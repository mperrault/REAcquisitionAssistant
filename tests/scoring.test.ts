import { describe, expect, it } from "vitest";

import {
  createPropertyFact,
  createPropertyRecord
} from "@/lib/properties/property-persistence";
import { quietCornerSeedProfile } from "@/lib/profiles/quiet-corner-seed";
import { evaluateProperty } from "@/lib/scoring/evaluate-property";
import {
  addScoreEvaluation,
  createEmptyScoreState,
  getLatestScoreEvaluation,
  saveScoreState,
  loadScoreState,
  type StorageLike
} from "@/lib/scoring/score-persistence";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("property scoring", () => {
  it("evaluates a property with explainable positive contributors", () => {
    const property = createPropertyRecord({
      id: "property-1",
      city: "Woodstock",
      state: "CT",
      askingPrice: 320000,
      estimatedPurchasePrice: 300000,
      houseStyle: "Cape",
      garageSpaces: 1,
      heatingType: "Oil",
      facts: [
        createPropertyFact({
          id: "fact-setting",
          factKey: "setting.country_mountain_view",
          label: "Country / Mountain View",
          value: true
        }),
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 28
        }),
        createPropertyFact({
          id: "fact-renovation",
          factKey: "renovation.kitchen",
          label: "Kitchen",
          value: true
        }),
        createPropertyFact({
          id: "fact-renovation-cost",
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 75000
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:00:00.000Z",
      () => "score-1"
    );

    expect(evaluation.id).toBe("score-1");
    expect(evaluation.hardRejected).toBe(false);
    expect(evaluation.normalizedScore).toBeGreaterThan(50);
    expect(evaluation.normalizedScore).toBeLessThanOrEqual(100);
    expect(evaluation.profileVersion).toBe(quietCornerSeedProfile.version);
    expect(evaluation.positiveFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "setting.country_mountain_view",
          result: "bonus"
        }),
        expect.objectContaining({
          ruleKey: "style.cape",
          result: "bonus"
        }),
        expect.objectContaining({
          ruleKey: "location.drive_time_minutes"
        })
      ])
    );
    expect(evaluation.missingData).not.toContain("House style is missing.");
  });

  it("marks hard deal breakers without hiding the informational score", () => {
    const property = createPropertyRecord({
      id: "property-2",
      city: "Stafford / Stafford Springs",
      state: "CT",
      askingPrice: 250000,
      hoaPresent: true,
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 24
        }),
        createPropertyFact({
          id: "fact-setting",
          factKey: "setting.open_fields_pastoral",
          label: "Open Fields / Pastoral",
          value: true
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:05:00.000Z",
      () => "score-2"
    );

    expect(evaluation.hardRejected).toBe(true);
    expect(evaluation.scoreLabel).toBe("Rejected by Profile");
    expect(evaluation.normalizedScore).toBeGreaterThan(0);
    expect(evaluation.hardRejectReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "risk.hoa",
          result: "hard_reject"
        })
      ])
    );
  });

  it("matches slash-separated town preference aliases for imported listings", () => {
    for (const city of ["Stafford", "Stafford Springs"]) {
      const evaluation = evaluateProperty(
        createPropertyRecord({
          id: `property-${city}`,
          city,
          state: "CT",
          askingPrice: 250000
        }),
        quietCornerSeedProfile,
        "2026-08-10T22:08:00.000Z",
        () => `score-${city}`
      );

      expect(evaluation.normalizedScore).toBeGreaterThan(0);
      expect(evaluation.positiveFactors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleKey: "location.town_preference",
            label: "Stafford / Stafford Springs, CT",
            points: expect.any(Number)
          })
        ])
      );
      expect(evaluation.penalties).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleKey: "location.town_preference",
            detail: "Town is not ranked in the selected profile"
          })
        ])
      );
    }
  });

  it("hard rejects drive time above the profile maximum", () => {
    const property = createPropertyRecord({
      id: "property-3",
      city: "Union",
      state: "CT",
      askingPrice: 280000,
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 45
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:10:00.000Z",
      () => "score-3"
    );

    expect(evaluation.hardRejected).toBe(true);
    expect(evaluation.hardRejectReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "location.drive_time_over_max"
        })
      ])
    );
  });

  it("uses renovation line items, contingency, and closing costs for financial fit", () => {
    const property = createPropertyRecord({
      id: "property-budget",
      city: "Stafford",
      state: "CT",
      askingPrice: 300000,
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 24
        }),
        createPropertyFact({
          id: "fact-roof",
          factKey: "renovation.line_item.roof",
          label: "Roof",
          value: 50000
        }),
        createPropertyFact({
          id: "fact-contingency",
          factKey: "renovation.contingency_amount",
          label: "Renovation contingency amount",
          value: 15000
        }),
        createPropertyFact({
          id: "fact-closing",
          factKey: "finance.closing_costs",
          label: "Closing and acquisition costs",
          value: 10000
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:12:00.000Z",
      () => "score-budget"
    );

    expect(evaluation.positiveFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "finance.projected_total_investment",
          result: "bonus"
        })
      ])
    );
    expect(evaluation.missingData).not.toContain(
      "Expected renovation cost is missing for total investment scoring."
    );
  });

  it("uses renovation line items as renovation fit signals", () => {
    const property = createPropertyRecord({
      id: "property-line-item-renovation-fit",
      city: "Stafford",
      state: "CT",
      askingPrice: 250000,
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 24
        }),
        createPropertyFact({
          id: "fact-kitchen-line-item",
          factKey: "renovation.line_item.kitchen_refresh",
          label: "Kitchen refresh",
          value: 18000
        }),
        createPropertyFact({
          id: "fact-renovation-cost",
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 18000
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:13:00.000Z",
      () => "score-line-item-renovation-fit"
    );

    expect(evaluation.categoryScores.renovation).toBeGreaterThan(0);
    expect(evaluation.positiveFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "renovation.condition_fit",
          result: "bonus"
        })
      ])
    );
  });

  it("awards resale points from derived property and setting signals", () => {
    const property = createPropertyRecord({
      id: "property-resale",
      city: "Stafford",
      state: "CT",
      askingPrice: 289000,
      bedrooms: 3,
      bathrooms: 2,
      lotAcres: 1.1,
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 24
        }),
        createPropertyFact({
          id: "fact-setting",
          factKey: "setting.lake_view",
          label: "Lake View",
          value: true
        }),
        createPropertyFact({
          id: "fact-renovation-cost",
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 45000
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:14:00.000Z",
      () => "score-resale"
    );

    expect(evaluation.categoryScores.resale).toBe(16);
    expect(evaluation.positiveFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "resale.strong_setting",
          result: "bonus"
        }),
        expect.objectContaining({
          ruleKey: "resale.desirable_town",
          result: "bonus"
        }),
        expect.objectContaining({
          ruleKey: "resale.below_purchase_target",
          result: "bonus"
        })
      ])
    );
  });

  it("scores a waterfront turnkey value property as a strong candidate", () => {
    const property = createPropertyRecord({
      id: "property-waterfront-turnkey-value",
      city: "Stafford",
      state: "CT",
      askingPrice: 399900,
      livingSqft: 1576,
      bedrooms: 4,
      bathrooms: 2,
      houseStyle: "Colonial",
      facts: [
        createPropertyFact({
          id: "fact-drive",
          factKey: "location.drive_time_minutes",
          label: "Drive time",
          value: 24
        }),
        createPropertyFact({
          id: "fact-setting",
          factKey: "setting.lake_view",
          label: "Lake View",
          value: true
        }),
        createPropertyFact({
          id: "fact-renovation-cost",
          factKey: "renovation.expected_cost",
          label: "Expected renovation cost",
          value: 0
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:14:30.000Z",
      () => "score-waterfront-turnkey-value"
    );

    expect(evaluation.normalizedScore).toBeGreaterThanOrEqual(90);
    expect(evaluation.categoryScores.renovation).toBe(10);
    expect(evaluation.categoryScores.resale).toBeGreaterThanOrEqual(14);
    expect(evaluation.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Water Setting" }),
        expect.objectContaining({ label: "Value Candidate" }),
        expect.objectContaining({ label: "Turnkey Candidate" })
      ])
    );
  });

  it("does not warn when setting text was checked and no preferred setting matched", () => {
    const property = createPropertyRecord({
      id: "property-no-preferred-setting",
      city: "Stafford",
      state: "CT",
      askingPrice: 315000,
      facts: [
        createPropertyFact({
          id: "fact-no-preferred-setting",
          factKey: "setting.no_preferred_match",
          label: "No Preferred Setting Match",
          value: true
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:14:45.000Z",
      () => "score-no-preferred-setting"
    );

    expect(evaluation.categoryScores.setting).toBe(0);
    expect(evaluation.missingData).not.toContain(
      "Setting and view facts are missing."
    );
  });

  it("records missing data warnings for incomplete records", () => {
    const property = createPropertyRecord({
      id: "property-4"
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:15:00.000Z",
      () => "score-4"
    );

    expect(evaluation.normalizedScore).toBe(0);
    expect(evaluation.missingData).toEqual(
      expect.arrayContaining([
        "Town/state are missing for location scoring.",
        "Drive time is missing for commute scoring because the active profile has no commute anchor address or coordinates.",
        "Asking price or estimated purchase price is missing.",
        "Setting and view facts are missing.",
        "House style is missing.",
        "Renovation condition is unknown."
      ])
    );
  });

  it("explains drive-time gaps when a route calculation failed", () => {
    const profile = {
      ...quietCornerSeedProfile,
      commute: {
        ...quietCornerSeedProfile.commute,
        anchorAddress: "100 Main St, Stafford Springs, CT"
      }
    };
    const property = createPropertyRecord({
      id: "property-drive-error",
      addressLine1: "175 W Stafford Rd",
      city: "Stafford",
      state: "CT",
      postalCode: "06076",
      facts: [
        createPropertyFact({
          id: "fact-drive-error",
          factKey: "location.drive_time_error",
          label: "Drive time calculation issue",
          value: "No geocode result found for 175 W Stafford Rd."
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      profile,
      "2026-08-10T22:16:00.000Z",
      () => "score-drive-error"
    );

    expect(evaluation.missingData).toContain(
      "Drive time is missing for commute scoring: No geocode result found for 175 W Stafford Rd."
    );
  });

  it("explains style gaps when style inference failed", () => {
    const property = createPropertyRecord({
      id: "property-style-error",
      city: "Stafford",
      state: "CT",
      facts: [
        createPropertyFact({
          id: "fact-style-error",
          factKey: "style.inference_error",
          label: "House style inference issue",
          value:
            "listing text did not identify a style; photo inference skipped because OPENAI_API_KEY is not configured."
        })
      ]
    });

    const evaluation = evaluateProperty(
      property,
      quietCornerSeedProfile,
      "2026-08-10T22:17:00.000Z",
      () => "score-style-error"
    );

    expect(evaluation.missingData).toContain(
      "House style is missing: listing text did not identify a style; photo inference skipped because OPENAI_API_KEY is not configured."
    );
  });

  it("persists score history and returns the latest evaluation", () => {
    const storage = new MemoryStorage();
    const first = evaluateProperty(
      createPropertyRecord({
        id: "property-5",
        city: "Ashford",
        state: "CT",
        askingPrice: 300000
      }),
      quietCornerSeedProfile,
      "2026-08-10T22:20:00.000Z",
      () => "score-old"
    );
    const second = {
      ...first,
      id: "score-new",
      normalizedScore: 88,
      scoreLabel: "Strong Candidate",
      evaluatedAt: "2026-08-10T22:25:00.000Z"
    };

    const state = addScoreEvaluation(
      addScoreEvaluation(createEmptyScoreState(), first),
      second
    );
    saveScoreState(storage, state);
    const reloaded = loadScoreState(storage);
    const latest = getLatestScoreEvaluation(
      reloaded.state,
      "property-5",
      quietCornerSeedProfile.id
    );

    expect(reloaded.source).toBe("storage");
    expect(reloaded.state.evaluations).toHaveLength(2);
    expect(latest?.id).toBe("score-new");
    expect(latest?.normalizedScore).toBe(88);
  });

  it("can return the latest evaluation across profiles or within one profile", () => {
    const baseEvaluation = evaluateProperty(
      createPropertyRecord({
        id: "property-6",
        city: "Woodstock",
        state: "CT",
        askingPrice: 340000
      }),
      quietCornerSeedProfile,
      "2026-08-10T22:30:00.000Z",
      () => "score-active-profile"
    );
    const otherProfileEvaluation = {
      ...baseEvaluation,
      id: "score-other-profile",
      profileId: "profile-other",
      profileVersion: 2,
      normalizedScore: 92,
      scoreLabel: "Other Profile Match",
      evaluatedAt: "2026-08-10T22:35:00.000Z"
    };
    const state = addScoreEvaluation(
      addScoreEvaluation(createEmptyScoreState(), baseEvaluation),
      otherProfileEvaluation
    );

    const latestAnyProfile = getLatestScoreEvaluation(state, "property-6");
    const latestActiveProfile = getLatestScoreEvaluation(
      state,
      "property-6",
      quietCornerSeedProfile.id
    );

    expect(latestAnyProfile?.id).toBe("score-other-profile");
    expect(latestAnyProfile?.normalizedScore).toBe(92);
    expect(latestActiveProfile?.id).toBe("score-active-profile");
  });
});
