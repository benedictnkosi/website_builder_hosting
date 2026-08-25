import { NextResponse } from "next/server";
import { isWhatsAppConfigured } from "@/lib/whatsapp/config";
import { handleWhatsAppWebhook } from "@/lib/whatsapp/handler";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import {
  verifyWebhookSubscription,
  verifyWhatsAppSignature,
} from "@/lib/whatsapp/verify";
import { clientKey, consumeRateLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Meta webhook verification (subscribe challenge).
 * Configure callback URL: https://<your-domain>/api/webhooks/whatsapp
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = verifyWebhookSubscription({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });

  if (challenge == null) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Inbound WhatsApp Cloud API events.
 * Validates X-Hub-Signature-256, then runs the sales bot and replies.
 */
export async function POST(request: Request) {
  if (!isWhatsAppConfigured()) {
    console.error("WhatsApp webhook received but env is incomplete.");
    return NextResponse.json({ success: false }, { status: 503 });
  }

  try {
    consumeRateLimit(`whatsapp-webhook:${clientKey(request)}`, 120, 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { success: false },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Acknowledge quickly; process before returning so Vercel does not freeze the isolate.
  try {
    await handleWhatsAppWebhook(payload);
  } catch (error) {
    console.error("WhatsApp webhook handler error:", error);
  }

  return NextResponse.json({ success: true });
}
