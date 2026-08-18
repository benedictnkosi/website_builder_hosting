import { NextResponse } from "next/server";
import { searchDomainAvailability } from "@/lib/domains-co-za";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const tld = searchParams.get("tld")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(
      { success: false, error: "A domain name is required." },
      { status: 400 },
    );
  }

  try {
    const data = await searchDomainAvailability(query, tld || undefined);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not check domain availability.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
