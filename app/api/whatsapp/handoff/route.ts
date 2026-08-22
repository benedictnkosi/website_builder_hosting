import { NextResponse } from "next/server";
import { readWhatsAppHandoff } from "@/lib/whatsapp-conversation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const handoff = await readWhatsAppHandoff(token);
  if (!handoff) {
    return NextResponse.json({ success: false, error: "This WhatsApp builder link is invalid or expired." }, { status: 404 });
  }
  return NextResponse.json({ success: true, ...handoff }, {
    headers: { "Cache-Control": "no-store" },
  });
}
