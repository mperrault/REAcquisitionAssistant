import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readProfileEditorSource() {
  return readFileSync(
    resolve(process.cwd(), "components/profiles/search-profile-editor.tsx"),
    "utf8"
  );
}

function readAppLayoutSource() {
  return readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
}

describe("scoring settings editor regression guards", () => {
  it("labels the former profile editor as scoring settings", () => {
    const editorSource = readProfileEditorSource();
    const layoutSource = readAppLayoutSource();

    expect(layoutSource).toContain('label: "Scoring Settings"');
    expect(editorSource).toContain("Scoring Settings");
    expect(editorSource).toContain("Scoring Setup");
    expect(editorSource).toContain("Single active configuration");
    expect(editorSource).toContain("Setup Name");
  });

  it("combines scoring weights and preferences in user-facing language", () => {
    const source = readProfileEditorSource();

    expect(source).toContain("Scoring Priorities");
    expect(source).toContain("Score Allocation");
    expect(source).toContain("Deal Breakers");
    expect(source).toContain("Reject If Present");
    expect(source).toContain("Financial Value");
    expect(source).toContain("Resale Signals");
    expect(source).toContain("Systems & Utilities");
    expect(source).toContain("Strong reward");
    expect(source).toContain("Advanced scoring fields");
    expect(source).toContain("Category Importance");
    expect(source).toContain("assigned");
    expect(source).toContain("Normalize");
    expect(source).toContain("maxScoreWeightTotal = 100");
    expect(source).toContain("Score Bands");
  });

  it("de-emphasizes multiple setup controls when there is only one configuration", () => {
    const source = readProfileEditorSource();

    expect(source).toContain("hasMultipleVisibleProfiles");
    expect(source).toContain("Duplicate selected configuration");
    expect(source).toContain("Set Active");
    expect(source).toContain("Archive");
  });
});
