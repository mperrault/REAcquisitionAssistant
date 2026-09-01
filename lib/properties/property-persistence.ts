import {
  type PropertyFact,
  type PropertyRecord,
  type PropertyState,
  propertyFactSchema,
  propertyRecordSchema,
  propertyStateSchema
} from "@/lib/properties/types";

export const PROPERTY_STORAGE_KEY = "re-acquisition-assistant.properties.v1";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type LoadPropertyStateResult = {
  state: PropertyState;
  source: "storage" | "empty" | "reset";
};

function nowIso() {
  return new Date().toISOString();
}

export function createEmptyPropertyState(): PropertyState {
  return {
    schemaVersion: 1,
    properties: []
  };
}

export function createPropertyRecord(
  patch: Partial<PropertyRecord> = {},
  timestamp = nowIso(),
  createId = createPropertyId
): PropertyRecord {
  return propertyRecordSchema.parse({
    id: patch.id ?? createId(),
    addressLine1: patch.addressLine1 ?? "",
    city: patch.city ?? "",
    state: patch.state ?? "CT",
    postalCode: patch.postalCode ?? "",
    latitude: patch.latitude ?? null,
    longitude: patch.longitude ?? null,
    listingUrl: patch.listingUrl ?? "",
    mlsId: patch.mlsId ?? "",
    primaryPhotoUrl: patch.primaryPhotoUrl ?? "",
    photoUrls: patch.photoUrls ?? [],
    askingPrice: patch.askingPrice ?? null,
    estimatedPurchasePrice: patch.estimatedPurchasePrice ?? null,
    listingStatus: patch.listingStatus ?? "unknown",
    lifecycleStatus: patch.lifecycleStatus ?? "new",
    bedrooms: patch.bedrooms ?? null,
    bathrooms: patch.bathrooms ?? null,
    livingSqft: patch.livingSqft ?? null,
    lotAcres: patch.lotAcres ?? null,
    yearBuilt: patch.yearBuilt ?? null,
    annualPropertyTax: patch.annualPropertyTax ?? null,
    hoaPresent: patch.hoaPresent ?? null,
    hoaFee: patch.hoaFee ?? null,
    houseStyle: patch.houseStyle ?? "",
    garageSpaces: patch.garageSpaces ?? null,
    heatingType: patch.heatingType ?? "",
    waterSource: patch.waterSource ?? "",
    sewerType: patch.sewerType ?? "",
    listingRemarks: patch.listingRemarks ?? "",
    notes: patch.notes ?? "",
    facts: patch.facts ?? [],
    enrichmentDiagnostics: patch.enrichmentDiagnostics ?? [],
    createdAt: patch.createdAt ?? timestamp,
    updatedAt: patch.updatedAt ?? timestamp
  });
}

export function createPropertyFact(
  patch: Partial<PropertyFact> = {},
  timestamp = nowIso(),
  createId = createPropertyId
): PropertyFact {
  return propertyFactSchema.parse({
    id: patch.id ?? createId(),
    factKey: patch.factKey ?? "setting.custom",
    label: patch.label ?? "New Fact",
    value: patch.value ?? null,
    sourceType: patch.sourceType ?? "user_entered",
    sourceReference: patch.sourceReference ?? "",
    confidence: patch.confidence ?? null,
    verified: patch.verified ?? false,
    observedAt: patch.observedAt ?? timestamp
  });
}

export function loadPropertyState(storage: StorageLike): LoadPropertyStateResult {
  const rawValue = storage.getItem(PROPERTY_STORAGE_KEY);

  if (!rawValue) {
    return {
      state: createEmptyPropertyState(),
      source: "empty"
    };
  }

  try {
    return {
      state: propertyStateSchema.parse(JSON.parse(rawValue)),
      source: "storage"
    };
  } catch {
    return {
      state: createEmptyPropertyState(),
      source: "reset"
    };
  }
}

export function savePropertyState(
  storage: StorageLike,
  state: PropertyState
): PropertyState {
  const parsed = propertyStateSchema.parse(state);
  storage.setItem(PROPERTY_STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

export function upsertProperty(
  state: PropertyState,
  property: PropertyRecord,
  timestamp = nowIso()
): PropertyState {
  const parsedProperty = propertyRecordSchema.parse({
    ...property,
    updatedAt: timestamp
  });
  const exists = state.properties.some((item) => item.id === property.id);

  return {
    ...state,
    properties: exists
      ? state.properties.map((item) =>
          item.id === property.id ? parsedProperty : item
        )
      : [parsedProperty, ...state.properties]
  };
}

export function removeProperty(
  state: PropertyState,
  propertyId: string
): PropertyState {
  return {
    ...state,
    properties: state.properties.filter((property) => property.id !== propertyId)
  };
}

export function createPropertyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `property-${Date.now()}`;
}
