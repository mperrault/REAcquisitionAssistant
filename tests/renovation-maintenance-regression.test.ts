import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readEnrichmentSource() {
  return readFileSync(
    resolve(process.cwd(), "lib/listing-alerts/listing-enrichment.ts"),
    "utf8"
  );
}

describe("renovation maintenance regression guards", () => {
  it("tells vision inference not to price routine ownership maintenance", () => {
    const source = readEnrichmentSource();

    expect(source).toContain(
      "Exclude routine preventive maintenance, normal ownership upkeep, future lifecycle reserves"
    );
    expect(source).toContain(
      "For a new, recently replaced, or visibly good-condition deck/porch"
    );
    expect(source).toContain(
      "no immediate cost without evidence that work is actually warranted"
    );
  });

  it("filters routine-maintenance-only AI line items", () => {
    const source = readEnrichmentSource();

    expect(source).toContain("function isRoutineMaintenanceOnlyLineItem");
    expect(source).toContain(
      ".filter((item) => !isRoutineMaintenanceOnlyLineItem(item))"
    );
  });

  it("recomputes totals when routine maintenance is removed", () => {
    const source = readEnrichmentSource();

    expect(source).toContain("const removedRoutineMaintenance");
    expect(source).toContain("const retainedLineItemTotal");
    expect(source).toContain("const expectedCost = removedRoutineMaintenance");
  });
});
