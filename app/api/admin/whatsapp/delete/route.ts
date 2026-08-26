import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { deleteWhatsAppChat } from "@/lib/whatsapp/chats";
import { deleteWhatsAppLead } from "@/lib/whatsapp/leads";
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
    await Promise.all([
      deleteWhatsAppChat(phone),
      deleteWhatsAppLead(phone),
    ]);
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete WhatsApp chat.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
