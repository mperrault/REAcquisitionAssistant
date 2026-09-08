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

  it("can replace stale attached browser-capture photos", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("function handleReplaceAttachedCapturedPhotos");
    const end = source.indexOf("function handleClearAttachedCapturedPhotos", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("removeBrowserCaptureEvidence(draft)");
    expect(block).toContain("applyCaptureToProperty(cleanedProperty, capture)");
    expect(block).toContain("savePropertyState(");
    expect(block).toContain("Captured photo evidence replaced.");
  });

  it("shows browser-capture filtering counts in Sources", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("function SourcesTab");
    const end = source.indexOf("function FactsTab", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("summarizeCapturePhotoSelection({");
    expect(block).toContain("photoSummary.rejectedCount");
    expect(block).toContain("filtered");
    expect(block).toContain("detected");
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

  it("shows photo input diagnostics when Enhance starts", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("async function handleEnrichProperty");
    const end = source.indexOf("function handleCancelEnrichment", start);
    const block = source.slice(start, end);

    expect(block).toContain('"photo inputs"');
    expect(block).toContain("Saved property photos:");
    expect(block).toContain("Attached photo evidence:");
    expect(block).toContain("Latest focused browser-capture photos:");
  });

  it("makes automatic scoring visible in Save and Enrich labels", () => {
    const source = readPropertyManagerSource();

    expect(source).toContain('"Save + Score"');
    expect(source).toContain('"Enrich + Score"');
    expect(source).toContain("evaluateProperty(savedProperty, activeProfile)");
    expect(source).toContain("evaluateProperty(enrichedProperty, activeProfile)");
  });

  it("exposes a review checklist backed by property facts", () => {
    const source = readPropertyManagerSource();

    expect(source).toContain('id: "review"');
    expect(source).toContain("review.source_photos_reviewed");
    expect(source).toContain("review.renovation_scope_reviewed");
    expect(source).toContain("Review Checklist");
    expect(source).toContain("upsertBooleanFact(");
    expect(source).toContain("Lifecycle Status");
  });

  it("exposes resale support inputs backed by property facts", () => {
    const source = readPropertyManagerSource();

    expect(source).toContain('id: "resale"');
    expect(source).toContain("resale.estimated_value");
    expect(source).toContain("resale.comp_notes");
    expect(source).toContain("Estimated Resale Value");
    expect(source).toContain("Implied Spread");
  });

  it("keeps raw fact metadata behind an advanced toggle", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("function FactsTab");
    const end = source.indexOf("function getBooleanFactValue", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("showAdvanced");
    expect(block).toContain("Advanced");
    expect(block).toContain('label="Source"');
    expect(block).toContain('label="Confidence"');
    expect(block).toContain('label="Verified"');
    expect(block.indexOf('label="Source"')).toBeGreaterThan(
      block.indexOf("showAdvanced ?")
    );
  });

  it("treats default flexible fact edits as trusted user-entered facts", () => {
    const source = readPropertyManagerSource();
    const start = source.indexOf("function FactsTab");
    const end = source.indexOf("function getBooleanFactValue", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("function updateTrustedFact");
    expect(block).toContain('sourceType: "user_entered"');
    expect(block).toContain("confidence: 1");
    expect(block).toContain("verified: true");
    expect(block).toContain("observedAt: new Date().toISOString()");
    expect(block).toContain("updateTrustedFact(fact.id, { label:");
    expect(block).toContain("updateTrustedFact(fact.id, { factKey:");
    expect(block).toContain("updateTrustedFact(fact.id, {");
    expect(block).toContain("value: parseFactValue(event.target.value)");
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
