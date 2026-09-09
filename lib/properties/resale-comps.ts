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

export type ParsedResaleCompRow = {
  address: string;
  salePrice: number | null;
  sqft: number | null;
  distanceMiles: number | null;
  confidence: string;
  notes: string;
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

function parseNullableNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/[$,\s]/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function splitDelimitedLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : line.includes("|") ? "|" : ",";
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const character of line) {
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());

  return values;
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

export function parseResaleCompRows(text: string): ParsedResaleCompRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitDelimitedLine)
    .filter((parts) => {
      const first = parts[0]?.toLowerCase() ?? "";

      return first !== "address" && first !== "comp address";
    })
    .map((parts) => {
      const confidenceCandidate = parts[4]?.trim().toLowerCase() ?? "";
      const hasConfidenceColumn = ["low", "medium", "high"].includes(
        confidenceCandidate
      );

      return {
        address: parts[0] ?? "",
        salePrice: parseNullableNumber(parts[1]),
        sqft: parseNullableNumber(parts[2]),
        distanceMiles: parseNullableNumber(parts[3]),
        confidence: hasConfidenceColumn ? confidenceCandidate : "",
        notes: hasConfidenceColumn ? (parts[5] ?? "") : (parts[4] ?? "")
      };
    })
    .filter(
      (row) =>
        row.address ||
        row.salePrice !== null ||
        row.sqft !== null ||
        row.distanceMiles !== null ||
        row.notes
    );
}
