import { NextResponse } from "next/server";
import { jsonAuthError, requireUser } from "@/lib/auth-server";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { normalizeChatMessages, runIntakeChat } from "@/lib/intake-chat";
import { assertChatTokens, InsufficientTokensError, runWithTokenSpend } from "@/lib/tokens";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser(request);
    consumeRateLimit(`chat:${clientKey(request, user.uid)}`, 40, 10 * 60 * 1000);
    await assertChatTokens(user);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) return limited;
    if (error instanceof InsufficientTokensError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          chatTokensExhausted: true,
          tokenBalance: error.tokenBalance,
        },
        { status: 402 },
      );
    }
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

  const messages =
    typeof body === "object" && body !== null && "messages" in body
      ? normalizeChatMessages(body.messages)
      : null;

  if (!messages) {
    return NextResponse.json(
      { success: false, error: "A messages array with at least one user message is required." },
      { status: 400 },
    );
  }

  try {
    const result = await runWithTokenSpend(user.uid, () => runIntakeChat(messages), "chat");
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
