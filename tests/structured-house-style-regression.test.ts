import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const enrichmentSource = () =>
  readFileSync(
    resolve(process.cwd(), "lib/listing-alerts/listing-enrichment.ts"),
    "utf8"
  );

const seedSource = () =>
  readFileSync(
    resolve(process.cwd(), "lib/profiles/quiet-corner-seed.ts"),
    "utf8"
  );

describe("structured house style precedence", () => {
  it("supports Saltbox and Bungalow as independent style classes", () => {
    const text = enrichmentSource();

    expect(text).toContain('houseStyle: "Bungalow"');
    expect(text).toContain('styleFactKey: "style.bungalow"');
    expect(text).toContain('houseStyle: "Saltbox"');
    expect(text).toContain('styleFactKey: "style.saltbox"');
    expect(text).toContain("Cape, Bungalow, Cottage");
    expect(text).not.toContain('patterns: [/\\bcottage\\b/i, /\\bbungalow\\b/i]');
  });

  it("recognizes explicit listing House Style fields", () => {
    const text = enrichmentSource();

    expect(text).toContain("function inferExplicitHouseStyleFromText");
    expect(text).toContain("House Style|Architectural Style|Home Style|Property Style");
    expect(text).toContain("confidence: 0.99");
  });

  it("prefers explicit page style over remarks and broad page text", () => {
    const text = enrichmentSource();

    const explicitIndex = text.indexOf(
      "inferExplicitHouseStyleFromText(metadata.pageText) ??"
    );
    const requestIndex = text.indexOf("requestTextStyle ??", explicitIndex);

    expect(explicitIndex).toBeGreaterThan(-1);
    expect(requestIndex).toBeGreaterThan(explicitIndex);
  });

  it("weights Bungalow like Cape and Saltbox like Ranch", () => {
    const text = seedSource();

    expect(text).toContain('["style.cape", "Cape", 1, 7]');
    expect(text).toContain('["style.bungalow", "Bungalow", 2, 7]');
    expect(text).toContain('["style.ranch", "Ranch", 5, 3]');
    expect(text).toContain('["style.saltbox", "Saltbox", 6, 3]');
  });
});
