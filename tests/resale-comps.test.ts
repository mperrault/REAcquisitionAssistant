import { describe, expect, it } from "vitest";

import {
  createPropertyFact,
  createPropertyRecord
} from "@/lib/properties/property-persistence";
import {
  getResaleCompPricePerSqft,
  getResaleCompSummary
} from "@/lib/properties/resale-comps";

describe("resale comparable sales", () => {
  it("calculates comp price per sqft and suggested resale value", () => {
    const property = createPropertyRecord({
      id: "property-comp-supported",
      livingSqft: 1600,
      facts: [
        createPropertyFact({
          id: "fact-comp-a-address",
          factKey: "resale.comp.a.address",
          label: "Comp address",
          value: "10 Lake Rd"
        }),
        createPropertyFact({
          id: "fact-comp-a-price",
          factKey: "resale.comp.a.sale_price",
          label: "Comp sale price",
          value: 420000
        }),
        createPropertyFact({
          id: "fact-comp-a-sqft",
          factKey: "resale.comp.a.sqft",
          label: "Comp sqft",
          value: 1400
        }),
        createPropertyFact({
          id: "fact-comp-b-price",
          factKey: "resale.comp.b.sale_price",
          label: "Comp sale price",
          value: 480000
        }),
        createPropertyFact({
          id: "fact-comp-b-sqft",
          factKey: "resale.comp.b.sqft",
          label: "Comp sqft",
          value: 1600
        })
      ]
    });

    const summary = getResaleCompSummary(property);

    expect(summary.comps).toHaveLength(2);
    expect(summary.usableComps).toHaveLength(2);
    expect(getResaleCompPricePerSqft(summary.comps[0]!)).toBe(300);
    expect(summary.medianPricePerSqft).toBe(300);
    expect(summary.averagePricePerSqft).toBe(300);
    expect(summary.suggestedResaleValue).toBe(480000);
  });

  it("ignores comps missing sale price or sqft for valuation math", () => {
    const property = createPropertyRecord({
      id: "property-incomplete-comps",
      livingSqft: 1600,
      facts: [
        createPropertyFact({
          id: "fact-comp-a-price",
          factKey: "resale.comp.a.sale_price",
          label: "Comp sale price",
          value: 420000
        }),
        createPropertyFact({
          id: "fact-comp-b-sqft",
          factKey: "resale.comp.b.sqft",
          label: "Comp sqft",
          value: 1600
        })
      ]
    });

    const summary = getResaleCompSummary(property);

    expect(summary.comps).toHaveLength(2);
    expect(summary.usableComps).toHaveLength(0);
    expect(summary.suggestedResaleValue).toBeNull();
  });
});
