import { NextResponse } from "next/server";
import { jsonAuthError, requireActor, guestUserFromId, readGuestId } from "@/lib/auth-server";
import { jobJsonHeaders, readJob, scheduleJobTick, tickJob, toJobView } from "@/lib/jobs";
import { isValidWebsiteId } from "@/lib/validation";
import { runWithMockAiFromRequest } from "@/lib/mock-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return runWithMockAiFromRequest(request, () => handleGet(request, params));
}

async function handleGet(
  request: Request,
  params: Promise<{ jobId: string }>,
) {
  const { jobId } = await params;

  if (!jobId || !isValidWebsiteId(jobId)) {
    return NextResponse.json(
      { success: false, error: "A valid jobId is required." },
      { status: 400 },
    );
  }

  try {
    let user = await requireActor(request);
    let existing = await readJob(user, jobId);
    if (!existing) {
      const guest = guestUserFromId(readGuestId(request));
      if (guest && guest.uid !== user.uid) {
        existing = await readJob(guest, jobId);
        if (existing) user = guest;
      }
    }
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Job not found." },
        { status: 404, headers: jobJsonHeaders() },
      );
    }

    let job = (await tickJob(user, jobId, { allowSlow: false })) ?? existing;
    scheduleJobTick(user, jobId);

    if (job.status === "queued" || job.step === "queued") {
      job = (await tickJob(user, jobId, { allowSlow: true })) ?? job;
    }

    return NextResponse.json(
      { success: true, job: toJobView(job) },
      { headers: jobJsonHeaders() },
    );
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    const message =
      error instanceof Error ? error.message : "Could not load this job.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
