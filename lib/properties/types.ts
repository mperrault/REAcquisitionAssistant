import { z } from "zod";

export const lifecycleStatusSchema = z.enum([
  "new",
  "reviewing",
  "watch_list",
  "worth_visiting",
  "visit_scheduled",
  "visited",
  "interested",
  "offer_candidate",
  "offer_submitted",
  "under_contract",
  "purchased",
  "rejected",
  "sold_unavailable"
]);

export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>;

export const listingStatusSchema = z.enum([
  "unknown",
  "active",
  "pending",
  "under_contract",
  "sold",
  "off_market"
]);

export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const propertyFactSourceTypeSchema = z.enum([
  "user_entered",
  "listing",
  "gis",
  "api",
  "ai_inferred",
  "verified"
]);

export type PropertyFactSourceType = z.infer<typeof propertyFactSourceTypeSchema>;

export const propertyFactSchema = z.object({
  id: z.string().min(1),
  factKey: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.boolean(), z.number(), z.string(), z.null()]),
  sourceType: propertyFactSourceTypeSchema,
  sourceReference: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  verified: z.boolean(),
  observedAt: z.string().datetime()
});

export type PropertyFact = z.infer<typeof propertyFactSchema>;

const nullableNumberSchema = z.number().nonnegative().nullable();
const nullableIntegerSchema = z.number().int().nonnegative().nullable();

export const propertyRecordSchema = z.object({
  id: z.string().min(1),
  addressLine1: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  listingUrl: z.string(),
  mlsId: z.string(),
  askingPrice: nullableIntegerSchema,
  estimatedPurchasePrice: nullableIntegerSchema,
  listingStatus: listingStatusSchema,
  lifecycleStatus: lifecycleStatusSchema,
  bedrooms: nullableNumberSchema,
  bathrooms: nullableNumberSchema,
  livingSqft: nullableIntegerSchema,
  lotAcres: nullableNumberSchema,
  yearBuilt: nullableIntegerSchema,
  annualPropertyTax: nullableIntegerSchema,
  hoaPresent: z.boolean().nullable(),
  hoaFee: nullableIntegerSchema,
  houseStyle: z.string(),
  garageSpaces: nullableIntegerSchema,
  heatingType: z.string(),
  waterSource: z.string(),
  sewerType: z.string(),
  listingRemarks: z.string(),
  notes: z.string(),
  facts: z.array(propertyFactSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type PropertyRecord = z.infer<typeof propertyRecordSchema>;

export const propertyStateSchema = z.object({
  schemaVersion: z.literal(1),
  properties: z.array(propertyRecordSchema)
});

export type PropertyState = z.infer<typeof propertyStateSchema>;

export const lifecycleStatusOptions: Array<{
  value: LifecycleStatus;
  label: string;
}> = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "watch_list", label: "Watch List" },
  { value: "worth_visiting", label: "Worth Visiting" },
  { value: "visit_scheduled", label: "Visit Scheduled" },
  { value: "visited", label: "Visited" },
  { value: "interested", label: "Interested" },
  { value: "offer_candidate", label: "Offer Candidate" },
  { value: "offer_submitted", label: "Offer Submitted" },
  { value: "under_contract", label: "Under Contract" },
  { value: "purchased", label: "Purchased" },
  { value: "rejected", label: "Rejected" },
  { value: "sold_unavailable", label: "Sold / Unavailable" }
];

export const listingStatusOptions: Array<{
  value: ListingStatus;
  label: string;
}> = [
  { value: "unknown", label: "Unknown" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "under_contract", label: "Under Contract" },
  { value: "sold", label: "Sold" },
  { value: "off_market", label: "Off Market" }
];

export const propertyFactSourceOptions: Array<{
  value: PropertyFactSourceType;
  label: string;
}> = [
  { value: "user_entered", label: "User Entered" },
  { value: "listing", label: "Listing" },
  { value: "gis", label: "GIS" },
  { value: "api", label: "API" },
  { value: "ai_inferred", label: "AI Inferred" },
  { value: "verified", label: "Verified" }
];
