import { NextResponse } from "next/server";
import { jsonAuthError, requireActor, guestUserFromId, readGuestId } from "@/lib/auth-server";
import { cancelJob, jobJsonHeaders, toJobView } from "@/lib/jobs";
import { isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
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
    let job = await cancelJob(user, jobId);
    if (!job) {
      const guest = guestUserFromId(readGuestId(request));
      if (guest && guest.uid !== user.uid) {
        job = await cancelJob(guest, jobId);
      }
    }
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found." },
        { status: 404, headers: jobJsonHeaders() },
      );
    }

    return NextResponse.json(
      { success: true, job: toJobView(job) },
      { headers: jobJsonHeaders() },
    );
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    const message =
      error instanceof Error ? error.message : "Could not cancel this job.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
