import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  type BrowserCaptureRecord,
  browserCaptureListResponseSchema,
  browserCapturePostResponseSchema,
  createBrowserCaptureRecord
} from "@/lib/properties/browser-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let captureStore: BrowserCaptureRecord[] = [];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
  "Cache-Control": "no-store"
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function GET() {
  return NextResponse.json(
    browserCaptureListResponseSchema.parse({ captures: captureStore }),
    { headers: corsHeaders }
  );
}

export async function POST(request: Request) {
  try {
    const capture = createBrowserCaptureRecord(await request.json());

    captureStore = [
      capture,
      ...captureStore.filter((item) => item.pageUrl !== capture.pageUrl)
    ].slice(0, 50);

    return NextResponse.json(
      browserCapturePostResponseSchema.parse({ capture }),
      { headers: corsHeaders }
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Unable to save browser capture.";

    return NextResponse.json(
      { error: message },
      { status: 400, headers: corsHeaders }
    );
  }
}

export async function DELETE() {
  captureStore = [];

  return NextResponse.json({ captures: [] }, { headers: corsHeaders });
}
