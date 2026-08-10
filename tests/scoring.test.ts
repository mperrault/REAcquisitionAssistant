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
        "Drive time is missing for commute scoring.",
        "Asking price or estimated purchase price is missing.",
        "Setting and view facts are missing.",
        "House style is missing.",
        "Renovation scope and expected cost are missing."
      ])
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
});
