import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  enrichListingCandidate,
  listingCandidateEnrichmentRequestSchema
} from "@/lib/listing-alerts/listing-enrichment";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof ZodError
    ? error.issues.map((issue) => issue.message).join("; ")
    : error instanceof Error
      ? error.message
      : "Unable to enrich listing candidate.";
}

function wantsStream(request: Request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("stream") === "1" ||
    request.headers.get("accept")?.includes("application/x-ndjson")
  );
}

export async function POST(request: Request) {
  try {
    const payload = listingCandidateEnrichmentRequestSchema.parse(
      await request.json()
    );

    if (wantsStream(request)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          function send(event: unknown) {
            controller.enqueue(
              encoder.encode(`${JSON.stringify(event)}\n`)
            );
          }

          try {
            const result = await enrichListingCandidate(payload.candidate, fetch, {
              signal: request.signal,
              onDiagnostic(diagnostic) {
                send({ type: "diagnostic", diagnostic });
              }
            });

            send({ type: "result", result });
          } catch (error) {
            send({ type: "error", error: getErrorMessage(error) });
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    const result = await enrichListingCandidate(payload.candidate);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
