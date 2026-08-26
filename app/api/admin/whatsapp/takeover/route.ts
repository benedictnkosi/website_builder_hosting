import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { setWhatsAppHumanTakeover } from "@/lib/whatsapp/chats";
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

  let body: { phone?: unknown; humanTakeover?: unknown };
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
  if (typeof body.humanTakeover !== "boolean") {
    return NextResponse.json(
      { success: false, error: "humanTakeover must be true or false." },
      { status: 400 },
    );
  }

  try {
    const chat = await setWhatsAppHumanTakeover({
      phone,
      humanTakeover: body.humanTakeover,
    });
    return NextResponse.json({
      success: true,
      phone,
      humanTakeover: Boolean(chat?.humanTakeover),
      humanTakeoverAt: chat?.humanTakeoverAt ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not update human takeover.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
