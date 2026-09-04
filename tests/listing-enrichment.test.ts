import { describe, expect, it } from "vitest";

import { enrichListingCandidate } from "@/lib/listing-alerts/listing-enrichment";

const baseCandidate = {
  id: "candidate-1",
  listingUrl:
    "https://www.realtor.com/realestateandhomes-detail/47-High-St_Stafford_CT_06076_M33333",
  addressLine1: "47 High St",
  city: "Stafford",
  state: "CT",
  postalCode: "06076",
  askingPrice: null,
  primaryPhotoUrl: "",
  photoUrls: []
};

function createFetchResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => html
  } as Response;
}

function createJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

describe("listing page enrichment", () => {
  it("fills missing price but does not import photos from listing page metadata", async () => {
    const result = await enrichListingCandidate(baseCandidate, async () =>
      createFetchResponse(`<html>
        <head>
          <meta property="og:image" content="https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg" />
          <script type="application/ld+json">
            {
              "@type": "SingleFamilyResidence",
              "address": "47 High St, Stafford, CT 06076",
              "offers": { "price": "315000" }
            }
          </script>
        </head>
        <body>47 High St Stafford CT 06076</body>
      </html>`)
    );

    expect(result.candidateId).toBe(baseCandidate.id);
    expect(result.updates.askingPrice).toBe(315000);
    expect(result.updates.primaryPhotoUrl).toBe("");
    expect(result.updates.photoUrls).toEqual([]);
    expect(result.diagnostics.some((item) => item.stage === "listing fetch")).toBe(
      true
    );
    expect(result.diagnostics.some((item) => item.stage === "price")).toBe(true);
    expect(result.warnings).toEqual([
      "Listing page did not expose a property photo."
    ]);
  });

  it("emits diagnostics through a callback during enrichment", async () => {
    const streamedStages: string[] = [];
    const result = await enrichListingCandidate(
      baseCandidate,
      async () =>
        createFetchResponse(`<html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "SingleFamilyResidence",
                "address": "47 High St, Stafford, CT 06076",
                "offers": { "price": "315000" }
              }
            </script>
          </head>
          <body>47 High St Stafford CT 06076</body>
        </html>`),
      {
        onDiagnostic(diagnostic) {
          streamedStages.push(diagnostic.stage);
        }
      }
    );

    expect(streamedStages).toContain("start");
    expect(streamedStages).toContain("listing fetch");
    expect(streamedStages).toEqual(
      result.diagnostics.map((diagnostic) => diagnostic.stage)
    );
  });

  it("does not return updates when fetched page belongs to another address", async () => {
    const result = await enrichListingCandidate(baseCandidate, async () =>
      createFetchResponse(`<html>
        <head>
          <meta property="og:image" content="https://ap.rdcpix.com/175staffordroadl-m4046937172s.jpg" />
          <script type="application/ld+json">
            {
              "@type": "SingleFamilyResidence",
              "address": "175 W Stafford Rd, Stafford, CT 06076",
              "offers": { "price": "275000" }
            }
          </script>
        </head>
        <body>175 W Stafford Rd Stafford CT 06076</body>
      </html>`)
    );

    expect(result.updates.askingPrice).toBeNull();
    expect(result.updates.primaryPhotoUrl).toBe("");
    expect(result.updates.photoUrls).toEqual([]);
    expect(result.warnings).toContain(
      "Fetched listing page did not include candidate address."
    );
  });

  it("does not request updates for fields already populated", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        askingPrice: 315000,
        primaryPhotoUrl:
          "https://photos.zillowstatic.com/fp/existing-listing-image.jpg",
        photoUrls: ["https://photos.zillowstatic.com/fp/existing-listing-image.jpg"]
      },
      async () =>
        createFetchResponse(`<html>
          <head>
            <meta property="og:image" content="https://ap.rdcpix.com/new-image.jpg" />
            <script type="application/ld+json">
              {
                "@type": "SingleFamilyResidence",
                "address": "47 High St, Stafford, CT 06076",
                "offers": { "price": "325000" }
              }
            </script>
          </head>
          <body>47 High St Stafford CT 06076</body>
        </html>`)
    );

    expect(result.updates.askingPrice).toBeNull();
    expect(result.updates.primaryPhotoUrl).toBe("");
    expect(result.updates.photoUrls).toEqual([]);
  });

  it("infers house style from listing text when requested", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        inferStyle: true,
        listingRemarks:
          "Classic New England Colonial with original trim and a center stair."
      },
      async () =>
        createFetchResponse(`<html>
          <body>47 High St Stafford CT 06076 Classic New England Colonial.</body>
        </html>`)
    );

    expect(result.updates.houseStyle).toBe("Colonial");
    expect(result.updates.styleFactKey).toBe("style.colonial");
    expect(result.updates.styleConfidence).toBe(0.85);
    expect(result.updates.styleSource).toBe("listing_text");
    expect(result.warnings).not.toContain(
      "House style inference failed: listing text did not identify a style; photo inference skipped because OPENAI_API_KEY is not configured."
    );
  });

  it("infers house style from listing remarks when page fetch is rate limited", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        inferStyle: true,
        listingRemarks:
          "Well-kept Cape with two bedrooms and a compact Stafford lot."
      },
      async () => createFetchResponse("", 429)
    );

    expect(result.updates.houseStyle).toBe("Cape");
    expect(result.updates.styleFactKey).toBe("style.cape");
    expect(result.updates.styleSource).toBe("listing_text");
    expect(result.warnings).toContain("Listing page fetch failed with HTTP 429.");
    expect(result.warnings).not.toContain(
      "House style inference failed: listing page fetch failed with HTTP 429."
    );
  });

  it("infers setting and view facts from listing remarks when page fetch is rate limited", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        listingRemarks:
          "Private wooded setting with partial lake views near Staffordville Lake."
      },
      async () => createFetchResponse("Too Many Requests", 429)
    );

    expect(result.warnings).toContain("Listing page fetch failed with HTTP 429.");
    expect(result.updates.settingFacts).toEqual([
      {
        factKey: "setting.lake_view",
        label: "Lake View",
        confidence: 0.8,
        evidence:
          "Private wooded setting with partial lake views near Staffordville Lake."
      },
      {
        factKey: "setting.woods_privacy",
        label: "Woods / Privacy",
        confidence: 0.7,
        evidence: "Private wooded"
      }
    ]);
    expect(
      result.diagnostics.some(
        (item) =>
          item.stage === "setting text" &&
          item.status === "success" &&
          item.message === "Listing remarks matched setting/view facts."
      )
    ).toBe(true);
  });

  it("records a neutral setting coverage fact when text has no preferred setting", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        listingRemarks:
          "Charming Colonial near Stafford Springs shops, restaurants, parks and amenities."
      },
      async () => createFetchResponse("Too Many Requests", 429)
    );

    expect(result.updates.settingFacts).toEqual([
      {
        factKey: "setting.no_preferred_match",
        label: "No Preferred Setting Match",
        confidence: 0.7,
        evidence:
          "Listing text was checked and no preferred setting/view phrases were matched."
      }
    ]);
    expect(
      result.diagnostics.some(
        (item) =>
          item.stage === "setting text" &&
          item.status === "info" &&
          item.message === "No preferred setting/view matched."
      )
    ).toBe(true);
  });

  it("explains when style text inference fails and no photo can be analyzed", async () => {
    const result = await enrichListingCandidate(
      {
        ...baseCandidate,
        inferStyle: true
      },
      async () =>
        createFetchResponse(`<html>
          <body>47 High St Stafford CT 06076 Detached home.</body>
        </html>`)
    );

    expect(result.updates.houseStyle).toBe("");
    expect(result.warnings).toContain(
      "House style inference failed: listing text did not identify a style; no eligible exterior photo URL was available for photo inference."
    );
  });

  it("falls back to photo inference when listing text has no house style", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const requestedUrls: string[] = [];

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          askingPrice: 315000,
          primaryPhotoUrl:
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg",
          photoUrls: [
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg"
          ],
          inferStyle: true
        },
        async (input) => {
          requestedUrls.push(input);

          if (input.includes("api.openai.com")) {
            return createJsonResponse({
              output_text: JSON.stringify({
                houseStyle: "Ranch",
                confidence: 0.72,
                evidence: "Single-story massing and low roofline."
              })
            });
          }

          return createFetchResponse(`<html>
            <head>
              <meta property="og:image" content="https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg" />
              <script type="application/ld+json">
                {
                  "@type": "SingleFamilyResidence",
                  "address": "47 High St, Stafford, CT 06076",
                  "offers": { "price": "315000" }
                }
              </script>
            </head>
            <body>47 High St Stafford CT 06076 Detached home.</body>
          </html>`);
        }
      );

      expect(requestedUrls.some((url) => url.includes("api.openai.com"))).toBe(
        true
      );
      expect(result.updates.houseStyle).toBe("Ranch");
      expect(result.updates.styleFactKey).toBe("style.ranch");
      expect(result.updates.styleConfidence).toBe(0.72);
      expect(result.updates.styleSource).toBe("photo_inference");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("retries style photo inference one image at a time when a batch image is rejected", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const apiRequestBodies: unknown[] = [];

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          askingPrice: 315000,
          primaryPhotoUrl:
            "https://photos.zillowstatic.com/fp/first-exterior.jpg",
          photoUrls: [
            "https://photos.zillowstatic.com/fp/first-exterior.jpg",
            "https://photos.zillowstatic.com/fp/second-exterior.jpg"
          ],
          inferStyle: true
        },
        async (input, init) => {
          if (input.includes("api.openai.com")) {
            apiRequestBodies.push(JSON.parse(String(init?.body)));

            if (apiRequestBodies.length === 1) {
              return createJsonResponse(
                { error: { message: "Invalid image URL." } },
                400
              );
            }

            return createJsonResponse({
              output_text: JSON.stringify({
                houseStyle: "Farmhouse",
                confidence: 0.73,
                evidence: "Gabled farmhouse form is visible."
              })
            });
          }

          return createFetchResponse(`<html>
            <head>
              <meta property="og:image" content="https://photos.zillowstatic.com/fp/first-exterior.jpg" />
              <meta property="og:image" content="https://photos.zillowstatic.com/fp/second-exterior.jpg" />
            </head>
            <body>47 High St Stafford CT 06076 Detached home.</body>
          </html>`);
        }
      );

      expect(apiRequestBodies).toHaveLength(2);
      expect(result.updates.houseStyle).toBe("Farmhouse");
      expect(result.updates.styleFactKey).toBe("style.farmhouse");
      expect(result.updates.styleSource).toBe("photo_inference");
      expect(result.warnings).toEqual([]);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("infers renovation scope and estimates from listing photos", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const requestedUrls: string[] = [];

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          primaryPhotoUrl:
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg",
          photoUrls: [
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg"
          ],
          inferRenovation: true
        },
        async (input) => {
          requestedUrls.push(input);

          if (input.includes("api.openai.com")) {
            return createJsonResponse({
              output_text: JSON.stringify({
                scopeFacts: [
                  {
                    factKey: "renovation.kitchen",
                    confidence: 0.74,
                    evidence: "Kitchen finishes appear dated."
                  }
                ],
                lineItems: [
                  {
                    label: "Kitchen refresh",
                    amount: 18000,
                    confidence: 0.7,
                    evidence: "Older cabinets and counters are visible."
                  }
                ],
                expectedCost: 18000,
                lowEstimate: 12000,
                highEstimate: 26000
              })
            });
          }

          return createFetchResponse(`<html>
            <head>
              <meta property="og:image" content="https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg" />
              <script type="application/ld+json">
                {
                  "@type": "SingleFamilyResidence",
                  "address": "47 High St, Stafford, CT 06076",
                  "offers": { "price": "315000" }
                }
              </script>
            </head>
            <body>47 High St Stafford CT 06076 Detached home.</body>
          </html>`);
        }
      );

      expect(requestedUrls.some((url) => url.includes("api.openai.com"))).toBe(
        true
      );
      expect(result.updates.renovationScopeFacts).toEqual([
        {
          factKey: "renovation.kitchen",
          label: "Kitchen",
          confidence: 0.74,
          evidence: "Kitchen finishes appear dated."
        }
      ]);
      expect(result.updates.renovationLineItems).toEqual([
        {
          factKey: "renovation.line_item.kitchen_refresh",
          label: "Kitchen refresh",
          amount: 18000,
          confidence: 0.7,
          evidence: "Older cabinets and counters are visible."
        }
      ]);
      expect(result.updates.renovationExpectedCost).toBe(18000);
      expect(result.updates.renovationLowEstimate).toBe(12000);
      expect(result.updates.renovationHighEstimate).toBe(26000);
      expect(result.warnings).toEqual([]);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("analyzes all eligible saved Realtor photos in renovation batches", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const apiImageCounts: number[] = [];
    const photoUrls = Array.from(
      { length: 17 },
      (_, index) =>
        `https://ap.rdcpix.com/47highstreetstaffordct06076l-m${index + 1}rd-w960_h720`
    );

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          primaryPhotoUrl: photoUrls[0],
          photoUrls,
          inferRenovation: true
        },
        async (input, init) => {
          if (input.includes("api.openai.com")) {
            const body = JSON.parse(String(init?.body)) as {
              input?: Array<{
                content?: Array<{ type?: string }>;
              }>;
            };
            apiImageCounts.push(
              body.input?.[0]?.content?.filter(
                (item) => item.type === "input_image"
              ).length ?? 0
            );

            return createJsonResponse({
              output_text: JSON.stringify({
                scopeFacts: [
                  {
                    factKey: "renovation.paint",
                    confidence: 0.7,
                    evidence: "Visible finishes need refreshing."
                  }
                ],
                lineItems: [
                  {
                    label: "Interior paint",
                    amount: 6000,
                    confidence: 0.7,
                    evidence: "Visible finishes need refreshing."
                  }
                ],
                expectedCost: 6000,
                lowEstimate: 4000,
                highEstimate: 8000
              })
            });
          }

          return createFetchResponse(
            "<html><body>47 High St Stafford CT 06076 Detached home.</body></html>"
          );
        }
      );

      expect(apiImageCounts).toEqual([8, 8, 1]);
      const renovationPhotoDiagnostic = result.diagnostics.find(
        (item) => item.stage === "renovation photos"
      );

      expect(renovationPhotoDiagnostic).toBeDefined();
      expect(renovationPhotoDiagnostic?.status).toBe("started");
      expect(renovationPhotoDiagnostic?.detail).toContain("17");
      expect(result.updates.renovationScopeFacts).toHaveLength(1);
      expect(result.updates.renovationLineItems).toHaveLength(1);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("derives renovation scope facts from photo-inferred line items", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          askingPrice: 300000,
          primaryPhotoUrl:
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg",
          photoUrls: [
            "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg"
          ],
          inferRenovation: true
        },
        async (input) => {
          if (input.includes("api.openai.com")) {
            return createJsonResponse({
              output_text: JSON.stringify({
                scopeFacts: [],
                lineItems: [
                  {
                    label: "Kitchen refresh",
                    amount: 18000,
                    confidence: 0.7,
                    evidence: "Older cabinets and counters are visible."
                  }
                ],
                expectedCost: 18000,
                lowEstimate: 12000,
                highEstimate: 26000
              })
            });
          }

          return createFetchResponse(`<html>
            <head>
              <meta property="og:image" content="https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg" />
            </head>
            <body>47 High St Stafford CT 06076 Detached home.</body>
          </html>`);
        }
      );

      expect(result.updates.renovationScopeFacts).toEqual([
        {
          factKey: "renovation.kitchen",
          label: "Kitchen",
          confidence: 0.7,
          evidence: "Older cabinets and counters are visible."
        }
      ]);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("falls back to listing remarks for renovation scope when photos cannot be analyzed", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          inferRenovation: true,
          listingRemarks:
            "Three bedroom home with lots of possibilities, with some TLC you can make it your own. Being sold As Is."
        },
        async () => createFetchResponse("Too Many Requests", 429)
      );

      expect(result.warnings).toContain("Listing page fetch failed with HTTP 429.");
      expect(result.warnings).toContain(
        "renovation inference skipped because no eligible listing photo URL was available"
      );
      expect(result.updates.renovationScopeFacts).toMatchObject([
        {
          factKey: "renovation.paint",
          label: "Paint",
          confidence: 0.62
        },
        {
          factKey: "renovation.flooring",
          label: "Flooring",
          confidence: 0.58
        }
      ]);
      expect(result.updates.renovationScopeFacts[0]?.evidence).toContain("TLC");
      expect(result.updates.renovationLineItems).toMatchObject([
        {
          factKey: "renovation.line_item.general_cosmetic_refresh",
          label: "General cosmetic refresh",
          amount: 20000,
          confidence: 0.6
        }
      ]);
      expect(result.updates.renovationLineItems[0]?.evidence).toContain("TLC");
      expect(result.updates.renovationExpectedCost).toBe(20000);
      expect(result.updates.renovationLowEstimate).toBe(12000);
      expect(result.updates.renovationHighEstimate).toBe(32000);
      expect(
        result.diagnostics.some(
          (item) =>
            item.stage === "renovation" &&
            item.status === "success" &&
            item.message === "Renovation inference produced facts."
        )
      ).toBe(true);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses existing listing photos for renovation inference when page fetch is rate limited", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          inferRenovation: true,
          primaryPhotoUrl:
            "https://photos.zillowstatic.com/fp/existing-kitchen-photo.jpg"
        },
        async (input) => {
          if (input.includes("api.openai.com")) {
            return createJsonResponse({
              output_text: JSON.stringify({
                scopeFacts: [
                  {
                    factKey: "renovation.flooring",
                    confidence: 0.63,
                    evidence: "Worn flooring is visible."
                  }
                ],
                lineItems: [],
                expectedCost: 6000,
                lowEstimate: 4000,
                highEstimate: 9000
              })
            });
          }

          return createFetchResponse("Too Many Requests", 429);
        }
      );

      expect(result.warnings).toContain("Listing page fetch failed with HTTP 429.");
      expect(result.updates.renovationScopeFacts[0]).toMatchObject({
        factKey: "renovation.flooring",
        label: "Flooring",
        confidence: 0.63
      });
      expect(result.updates.renovationExpectedCost).toBe(6000);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses existing listing photos for style inference when page fetch is rate limited", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const requestedUrls: string[] = [];

    try {
      const result = await enrichListingCandidate(
        {
          ...baseCandidate,
          inferStyle: true,
          primaryPhotoUrl:
            "https://photos.zillowstatic.com/fp/existing-exterior-photo.jpg",
          listingRemarks: "Detached home with a sunny yard."
        },
        async (input) => {
          requestedUrls.push(input);

          if (input.includes("api.openai.com")) {
            return createJsonResponse({
              output_text: JSON.stringify({
                houseStyle: "Ranch",
                confidence: 0.7,
                evidence: "Single-story exterior form is visible."
              })
            });
          }

          return createFetchResponse("Too Many Requests", 429);
        }
      );

      expect(requestedUrls.some((url) => url.includes("api.openai.com"))).toBe(
        true
      );
      expect(result.warnings).toContain("Listing page fetch failed with HTTP 429.");
      expect(result.warnings).not.toContain(
        "House style inference failed: listing page fetch failed with HTTP 429."
      );
      expect(result.updates.houseStyle).toBe("Ranch");
      expect(result.updates.styleFactKey).toBe("style.ranch");
      expect(result.updates.styleSource).toBe("photo_inference");
      expect(
        result.diagnostics.some(
          (item) =>
            item.stage === "style photos" &&
            item.status === "started" &&
            item.message ===
              "Running photo style inference from saved candidate photos."
        )
      ).toBe(true);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("returns an explicit warning when the listing page blocks fetches", async () => {
    const result = await enrichListingCandidate(baseCandidate, async () =>
      createFetchResponse("Too Many Requests", 429)
    );

    expect(result.updates.askingPrice).toBeNull();
    expect(result.updates.primaryPhotoUrl).toBe("");
    expect(result.warnings).toContain(
      "Listing page fetch failed with HTTP 429."
    );
  });
});
