import { describe, expect, it } from "vitest";

import {
  createEmptyPropertyState,
  createPropertyFact,
  createPropertyRecord,
  loadPropertyState,
  removeProperty,
  savePropertyState,
  upsertProperty,
  type StorageLike
} from "@/lib/properties/property-persistence";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("property persistence", () => {
  it("allows an incomplete property record", () => {
    const property = createPropertyRecord(
      {
        id: "property-1",
        city: "Stafford",
        state: "CT"
      },
      "2026-08-10T21:00:00.000Z"
    );

    expect(property.addressLine1).toBe("");
    expect(property.askingPrice).toBeNull();
    expect(property.bedrooms).toBeNull();
    expect(property.primaryPhotoUrl).toBe("");
    expect(property.photoUrls).toEqual([]);
    expect(property.lifecycleStatus).toBe("new");
    expect(property.city).toBe("Stafford");
  });

  it("persists a property with flexible facts and provenance", () => {
    const storage = new MemoryStorage();
    const state = createEmptyPropertyState();
    const property = createPropertyRecord(
      {
        id: "property-1",
        addressLine1: "12 Pasture Road",
        city: "Woodstock",
        state: "CT",
        primaryPhotoUrl: "https://photos.example.com/12-pasture-road.jpg",
        photoUrls: ["https://photos.example.com/12-pasture-road.jpg"],
        askingPrice: 329000,
        lifecycleStatus: "watch_list",
        facts: [
          createPropertyFact(
            {
              id: "fact-1",
              factKey: "setting.open_fields_pastoral",
              label: "Open Fields / Pastoral",
              value: true,
              sourceType: "listing",
              sourceReference: "Listing remarks",
              confidence: 0.8
            },
            "2026-08-10T21:05:00.000Z"
          )
        ],
        notes: "Looks worth reviewing if road exposure is low."
      },
      "2026-08-10T21:00:00.000Z"
    );

    const saved = upsertProperty(state, property, "2026-08-10T21:10:00.000Z");
    savePropertyState(storage, saved);
    const reloaded = loadPropertyState(storage);
    const reloadedProperty = reloaded.state.properties[0];

    expect(reloaded.source).toBe("storage");
    expect(reloadedProperty?.addressLine1).toBe("12 Pasture Road");
    expect(reloadedProperty?.primaryPhotoUrl).toBe(
      "https://photos.example.com/12-pasture-road.jpg"
    );
    expect(reloadedProperty?.photoUrls).toEqual([
      "https://photos.example.com/12-pasture-road.jpg"
    ]);
    expect(reloadedProperty?.lifecycleStatus).toBe("watch_list");
    expect(reloadedProperty?.facts[0]).toMatchObject({
      factKey: "setting.open_fields_pastoral",
      value: true,
      sourceType: "listing",
      confidence: 0.8
    });
    expect(reloadedProperty?.notes).toContain("road exposure");
  });

  it("updates an existing property instead of duplicating it", () => {
    const state = createEmptyPropertyState();
    const property = createPropertyRecord(
      {
        id: "property-1",
        city: "Union"
      },
      "2026-08-10T21:15:00.000Z"
    );
    const created = upsertProperty(state, property, "2026-08-10T21:20:00.000Z");
    const updated = upsertProperty(
      created,
      {
        ...property,
        lifecycleStatus: "worth_visiting",
        estimatedPurchasePrice: 300000
      },
      "2026-08-10T21:25:00.000Z"
    );

    expect(updated.properties).toHaveLength(1);
    expect(updated.properties[0]?.lifecycleStatus).toBe("worth_visiting");
    expect(updated.properties[0]?.estimatedPurchasePrice).toBe(300000);
    expect(updated.properties[0]?.updatedAt).toBe("2026-08-10T21:25:00.000Z");
  });

  it("removes a property by id", () => {
    const first = createPropertyRecord({ id: "property-1", city: "Ashford" });
    const second = createPropertyRecord({ id: "property-2", city: "Somers" });
    const state = {
      schemaVersion: 1 as const,
      properties: [first, second]
    };

    const nextState = removeProperty(state, "property-1");

    expect(nextState.properties).toHaveLength(1);
    expect(nextState.properties[0]?.id).toBe("property-2");
  });
});
