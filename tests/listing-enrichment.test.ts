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
  it("fills missing price and photo from listing page metadata", async () => {
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
    expect(result.updates.primaryPhotoUrl).toBe(
      "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg"
    );
    expect(result.warnings).toEqual([]);
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
      "Photo style inference skipped because OPENAI_API_KEY is not configured."
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
