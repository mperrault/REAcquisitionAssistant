import type { PropertyRecord } from "@/lib/properties/types";

export type ResaleCompItem = {
  id: string;
  address: string;
  salePrice: number | null;
  sqft: number | null;
  distanceMiles: number | null;
  confidence: string;
  notes: string;
  firstIndex: number;
};

export type ResaleCompSummary = {
  comps: ResaleCompItem[];
  usableComps: ResaleCompItem[];
  medianPricePerSqft: number | null;
  averagePricePerSqft: number | null;
  suggestedResaleValue: number | null;
};

const resaleCompFactPattern =
  /^resale\.comp\.([^.]+)\.(address|sale_price|sqft|distance_miles|confidence|notes)$/;

function numericFactValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringFactValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint] ?? null;
  }

  const lower = sorted[midpoint - 1];
  const upper = sorted[midpoint];

  return lower !== undefined && upper !== undefined ? (lower + upper) / 2 : null;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundCurrency(value: number) {
  return Math.round(value);
}

export function getResaleCompPricePerSqft(comp: ResaleCompItem) {
  if (comp.salePrice === null || comp.sqft === null || comp.sqft <= 0) {
    return null;
  }

  return Math.round(comp.salePrice / comp.sqft);
}

export function getResaleCompSummary(
  property: PropertyRecord
): ResaleCompSummary {
  const compMap = new Map<string, ResaleCompItem>();

  property.facts.forEach((fact, index) => {
    const match = fact.factKey.match(resaleCompFactPattern);

    if (!match) {
      return;
    }

    const [, id, field] = match;

    if (!id || !field) {
      return;
    }

    const existing = compMap.get(id) ?? {
      id,
      address: "",
      salePrice: null,
      sqft: null,
      distanceMiles: null,
      confidence: "",
      notes: "",
      firstIndex: index
    };

    if (field === "address") {
      existing.address = stringFactValue(fact.value);
    } else if (field === "sale_price") {
      existing.salePrice = numericFactValue(fact.value);
    } else if (field === "sqft") {
      existing.sqft = numericFactValue(fact.value);
    } else if (field === "distance_miles") {
      existing.distanceMiles = numericFactValue(fact.value);
    } else if (field === "confidence") {
      existing.confidence = stringFactValue(fact.value);
    } else if (field === "notes") {
      existing.notes = stringFactValue(fact.value);
    }

    compMap.set(id, existing);
  });

  const comps = [...compMap.values()].sort((a, b) => a.firstIndex - b.firstIndex);
  const usableComps = comps.filter(
    (comp) => getResaleCompPricePerSqft(comp) !== null
  );
  const pricePerSqftValues = usableComps.flatMap((comp) => {
    const value = getResaleCompPricePerSqft(comp);

    return value === null ? [] : [value];
  });
  const medianPricePerSqft = getMedian(pricePerSqftValues);
  const averagePricePerSqft = getAverage(pricePerSqftValues);
  const suggestedResaleValue =
    medianPricePerSqft !== null &&
    property.livingSqft !== null &&
    property.livingSqft > 0
      ? roundCurrency(medianPricePerSqft * property.livingSqft)
      : null;

  return {
    comps,
    usableComps,
    medianPricePerSqft:
      medianPricePerSqft === null ? null : Math.round(medianPricePerSqft),
    averagePricePerSqft:
      averagePricePerSqft === null ? null : Math.round(averagePricePerSqft),
    suggestedResaleValue
  };
}
