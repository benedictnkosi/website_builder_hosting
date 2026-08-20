import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { coerceWebsiteIntake, type WebsiteIntake } from "@/lib/intake";
import {
  normalizeChatMessages,
  parseIntakeUpload,
  runIntakeChat,
  runIntakeFromDocument,
  type IntakeUpload,
} from "@/lib/intake-chat";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { GeneratorError } from "@/lib/validation";
import { runWithMockAiFromRequest } from "@/lib/mock-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return runWithMockAiFromRequest(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  let user;
  try {
    user = await requireUser(request);
    consumeRateLimit(`chat:${clientKey(request, user.uid)}`, 40, 10 * 60 * 1000);
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
  const messages = payload ? normalizeChatMessages(payload.messages) : null;

  if (!messages) {
    return NextResponse.json(
      { success: false, error: "A messages array with at least one user message is required." },
      { status: 400 },
    );
  }

  let document: IntakeUpload | undefined;
  let currentIntake: WebsiteIntake | null = null;

  try {
    if (payload?.intake != null && typeof payload.intake === "object") {
      currentIntake = coerceWebsiteIntake(payload.intake);
      currentIntake.address = "";
    }
    if (payload?.document != null) {
      if (currentIntake?.flyer_uploaded) {
        throw new GeneratorError("You can upload one flyer or PDF per website.", 400);
      }
      consumeRateLimit(`chat-upload:${clientKey(request, user.uid)}`, 8, 60 * 60 * 1000);
      document = parseIntakeUpload(payload.document);
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
      { success: false, error: "Could not read that file." },
      { status: 400 },
    );
  }

  try {
    const result = document
      ? await runIntakeFromDocument(messages, document, currentIntake)
      : await runIntakeChat(messages, currentIntake);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Intake chat error:", error);
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not continue the conversation." },
      { status: 502 },
    );
  }
}
