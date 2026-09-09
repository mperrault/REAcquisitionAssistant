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
  it("reports the outcome of each individual-photo retry", () => {
    const text = source();

    expect(text).toContain("analyzed successfully — near-term renovation findings were identified with sufficient confidence");
    expect(text).toContain("could not be analyzed successfully — ${singleImageResult.warning}");
    expect(text).toContain("analyzed successfully — based on the analysis, with sufficient confidence, no near-term renovation is needed.");
    expect(text).toContain("Recovery pass complete for batch");
  });

  it("carries photo URLs into progress diagnostics", () => {
    const text = source();

    expect(text).toContain("imageUrl?: string");
    expect(text).toContain("imageUrls?: string[]");
    expect(text).toContain("imageUrl: batch[retryIndex]");
    expect(text).toContain("imageUrls: batch.slice(0, 4)");
    expect(text).toContain('progress.imageUrl ?? ""');
    expect(text).toContain("progress.imageUrls ?? []");
  });


  it("carries total photo count for partial batch thumbnail previews", () => {
    const text = source();

    expect(text).toContain("imageTotalCount?: number");
    expect(text).toContain("imageTotalCount: batch.length");
    expect(text).toContain("progress.imageTotalCount ?? 0");
  });

});
