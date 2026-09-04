export type ListingUrlNormalization = {
  originalUrl: string;
  canonicalUrl: string;
  wasNormalized: boolean;
  source: "direct" | "realtor_email_tracking";
  warning: string;
};

export type RealtorListingAddressHint = {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRealtorHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "realtor.com" || normalized.endsWith(".realtor.com");
}

function stripRealtorTracking(url: URL) {
  if (isRealtorHost(url.hostname) && url.pathname.includes("/realestateandhomes-detail/")) {
    url.search = "";
    url.hash = "";
  }

  return url.toString();
}

export function normalizeListingUrl(value: string): ListingUrlNormalization {
  const originalUrl = value.trim();

  try {
    const original = new URL(originalUrl);
    const hostname = original.hostname.toLowerCase();

    if (hostname === "e.e.mail.realtor.com") {
      const jwtPayload = original.searchParams.get("jwtP");
      const decoded = jwtPayload ? decodeBase64UrlJson(jwtPayload) : null;
      const destination =
        decoded && typeof decoded.linkUrl === "string" ? decoded.linkUrl.trim() : "";

      if (destination) {
        try {
          const destinationUrl = new URL(destination);

          if (isRealtorHost(destinationUrl.hostname)) {
            const canonicalUrl = stripRealtorTracking(destinationUrl);
            return {
              originalUrl,
              canonicalUrl,
              wasNormalized: canonicalUrl !== originalUrl,
              source: "realtor_email_tracking",
              warning: ""
            };
          }
        } catch {
          // Fall through to safe original URL handling.
        }
      }

      return {
        originalUrl,
        canonicalUrl: original.toString(),
        wasNormalized: false,
        source: "realtor_email_tracking",
        warning: "Realtor email tracking URL could not be resolved to a Realtor listing URL."
      };
    }

    const canonicalUrl = stripRealtorTracking(original);
    return {
      originalUrl,
      canonicalUrl,
      wasNormalized: canonicalUrl !== originalUrl,
      source: "direct",
      warning: ""
    };
  } catch {
    return {
      originalUrl,
      canonicalUrl: originalUrl,
      wasNormalized: false,
      source: "direct",
      warning: "Listing URL could not be parsed."
    };
  }
}

function fromSlug(value: string) {
  return decodeURIComponent(value).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function getRealtorListingAddressHint(value: string): RealtorListingAddressHint | null {
  try {
    const normalized = normalizeListingUrl(value);
    const url = new URL(normalized.canonicalUrl);

    if (!isRealtorHost(url.hostname)) {
      return null;
    }

    const marker = "/realestateandhomes-detail/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const slug = url.pathname.slice(markerIndex + marker.length).split("/")[0] ?? "";
    const parts = slug.split("_");
    if (parts.length < 4 || !parts[0]) {
      return null;
    }

    return {
      addressLine1: fromSlug(parts[0]),
      city: fromSlug(parts[1] ?? ""),
      state: fromSlug(parts[2] ?? "").toUpperCase(),
      postalCode: fromSlug(parts[3] ?? "")
    };
  } catch {
    return null;
  }
}

function normalizeStreet(value: string) {
  return value
    .toLowerCase()
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bhighway\b/g, "hwy")
    .replace(/\broute\b/g, "rte")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function listingUrlAddressMatches(addressLine1: string, listingUrl: string): boolean | null {
  const hint = getRealtorListingAddressHint(listingUrl);
  if (!hint || !addressLine1.trim()) {
    return null;
  }

  const candidate = normalizeStreet(addressLine1);
  const hinted = normalizeStreet(hint.addressLine1);
  const candidateNumber = candidate.match(/^([0-9]+[a-z]?)\b/)?.[1] ?? "";
  const hintedNumber = hinted.match(/^([0-9]+[a-z]?)\b/)?.[1] ?? "";

  if (candidateNumber && hintedNumber && candidateNumber !== hintedNumber) {
    return false;
  }

  return candidate === hinted;
}
