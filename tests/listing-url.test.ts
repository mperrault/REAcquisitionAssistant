import { describe, expect, it } from "vitest";

import {
  getRealtorListingAddressHint,
  listingUrlAddressMatches,
  normalizeListingUrl
} from "@/lib/listing-alerts/listing-url";

function toBase64Url(value: string) {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("listing URL normalization", () => {
  it("extracts and canonicalizes a Realtor destination from an email tracking URL", () => {
    const destination =
      "https://www.realtor.com/realestateandhomes-detail/138-Furnace-Ave_Stafford-Spgs_CT_06076_M45724-77139?ex=123&cid=email#app";
    const jwtP = toBase64Url(JSON.stringify({ iat: 1788466256, linkUrl: destination }));
    const trackingUrl =
      `https://e.e.mail.realtor.com/c2/example/path?jwtP=${jwtP}&jwtS=test#app`;

    const result = normalizeListingUrl(trackingUrl);

    expect(result.source).toBe("realtor_email_tracking");
    expect(result.wasNormalized).toBe(true);
    expect(result.canonicalUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/138-Furnace-Ave_Stafford-Spgs_CT_06076_M45724-77139"
    );
  });

  it("extracts the Realtor address hint", () => {
    expect(
      getRealtorListingAddressHint(
        "https://www.realtor.com/realestateandhomes-detail/138-Furnace-Ave_Stafford-Spgs_CT_06076_M45724-77139"
      )
    ).toEqual({
      addressLine1: "138 Furnace Ave",
      city: "Stafford Spgs",
      state: "CT",
      postalCode: "06076"
    });
  });

  it("detects a house-number mismatch", () => {
    const url =
      "https://www.realtor.com/realestateandhomes-detail/138-Furnace-Ave_Stafford-Spgs_CT_06076_M45724-77139";

    expect(listingUrlAddressMatches("38 Furnace Ave", url)).toBe(false);
    expect(listingUrlAddressMatches("138 Furnace Avenue", url)).toBe(true);
  });

  it("leaves unrelated direct listing URLs unchanged", () => {
    const result = normalizeListingUrl(
      "https://example.com/listings/123?source=email"
    );

    expect(result.canonicalUrl).toBe(
      "https://example.com/listings/123?source=email"
    );
    expect(result.wasNormalized).toBe(false);
  });
});
