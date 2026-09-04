import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readPropertyManagerSource() {
  return readFileSync(
    resolve(process.cwd(), "components/properties/property-manager.tsx"),
    "utf8"
  );
}

describe("property photo workflow regression guards", () => {
  it("persists attached browser-capture photos immediately", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("function handleAttachCapture");
    const end = source.indexOf("function handleClearAttachedCapturedPhotos", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("applyCaptureToProperty(draft, capture)");
    expect(block).toContain("const capturedProperty = applyCaptureToProperty(draft, capture)");
    expect(block).toContain("savePropertyState(");
    expect(block).toContain("setPropertyState(");
    expect(block).toContain("setDraft(");
    expect(block).toContain('setSaveStatus("Photos attached and saved")');
    expect(block).not.toContain("click Save to persist");
  });

  it("preserves property photos and source captures through Enhance", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("async function handleEnrichProperty");
    const end = source.indexOf("function handleCancelEnrichment", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("const propertyDraft = draft");
    expect(block).toContain("const preservedPhotoUrls = getPropertyPhotoUrls(propertyDraft)");
    expect(block).toContain("const preservedPhotoEvidence");
    expect(block).toContain("const preservedSourceCaptures");
    expect(block).toContain("removeListingPagePhotoEvidence(propertyDraft)");
    expect(block).toContain("...preservedPhotoUrls");
    expect(block).toContain("photoEvidence: preservedPhotoEvidence");
    expect(block).toContain("sourceCaptures: preservedSourceCaptures");
  });

  it("uses the filtered copy only for the enrichment request", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("async function handleEnrichProperty");
    const end = source.indexOf("function handleCancelEnrichment", start);
    const block = source.slice(start, end);

    expect(block).toContain("createPropertyEnrichmentCandidate(");
    expect(block).toContain("enrichmentCandidateProperty");
    expect(block).toContain("mergeEnrichmentIntoProperty(propertyDraft, enrichment)");
  });
});
