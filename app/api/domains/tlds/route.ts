import { NextResponse } from "next/server";
import { listSearchableTlds } from "@/lib/domains-co-za";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tlds = await listSearchableTlds();
    return NextResponse.json({
      success: true,
      tlds: tlds.map((item) => item.tld),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load domain extensions.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
