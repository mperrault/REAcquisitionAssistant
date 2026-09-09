import { describe, expect, it } from "vitest";

import {
  createPropertyFact,
  createPropertyRecord
} from "@/lib/properties/property-persistence";
import {
  getResaleCompIssues,
  getResaleCompPricePerSqft,
  getResaleCompSummary,
  parseResaleCompRows
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

  it("parses clipboard comp rows with optional header and notes", () => {
    const rows = parseResaleCompRows(`address,sale price,sqft,distance,confidence,notes
"10 Lake Rd, Stafford, CT","$420,000","1,400",0.8,high,water view
12 Pond St | 390000 | 1300 | 1.1 | similar condition`);

    expect(rows).toEqual([
      {
        address: "10 Lake Rd, Stafford, CT",
        salePrice: 420000,
        sqft: 1400,
        distanceMiles: 0.8,
        confidence: "high",
        notes: "water view"
      },
      {
        address: "12 Pond St",
        salePrice: 390000,
        sqft: 1300,
        distanceMiles: 1.1,
        confidence: "",
        notes: "similar condition"
      }
    ]);
  });

  it("identifies comp fields that need review", () => {
    const property = createPropertyRecord({
      id: "property-comp-review",
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
          id: "fact-comp-a-confidence",
          factKey: "resale.comp.a.confidence",
          label: "Comp confidence",
          value: "low"
        })
      ]
    });
    const [comp] = getResaleCompSummary(property).comps;

    expect(getResaleCompIssues(comp!).map((issue) => issue.key)).toEqual([
      "distance",
      "low_confidence",
      "low_confidence_notes"
    ]);
  });
});
