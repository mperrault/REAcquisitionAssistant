import { describe, expect, it } from "vitest";

import {
  createBrowserCaptureRecord,
  normalizePhotoUrls,
  parseAddressParts
} from "@/lib/properties/browser-capture";

describe("browser capture", () => {
  it("parses a listing address from captured page text", () => {
    expect(
      parseAddressParts("9 Schwanda Road, Stafford Springs, CT 06076")
    ).toEqual({
      addressLine1: "9 Schwanda Road",
      city: "Stafford Springs",
      state: "CT",
      postalCode: "06076"
    });
  });

  it("normalizes browser captures and filters non-property images", () => {
    const capture = createBrowserCaptureRecord(
      {
        pageUrl:
          "https://www.zillow.com/homedetails/9-Schwanda-Rd-Stafford-Springs-CT-06076/464955916_zpid/",
        title: "9 Schwanda Road, Stafford Springs, CT 06076 | Zillow",
        listingRemarks: " Lots of possibilities with some TLC. ",
        photoUrls: [
          "https://photos.zillowstatic.com/fp/photo-one-cc_ft_1344.webp",
          "https://photos.zillowstatic.com/fp/photo-one-cc_ft_1344.webp",
          "https://photos.zillowstatic.com/fp/d79c34cc3fb9c13a4cbe1437a108a1d7-zillow_web_48_23.jpg",
          "data:image/png;base64,abc"
        ]
      },
      "2026-09-01T12:00:00.000Z",
      () => "capture-1"
    );

    expect(capture).toMatchObject({
      id: "capture-1",
      capturedAt: "2026-09-01T12:00:00.000Z",
      sourceSite: "zillow.com",
      addressLine1: "9 Schwanda Road",
      city: "Stafford Springs",
      state: "CT",
      postalCode: "06076",
      listingRemarks: "Lots of possibilities with some TLC."
    });
    expect(capture.photoUrls).toEqual([
      "https://photos.zillowstatic.com/fp/photo-one-cc_ft_1344.webp"
    ]);
  });

  it("keeps distinct eligible photo URLs in source order", () => {
    expect(
      normalizePhotoUrls([
        "https://photos.zillowstatic.com/fp/a-cc_ft_1344.webp",
        "https://ap.rdcpix.com/b.jpg",
        "https://photos.zillowstatic.com/fp/a-cc_ft_1344.webp"
      ])
    ).toEqual([
      "https://photos.zillowstatic.com/fp/a-cc_ft_1344.webp",
      "https://ap.rdcpix.com/b.jpg"
    ]);
  });
});
