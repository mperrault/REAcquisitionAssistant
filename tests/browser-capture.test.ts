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

  it("filters Realtor UI assets from browser captures", () => {
    expect(
      normalizePhotoUrls([
        "https://static.rdc.moveaws.com/rdc-ui/logos/logo-brand.svg",
        "https://static.rdc.moveaws.com/rdc-ui/icons/icon-magnifying-glass.svg",
        "https://static.rdc.moveaws.com/rdc-ui/pictos/picto-app-promotion-bg.svg",
        "https://static.rdc.moveaws.com/images/listing-detail/VU-logo-v3.svg",
        "https://p.rdcpix.com/v01/od4aa0000-c0s.gif",
        "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3204469273rd-w480_h360.webp"
      ])
    ).toEqual([
      "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3204469273rd-w480_h360.webp"
    ]);
  });

  it("dedupes Realtor image-size variants by listing photo id", () => {
    expect(
      normalizePhotoUrls([
        "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w960_h720.webp",
        "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w1280_h960.webp",
        "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3924666281rd-w1280_h960.webp"
      ])
    ).toEqual([
      "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w960_h720.webp",
      "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3924666281rd-w1280_h960.webp"
    ]);
  });

  it("filters Realtor brokerage branding and all of its CDN variants", () => {
    const brandingSmall =
      "https://ap.rdcpix.com/brandfamilyl-m100rd-w480_h360.webp";
    const brandingLarge =
      "https://ap.rdcpix.com/brandfamilyl-m100rd-w1280_h960.webp";
    const propertyPhoto =
      "https://ap.rdcpix.com/brandfamilyl-m101rd-w1280_h960.webp";

    expect(
      selectCapturePhotoUrls({
        sourceSite: "realtor.com",
        addressLine1: "47 High St",
        photoUrls: [],
        photoDetails: [
          {
            url: brandingSmall,
            alt: "Berkshire Hathaway HomeServices Realty Professionals",
            index: 0
          },
          {
            url: brandingLarge,
            alt: "",
            index: 1
          },
          {
            url: propertyPhoto,
            alt: "47 High St, Stafford, CT 06076",
            index: 2
          }
        ]
      })
    ).toEqual([propertyPhoto]);
  });

  it("keeps only Realtor listing photos from captured image details", () => {
    expect(
      selectCapturePhotoUrls({
        sourceSite: "realtor.com",
        addressLine1: "15 Green St",
        photoUrls: [],
        photoDetails: [
          {
            url: "https://static.rdc.moveaws.com/rdc-ui/logos/logo-brand.svg",
            alt: "realtor.com",
            index: 0
          },
          {
            url: "https://static.rdc.moveaws.com/rdc-ui/icons/icon-magnifying-glass.svg",
            alt: "Search",
            index: 1
          },
          {
            url: "https://p.rdcpix.com/v01/od4aa0000-c0s.gif",
            alt: "Andy Goodhall Photo",
            index: 2
          },
          {
            url: "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w960_h720.webp",
            alt: "white featured at 15 Green St, Stafford, CT 06076",
            index: 3
          },
          {
            url: "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w1280_h960.webp",
            alt: "",
            index: 4
          }
        ]
      })
    ).toEqual([
      "https://ap.rdcpix.com/aacf549986e65799097042e78a17ac5el-m3323093104rd-w960_h720.webp"
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

  it("drops Zillow photos without address-matching alt text", () => {
    expect(
      selectCapturePhotoUrls({
        sourceSite: "zillow.com",
        addressLine1: "9 Schwanda Road",
        photoUrls: [],
        photoDetails: [
          {
            url: "https://photos.zillowstatic.com/fp/unknown-cc_ft_1344.webp",
            alt: "",
            index: 0
          },
          {
            url: "https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp",
            alt: "1st image of 9 Schwanda Road",
            index: 1
          }
        ]
      })
    ).toEqual(["https://photos.zillowstatic.com/fp/target-cc_ft_1344.webp"]);
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
  it("keeps embedded Zillow listing photos even when only a few are visible", () => {
    const photos = Array.from({ length: 40 }, (_, index) => ({
      url: `https://photos.zillowstatic.com/fp/${String(index + 1).padStart(8, "0")}abcdef-${index + 1}-uncropped_scaled_within_1536_1152.webp`,
      alt: "47 High Street, Stafford, CT",
      index
    }));

    expect(
      selectCapturePhotoUrls({
        sourceSite: "zillow.com",
        addressLine1: "47 High Street",
        photoUrls: photos.map((photo) => photo.url),
        photoDetails: photos
      })
    ).toHaveLength(40);
  });

});
