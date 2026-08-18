import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { createGenerateJob, jobJsonHeaders, scheduleJobTick, toJobView } from "@/lib/jobs";
import { getPeopleEthnicityOption } from "@/lib/people-ethnicity";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { assertGenerateTokens, jsonTokenError } from "@/lib/tokens";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser(request);
    consumeRateLimit(`generate:${clientKey(request, user.uid)}`, 8, 60 * 60 * 1000);
    await assertGenerateTokens(user);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    const tokenResponse = jsonTokenError(error);
    if (tokenResponse) return tokenResponse;
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Sign in to generate a website." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const prompt =
    typeof body === "object" &&
    body !== null &&
    "prompt" in body &&
    typeof body.prompt === "string"
      ? body.prompt
      : null;

  const peopleEthnicity =
    typeof body === "object" &&
    body !== null &&
    "peopleEthnicity" in body &&
    typeof body.peopleEthnicity === "string"
      ? body.peopleEthnicity.trim()
      : "";

  const businessName =
    typeof body === "object" &&
    body !== null &&
    "businessName" in body &&
    typeof body.businessName === "string"
      ? body.businessName.trim()
      : "";

  const contactEmail =
    typeof body === "object" &&
    body !== null &&
    "contactEmail" in body &&
    typeof body.contactEmail === "string"
      ? body.contactEmail.trim()
      : "";

  if (!prompt) {
    return NextResponse.json(
      { success: false, error: "A prompt string is required." },
      { status: 400 },
    );
  }

  if (peopleEthnicity && !getPeopleEthnicityOption(peopleEthnicity)) {
    return NextResponse.json(
      { success: false, error: "An invalid people ethnicity option was provided." },
      { status: 400 },
    );
  }

  try {
    const job = await createGenerateJob(user, {
      prompt,
      peopleEthnicity: peopleEthnicity || undefined,
      businessName: businessName || undefined,
      contactEmail: contactEmail || undefined,
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
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while starting website generation.";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
