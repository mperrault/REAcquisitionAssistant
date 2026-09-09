import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "lib/listing-alerts/listing-enrichment.ts"),
    "utf8"
  );

describe("renovation progress diagnostics", () => {
  it("emits detailed phases during photo analysis", () => {
    const text = source();

    expect(text).toContain('| "preparing"');
    expect(text).toContain('| "requesting"');
    expect(text).toContain('| "validating"');
    expect(text).toContain('| "retrying"');
    expect(text).toContain('| "complete"');
    expect(text).toContain("AI response received. Validating confidence");
    expect(text).toContain("Retrying photo ${retryIndex + 1} of ${batch.length}");
  });

  it("streams user-facing messages for expensive phases", () => {
    const text = source();

    expect(text).toContain("Preparing renovation photo batch");
    expect(text).toContain("Analyzing renovation photo batch");
    expect(text).toContain("Validating renovation findings");
    expect(text).toContain("Recovering usable photos from renovation batch");
  });
});
