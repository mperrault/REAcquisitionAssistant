import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readScorePanelSource() {
  return readFileSync(
    resolve(process.cwd(), "components/scoring/score-evaluation-panel.tsx"),
    "utf8"
  );
}

describe("score evaluation panel regression guards", () => {
  it("shows category-level score drivers and improvement prompts", () => {
    const source = readScorePanelSource();

    expect(source).toContain("Scoring Priorities");
    expect(source).toContain("Scoring Priority Details");
    expect(source).toContain("What Would Improve This Score");
    expect(source).toContain("getCategoryDriverGroups(");
    expect(source).toContain("getScoreImprovementItems(");
    expect(source).toContain("const positiveFactors = evaluation.positiveFactors.filter");
    expect(source).toContain("const missingData = evaluation.missingData.filter");
    expect(source).toContain("missed");
    expect(source).toContain("categoryDisplayLabels");
    expect(source).toContain("categoryLabels");
  });

  it("can label recalculated draft scores separately from saved scores", () => {
    const source = readScorePanelSource();

    expect(source).toContain("isPreview = false");
    expect(source).toContain("Draft score");
  });
});
