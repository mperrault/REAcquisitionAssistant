import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  enrichListingCandidate,
  listingCandidateEnrichmentRequestSchema
} from "@/lib/listing-alerts/listing-enrichment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = listingCandidateEnrichmentRequestSchema.parse(
      await request.json()
    );
    const result = await enrichListingCandidate(payload.candidate);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Unable to enrich listing candidate.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
