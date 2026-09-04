import { describe, expect, it } from "vitest";

import { createBrowserCaptureBookmarklet } from "@/components/properties/property-manager";

function decodeBookmarklet() {
  const bookmarklet = createBrowserCaptureBookmarklet();

  expect(bookmarklet.startsWith("javascript:")).toBe(true);

  return decodeURIComponent(bookmarklet.slice("javascript:".length));
}

describe("browser capture bookmarklet source isolation", () => {
  it("keeps Zillow carousel traversal behind a Zillow-only gate", () => {
    const script = decodeBookmarklet();
    const zillowStart = script.indexOf(
      'if (sourceSite.includes("zillow") && details.length < 40)'
    );
    const realtorStart = script.indexOf(
      'if (sourceSite.includes("realtor"))',
      zillowStart
    );

    expect(zillowStart).toBeGreaterThan(-1);
    expect(realtorStart).toBeGreaterThan(zillowStart);

    const zillowBlock = script.slice(zillowStart, realtorStart);

    expect(zillowBlock).toContain("galleryButton.click()");
    expect(zillowBlock).toContain("nextButton.click()");
    expect(zillowBlock).toContain("const carouselSeen = new Set()");
    expect(zillowBlock).toContain("carouselSeen.has(key)");
    expect(zillowBlock).toContain("carouselSeen.add(key)");
  });

  it("does not click Realtor UI controls during capture", () => {
    const script = decodeBookmarklet();

    const realtorFamilyStart = script.indexOf("const visibleRealtorUrls");
    const realtorEnd = script.indexOf("const photoDetails =", realtorFamilyStart);

    expect(realtorFamilyStart).toBeGreaterThan(-1);
    expect(realtorEnd).toBeGreaterThan(realtorFamilyStart);

    const realtorBlock = script.slice(realtorFamilyStart, realtorEnd);

    expect(realtorBlock).toContain("dominantFamily");
    expect(realtorBlock).not.toContain(".click(");
    expect(realtorBlock).not.toContain("galleryButton");
    expect(realtorBlock).not.toContain("nextButton");
  });

  it("keeps Realtor embedded-photo-family capture separate from Zillow traversal", () => {
    const script = decodeBookmarklet();

    expect(script).toContain('if (sourceSite.includes("realtor"))');
    expect(script).toContain("dominantFamily");
    expect(script).toContain("embeddedMatches.forEach");
    expect(script).toContain("ap.rdcpix.com");

    const zillowStart = script.indexOf(
      'if (sourceSite.includes("zillow") && details.length < 40)'
    );
    const realtorStart = script.indexOf(
      'if (sourceSite.includes("realtor"))',
      zillowStart
    );

    expect(zillowStart).toBeGreaterThan(-1);
    expect(realtorStart).toBeGreaterThan(zillowStart);
  });
});
