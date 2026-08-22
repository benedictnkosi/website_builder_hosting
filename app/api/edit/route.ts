import { NextResponse } from "next/server";
import { isGuestUser, jsonAuthError, type AuthUser } from "@/lib/auth-server";
import {
  convertEditUploadToWebp,
  parseEditImageUpload,
} from "@/lib/edit-image-upload";
import { createEditJob, jobJsonHeaders, scheduleJobTick, toJobView } from "@/lib/jobs";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { requireOwnedActor } from "@/lib/sites";
import { assertEditEdits, jsonEditError } from "@/lib/edits";
import { GeneratorError, isValidWebsiteId } from "@/lib/validation";
import { runWithMockAiFromRequest } from "@/lib/mock-ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return runWithMockAiFromRequest(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const websiteId =
    typeof payload?.websiteId === "string" ? payload.websiteId : null;
  const rawInstruction =
    typeof payload?.instruction === "string" ? payload.instruction.trim() : "";
  const hasImage = payload?.image != null;

  if (!websiteId || !isValidWebsiteId(websiteId) || (!rawInstruction && !hasImage)) {
    return NextResponse.json(
      { success: false, error: "websiteId and instruction are required." },
      { status: 400 },
    );
  }

  let user: AuthUser;
  try {
    ({ user } = await requireOwnedActor(request, websiteId));
    consumeRateLimit(`edit:${clientKey(request, user.uid)}`, 20, 60 * 60 * 1000);
    if (!isGuestUser(user)) {
      await assertEditEdits(user);
    }
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const editResponse = jsonEditError(error);
    if (editResponse) return editResponse;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  let uploadedImage: { content: string; filename: string } | undefined;
  try {
    if (hasImage) {
      consumeRateLimit(`edit-upload:${clientKey(request, user.uid)}`, 8, 60 * 60 * 1000);
      const parsed = parseEditImageUpload(payload?.image);
      uploadedImage = {
        content: await convertEditUploadToWebp(parsed),
        filename: parsed.filename,
      };
    }
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not read that photo." },
      { status: 400 },
    );
  }

  const instruction =
    rawInstruction || "Replace a website photo with my uploaded image.";

  try {
    const job = await createEditJob(user, {
      websiteId,
      instruction,
      uploadedImage,
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
