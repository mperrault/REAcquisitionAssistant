import { describe, expect, it } from "vitest";

import { calculateDriveTime } from "@/lib/commute/drive-time";

function createJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

const request = {
  property: {
    id: "property-175",
    addressLine1: "175 W Stafford Rd",
    city: "Stafford",
    state: "CT",
    postalCode: "06076"
  },
  commute: {
    anchorAddress: "100 Main St, Stafford Springs, CT",
    anchorLat: null,
    anchorLng: null
  }
};

describe("drive time calculation", () => {
  it("geocodes property and anchor addresses, then calculates drive time", async () => {
    const requestedUrls: string[] = [];
    const result = await calculateDriveTime(request, async (input) => {
      requestedUrls.push(input);

      if (input.includes("nominatim") && input.includes("175+W+Stafford")) {
        return createJsonResponse([
          {
            display_name: "175 W Stafford Rd, Stafford, CT",
            lat: "41.987",
            lon: "-72.305"
          }
        ]);
      }

      if (input.includes("nominatim")) {
        return createJsonResponse([
          {
            display_name: "100 Main St, Stafford Springs, CT",
            lat: "41.955",
            lon: "-72.302"
          }
        ]);
      }

      return createJsonResponse({
        routes: [
          {
            duration: 1620,
            distance: 18507
          }
        ]
      });
    });

    expect(requestedUrls).toHaveLength(3);
    expect(result.propertyId).toBe("property-175");
    expect(result.driveTimeMinutes).toBe(27);
    expect(result.distanceMiles).toBe(11.5);
    expect(result.warnings).toEqual([]);
  });

  it("uses existing anchor coordinates when available", async () => {
    const requestedUrls: string[] = [];
    const result = await calculateDriveTime(
      {
        ...request,
        commute: {
          anchorAddress: "Known anchor",
          anchorLat: 41.955,
          anchorLng: -72.302
        }
      },
      async (input) => {
        requestedUrls.push(input);

        if (input.includes("nominatim")) {
          return createJsonResponse([
            {
              display_name: "175 W Stafford Rd, Stafford, CT",
              lat: "41.987",
              lon: "-72.305"
            }
          ]);
        }

        return createJsonResponse({
          routes: [
            {
              duration: 600,
              distance: 8046
            }
          ]
        });
      }
    );

    expect(requestedUrls.filter((url) => url.includes("nominatim"))).toHaveLength(
      1
    );
    expect(result.destination).toMatchObject({
      label: "Known anchor",
      lat: 41.955,
      lng: -72.302
    });
    expect(result.driveTimeMinutes).toBe(10);
    expect(result.distanceMiles).toBe(5);
  });

  it("returns warnings instead of a drive time when geocoding fails", async () => {
    const result = await calculateDriveTime(request, async () =>
      createJsonResponse([], 200)
    );

    expect(result.driveTimeMinutes).toBeNull();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No geocode result found"),
        "Commute anchor address could not be geocoded."
      ])
    );
  });
});
