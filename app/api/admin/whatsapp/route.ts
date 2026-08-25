import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { listRecentWhatsAppChats } from "@/lib/whatsapp/chats";
import { listWhatsAppPayments } from "@/lib/whatsapp/payments";

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

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") || "7");
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, daysRaw)) : 7;

  try {
    const [chats, payments] = await Promise.all([
      listRecentWhatsAppChats(days),
      listWhatsAppPayments({ status: "all", days }),
    ]);

    return NextResponse.json({
      success: true,
      days,
      chats,
      payments,
      chatCount: chats.length,
      paymentCount: payments.filter((p) => p.status === "complete").length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load WhatsApp admin data.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
