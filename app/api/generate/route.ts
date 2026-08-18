import { NextResponse } from "next/server";
import { generateWebsite } from "@/lib/website-generator";
import { getPeopleEthnicityOption } from "@/lib/people-ethnicity";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const result = await generateWebsite(prompt, peopleEthnicity || undefined);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while generating the website.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
