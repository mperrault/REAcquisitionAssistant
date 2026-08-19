import { z } from "zod";

export const calculateDriveTimeRequestSchema = z.object({
  property: z.object({
    id: z.string().min(1),
    addressLine1: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string()
  }),
  commute: z.object({
    anchorAddress: z.string(),
    anchorLat: z.number().nullable(),
    anchorLng: z.number().nullable()
  })
});

export const calculateDriveTimeResponseSchema = z.object({
  propertyId: z.string().min(1),
  calculatedAt: z.string().datetime(),
  driveTimeMinutes: z.number().int().positive().nullable(),
  distanceMiles: z.number().nonnegative().nullable(),
  origin: z
    .object({
      label: z.string(),
      lat: z.number(),
      lng: z.number()
    })
    .nullable(),
  destination: z
    .object({
      label: z.string(),
      lat: z.number(),
      lng: z.number()
    })
    .nullable(),
  warnings: z.array(z.string())
});

export type CalculateDriveTimeRequest = z.infer<
  typeof calculateDriveTimeRequestSchema
>;

export type CalculateDriveTimeResponse = z.infer<
  typeof calculateDriveTimeResponseSchema
>;

type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "json">>;

type Coordinate = {
  label: string;
  lat: number;
  lng: number;
};

function nowIso() {
  return new Date().toISOString();
}

function formatPropertyAddress(property: CalculateDriveTimeRequest["property"]) {
  return [
    property.addressLine1,
    property.city,
    property.state,
    property.postalCode
  ]
    .filter(Boolean)
    .join(", ");
}

function getUserAgentHeaders() {
  const contact = process.env.REA_GEOCODING_CONTACT_EMAIL?.trim();
  const userAgent = contact
    ? `REAcquisitionAssistant/0.1 (${contact})`
    : "REAcquisitionAssistant/0.1";

  return {
    "User-Agent": userAgent,
    Accept: "application/json"
  };
}

function readCoordinate(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

async function geocodeAddress(
  label: string,
  fetcher: FetchLike
): Promise<{ coordinate: Coordinate | null; warning: string | null }> {
  const address = label.trim();

  if (!address) {
    return {
      coordinate: null,
      warning: "Address is missing for drive-time calculation."
    };
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", address);

  const response = await fetcher(url.toString(), {
    headers: getUserAgentHeaders()
  });

  if (!response.ok) {
    return {
      coordinate: null,
      warning: `Geocoding failed with HTTP ${response.status}.`
    };
  }

  const results = (await response.json()) as unknown;

  if (!Array.isArray(results) || results.length === 0) {
    return {
      coordinate: null,
      warning: `No geocode result found for ${address}.`
    };
  }

  const firstResult = results[0] as Record<string, unknown>;
  const lat = readCoordinate(firstResult.lat);
  const lng = readCoordinate(firstResult.lon);

  if (lat === null || lng === null) {
    return {
      coordinate: null,
      warning: `Geocode result for ${address} did not include coordinates.`
    };
  }

  return {
    coordinate: {
      label: String(firstResult.display_name ?? address),
      lat,
      lng
    },
    warning: null
  };
}

async function getDrivingRoute(
  origin: Coordinate,
  destination: Coordinate,
  fetcher: FetchLike
) {
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  );
  url.searchParams.set("overview", "false");

  const response = await fetcher(url.toString(), {
    headers: getUserAgentHeaders()
  });

  if (!response.ok) {
    return {
      driveTimeMinutes: null,
      distanceMiles: null,
      warning: `Route calculation failed with HTTP ${response.status}.`
    };
  }

  const payload = (await response.json()) as {
    routes?: Array<{ duration?: unknown; distance?: unknown }>;
  };
  const route = payload.routes?.[0];
  const durationSeconds = readCoordinate(route?.duration);
  const distanceMeters = readCoordinate(route?.distance);

  if (durationSeconds === null || distanceMeters === null) {
    return {
      driveTimeMinutes: null,
      distanceMiles: null,
      warning: "Route calculation did not include duration and distance."
    };
  }

  return {
    driveTimeMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    distanceMiles: Math.round((distanceMeters / 1609.344) * 10) / 10,
    warning: null
  };
}

export async function calculateDriveTime(
  request: CalculateDriveTimeRequest,
  fetcher: FetchLike = fetch
): Promise<CalculateDriveTimeResponse> {
  const parsedRequest = calculateDriveTimeRequestSchema.parse(request);
  const warnings: string[] = [];
  const propertyAddress = formatPropertyAddress(parsedRequest.property);
  const destination =
    parsedRequest.commute.anchorLat !== null &&
    parsedRequest.commute.anchorLng !== null
      ? {
          label: parsedRequest.commute.anchorAddress.trim() || "Commute anchor",
          lat: parsedRequest.commute.anchorLat,
          lng: parsedRequest.commute.anchorLng
        }
      : null;

  const originResult = await geocodeAddress(propertyAddress, fetcher);
  const destinationResult =
    destination ??
    (
      await geocodeAddress(parsedRequest.commute.anchorAddress, fetcher)
    ).coordinate;

  if (originResult.warning) {
    warnings.push(originResult.warning);
  }

  if (!destination && !destinationResult) {
    warnings.push("Commute anchor address could not be geocoded.");
  }

  if (!originResult.coordinate || !destinationResult) {
    return calculateDriveTimeResponseSchema.parse({
      propertyId: parsedRequest.property.id,
      calculatedAt: nowIso(),
      driveTimeMinutes: null,
      distanceMiles: null,
      origin: originResult.coordinate,
      destination: destinationResult,
      warnings
    });
  }

  const route = await getDrivingRoute(
    originResult.coordinate,
    destinationResult,
    fetcher
  );

  if (route.warning) {
    warnings.push(route.warning);
  }

  return calculateDriveTimeResponseSchema.parse({
    propertyId: parsedRequest.property.id,
    calculatedAt: nowIso(),
    driveTimeMinutes: route.driveTimeMinutes,
    distanceMiles: route.distanceMiles,
    origin: originResult.coordinate,
    destination: destinationResult,
    warnings
  });
}
