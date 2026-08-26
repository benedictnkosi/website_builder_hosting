import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { markWhatsAppChatRead } from "@/lib/whatsapp/chats";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/payments";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  let body: { phone?: unknown };
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
  if (!phone) {
    return NextResponse.json(
      { success: false, error: "A customer phone number is required." },
      { status: 400 },
    );
  }

  try {
    const chat = await markWhatsAppChatRead(phone);
    if (!chat) {
      return NextResponse.json(
        { success: false, error: "Chat not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      phone,
      adminReadAt: chat.adminReadAt ?? null,
      unread: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not mark chat as read.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
