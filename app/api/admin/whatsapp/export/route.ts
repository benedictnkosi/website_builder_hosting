import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { listAllWhatsAppChats } from "@/lib/whatsapp/chats";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
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

  try {
    const chats = await listAllWhatsAppChats();
    const exportedAt = new Date().toISOString();
    const payload = {
      exportedAt,
      chatCount: chats.length,
      chats,
    };

    const stamp = exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="whatsapp-chats-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not export WhatsApp chats.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
