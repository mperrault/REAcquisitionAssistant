import { describe, expect, it } from "vitest";

import {
  createBrowserCaptureRecord,
  normalizePhotoUrls,
  parseAddressParts,
  selectCapturePhotoUrls
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

  it("does not parse a price line into the listing street address", () => {
    expect(
      parseAddressParts(
        "$239,900\n3\nbeds\n1\nbaths\n9 Schwanda Road, Stafford Springs, CT 06076"
      )
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
        photoDetails: [
          {
            url: "https://photos.zillowstatic.com/fp/photo-one-cc_ft_1344.webp",
            alt: "1st image of 9 Schwanda Road",
            index: 0
          },
          {
            url: "https://photos.zillowstatic.com/fp/d79c34cc3fb9c13a4cbe1437a108a1d7-zillow_web_48_23.jpg",
            alt: "Smart MLS",
            index: 1
          }
        ],
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

  it("does not trust legacy Zillow captures without image details", () => {
    const capture = createBrowserCaptureRecord(
      {
        pageUrl:
          "https://www.zillow.com/homedetails/9-Schwanda-Rd-Stafford-Springs-CT-06076/464955916_zpid/",
        title: "9 Schwanda Road, Stafford Springs, CT 06076 | Zillow",
        photoUrls: [
          "https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp",
          "https://photos.zillowstatic.com/fp/nearby-cc_ft_1344.webp"
        ]
      },
      "2026-09-01T12:00:00.000Z",
      () => "legacy-capture"
    );

    expect(capture.photoUrls).toEqual([]);
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

  it("dedupes Zillow image-size variants by photo id", () => {
    expect(
      normalizePhotoUrls([
        "https://photos.zillowstatic.com/fp/abcdef1234567890-cc_ft_1344.webp",
        "https://photos.zillowstatic.com/fp/abcdef1234567890-p_e.webp",
        "https://photos.zillowstatic.com/fp/1234567890abcdef-cc_ft_768.webp"
      ])
    ).toEqual([
      "https://photos.zillowstatic.com/fp/abcdef1234567890-cc_ft_1344.webp",
      "https://photos.zillowstatic.com/fp/1234567890abcdef-cc_ft_768.webp"
    ]);
  });

  it("keeps Zillow photos for the target listing and drops nearby homes", () => {
    expect(
      selectCapturePhotoUrls({
        sourceSite: "zillow.com",
        addressLine1: "9 Schwanda Road",
        photoUrls: [],
        photoDetails: [
          {
            url: "https://photos.zillowstatic.com/fp/first-cc_ft_1344.webp",
            alt: "1st image of 9 Schwanda Road",
            index: 0
          },
          {
            url: "https://photos.zillowstatic.com/fp/interior-cc_ft_1344.webp",
            alt: "4th image of 9 Schwanda Road",
            index: 3
          },
          {
            url: "https://photos.zillowstatic.com/fp/nearby-cc_ft_1344.webp",
            alt: "16 Chestnut Hill Road, Stafford, CT 06076",
            index: 4
          },
          {
            url: "https://photos.zillowstatic.com/fp/logo-zillow_web_48_23.jpg",
            alt: "Smart MLS",
            index: 5
          }
        ]
      })
    ).toEqual([
      "https://photos.zillowstatic.com/fp/first-cc_ft_1344.webp",
      "https://photos.zillowstatic.com/fp/interior-cc_ft_1344.webp"
    ]);
  });

  it("filters target listing photos from capture details on save", () => {
    const capture = createBrowserCaptureRecord(
      {
        pageUrl:
          "https://www.zillow.com/homedetails/9-Schwanda-Rd-Stafford-Springs-CT-06076/464955916_zpid/",
        title: "9 Schwanda Road, Stafford Springs, CT 06076 | Zillow",
        photoDetails: [
          {
            url: "https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp",
            alt: "1st image of 9 Schwanda Road",
            index: 0
          },
          {
            url: "https://photos.zillowstatic.com/fp/other-home-cc_ft_1344.webp",
            alt: "41 Spusta Rd, Stafford Springs, CT 06076",
            index: 1
          }
        ],
        photoUrls: [
          "https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp",
          "https://photos.zillowstatic.com/fp/other-home-cc_ft_1344.webp"
        ]
      },
      "2026-09-01T12:00:00.000Z",
      () => "capture-filtered"
    );

    expect(capture.photoUrls).toEqual([
      "https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp"
    ]);
  });
});
