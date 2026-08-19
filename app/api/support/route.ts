import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { sendSupportEmail } from "@/lib/resend";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

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

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const payload = body as Record<string, unknown>;
  const honeypot = stringField(payload, "company").trim();

  try {
    consumeRateLimit(`support:${clientKey(request)}`, 5, 10 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
  }

  if (honeypot) {
    return NextResponse.json({ success: true });
  }

  let accountEmail = "";
  try {
    const user = await requireUser(request);
    accountEmail = user.email ?? "";
  } catch {
    // Support is available without signing in.
  }

  try {
    await sendSupportEmail({
      name: stringField(payload, "name"),
      email: stringField(payload, "email"),
      message: stringField(payload, "message"),
      accountEmail,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { success: false, error: "Could not send the message. Please try again." },
      { status: 500 },
    );
  }
}
