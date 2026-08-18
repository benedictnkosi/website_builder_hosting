import { NextResponse } from "next/server";
import { jsonAuthError, type AuthUser } from "@/lib/auth-server";
import { createEditJob, jobJsonHeaders, scheduleJobTick, toJobView } from "@/lib/jobs";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { requireOwnedSite } from "@/lib/sites";
import { hasActiveSubscription } from "@/lib/subscription";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const websiteId =
    typeof body === "object" && body !== null && "websiteId" in body && typeof body.websiteId === "string"
      ? body.websiteId
      : null;
  const instruction =
    typeof body === "object" && body !== null && "instruction" in body && typeof body.instruction === "string"
      ? body.instruction
      : null;

  if (!websiteId || !isValidWebsiteId(websiteId) || !instruction) {
    return NextResponse.json(
      { success: false, error: "websiteId and instruction are required." },
      { status: 400 },
    );
  }

  let user: AuthUser;
  try {
    ({ user } = await requireOwnedSite(request, websiteId));
    consumeRateLimit(`edit:${clientKey(request, user.uid)}`, 20, 60 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  if (!(await hasActiveSubscription(websiteId))) {
    return NextResponse.json(
      {
        success: false,
        error: "Subscribe to make changes to your website.",
        paywall: true,
      },
      { status: 402 },
    );
  }

  try {
    const job = await createEditJob(user, {
      websiteId,
      instruction: instruction.trim(),
    });
    scheduleJobTick(user, job.jobId);
    return NextResponse.json(
      {
        success: true,
        jobId: job.jobId,
        job: toJobView(job),
      },
      { headers: jobJsonHeaders() },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start the edit. Please try again.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
