import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  calculateDriveTime,
  calculateDriveTimeRequestSchema
} from "@/lib/commute/drive-time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = calculateDriveTimeRequestSchema.parse(await request.json());
    const result = await calculateDriveTime(payload);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Unable to calculate drive time.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
