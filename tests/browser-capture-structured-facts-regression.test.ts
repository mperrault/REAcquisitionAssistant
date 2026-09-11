import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("browser capture structured listing facts", () => {
  it("accepts structured facts in the browser capture payload", () => {
    const source = read("lib/properties/browser-capture.ts");

    for (const field of [
      "lotAcres",
      "yearBuilt",
      "annualPropertyTax",
      "hoaPresent",
      "hoaFee",
      "houseStyle",
      "garageSpaces",
      "heatingType",
      "waterSource",
      "sewerType",
      "structuredFactEvidence"
    ]) {
      expect(source).toContain(field);
    }
  });

  it("extracts explicit labeled facts in the bookmarklet", () => {
    const source = read("components/properties/property-manager.tsx");

    expect(source).toContain("const findLabeledValue");
    expect(source).toContain('"House Style"');
    expect(source).toContain('"Year Built"');
    expect(source).toContain('"Water Source"');
    expect(source).toContain('"Sewer Type"');
    expect(source).toContain("structuredFactEvidence");
  });

  it("merges captured structured facts without overwriting existing property values", () => {
    const source = read("components/properties/property-manager.tsx");

    expect(source).toContain(
      "lotAcres: property.lotAcres ?? capture.lotAcres ?? null"
    );
    expect(source).toContain(
      'houseStyle: property.houseStyle || capture.houseStyle || ""'
    );
    expect(source).toContain(
      'sewerType: property.sewerType || capture.sewerType || ""'
    );
  });
});
