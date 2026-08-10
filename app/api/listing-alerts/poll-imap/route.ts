import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { pollImapListingAlerts } from "@/lib/listing-alerts/imap-poller";
import { listingAlertPollRequestSchema } from "@/lib/listing-alerts/polling-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = listingAlertPollRequestSchema.parse(await request.json());
    const result = await pollImapListingAlerts(payload);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Unable to poll IMAP mailbox.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

