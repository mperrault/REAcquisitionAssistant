import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source() {
  return readFileSync(
    resolve(process.cwd(), "lib/listing-alerts/listing-enrichment.ts"),
    "utf8"
  );
}

describe("style inference performance regression guards", () => {
  it("uses a small default photo set and an independently configurable fast model", () => {
    const text = source();

    expect(text).toContain("const defaultStylePhotoLimit = 3");
    expect(text).toContain("process.env.OPENAI_STYLE_MODEL?.trim()");
    expect(text).toContain('"gpt-5.6-luna"');
    expect(text).toContain('detail: "low"');
  });

  it("does not sequentially retry every style photo", () => {
    const text = source();
    const start = text.indexOf("async function inferHouseStyleFromPhotos");
    const end = text.indexOf("async function inferStyleFromRequestEvidence", start);
    const block = text.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("One targeted retry is enough for style classification");
    expect(block).not.toContain("for (const imageUrl of imageUrls)");
  });

  it("starts request-photo style inference before the listing fetch", () => {
    const text = source();
    const promiseIndex = text.indexOf(
      "const requestStylePromise = inferStyleFromRequestEvidence({"
    );
    const fetchIndex = text.indexOf(
      'addDiagnostic(\n      "listing fetch",\n      "started"'
    );

    expect(promiseIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeGreaterThan(promiseIndex);
    expect(text).toContain("await requestStylePromise");
  });
});
