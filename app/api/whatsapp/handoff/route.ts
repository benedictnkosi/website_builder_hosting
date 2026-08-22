import { NextResponse } from "next/server";
import { linkWhatsAppWebsite, readWhatsAppHandoff } from "@/lib/whatsapp-conversation";

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const token = typeof data.token === "string" ? data.token.trim() : "";
  const websiteId = typeof data.websiteId === "string" ? data.websiteId.trim() : "";
  const businessName = typeof data.businessName === "string" ? data.businessName.trim() : "";
  const linked = await linkWhatsAppWebsite(token, websiteId, businessName);
  if (!linked) {
    return NextResponse.json({ success: false, error: "The WhatsApp link is invalid or expired." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
