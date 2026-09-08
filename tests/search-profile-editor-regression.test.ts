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

  it("de-emphasizes multiple setup controls when there is only one configuration", () => {
    const source = readProfileEditorSource();

    expect(source).toContain("hasMultipleVisibleProfiles");
    expect(source).toContain("Duplicate selected configuration");
    expect(source).toContain("Set Active");
    expect(source).toContain("Archive");
  });
});
