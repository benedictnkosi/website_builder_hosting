import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { WhatsAppApiError, sendWhatsAppText } from "@/lib/whatsapp/client";
import {
  recordWhatsAppChatTurn,
  setWhatsAppHumanTakeover,
} from "@/lib/whatsapp/chats";
import {
  getOrCreateWhatsAppLead,
  saveWhatsAppLead,
} from "@/lib/whatsapp/leads";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/payments";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  let body: { phone?: unknown; message?: unknown; pauseAi?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const phone = normalizeWhatsAppPhone(
    typeof body.phone === "string" ? body.phone : "",
  );
  const message =
    typeof body.message === "string" ? body.message.trim() : "";
  const pauseAi = body.pauseAi !== false;

  if (!phone) {
    return NextResponse.json(
      { success: false, error: "A customer phone number is required." },
      { status: 400 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { success: false, error: "A message is required." },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { success: false, error: "Message is too long (max 4000 characters)." },
      { status: 400 },
    );
  }

  try {
    await sendWhatsAppText({ to: phone, body: message });

    const at = new Date().toISOString();
    const lead = await getOrCreateWhatsAppLead({ waId: phone });
    lead.messages = [
      ...lead.messages,
      { role: "assistant", content: message, at, source: "human" },
    ];
    await saveWhatsAppLead(lead);

    await recordWhatsAppChatTurn({
      phone,
      assistantText: message,
      contactName: lead.contactName || lead.fields.name,
      at,
      source: "human",
    });

    let chat = null;
    if (pauseAi) {
      chat = await setWhatsAppHumanTakeover({ phone, humanTakeover: true });
    }

    return NextResponse.json({
      success: true,
      phone,
      at,
      message: {
        role: "assistant" as const,
        content: message,
        at,
        source: "human" as const,
      },
      humanTakeover: chat?.humanTakeover ?? pauseAi,
    });
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 },
      );
    }
    const messageText =
      error instanceof Error ? error.message : "Could not send WhatsApp reply.";
    return NextResponse.json({ success: false, error: messageText }, { status: 502 });
  }
}
