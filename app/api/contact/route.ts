import { NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/resend";
import { readWebsiteMeta } from "@/lib/sites";
import { readSubscription } from "@/lib/subscription";
import { clientKey, consumeRateLimit, jsonRateLimitError } from "@/lib/rate-limit";
import { GeneratorError, isValidWebsiteId } from "@/lib/validation";

export const runtime = "nodejs";

function appOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

function originHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function isBrowserOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === "http:") {
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function isAllowedOrigin(
  origin: string,
  websiteId: string,
  request: Request,
): Promise<boolean> {
  if (!isBrowserOrigin(origin)) return false;
  if (originHost(origin) === originHost(appOrigin(request))) return true;

  const subscription = await readSubscription(websiteId);
  const domain = subscription?.domain?.toLowerCase().replace(/^www\./, "");
  return Boolean(domain && originHost(origin) === domain);
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !isBrowserOrigin(origin)) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const payload = body as Record<string, unknown>;
  const websiteId = typeof payload.websiteId === "string" ? payload.websiteId.trim() : "";
  const name = typeof payload.name === "string" ? payload.name : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const phone = typeof payload.phone === "string" ? payload.phone : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const businessName =
    typeof payload.businessName === "string" ? payload.businessName : "";

  if (!websiteId || !isValidWebsiteId(websiteId)) {
    return NextResponse.json(
      { success: false, error: "A valid websiteId is required." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  try {
    consumeRateLimit(`contact:${clientKey(request)}:${websiteId}`, 8, 10 * 60 * 1000);
  } catch (error) {
    const limited = jsonRateLimitError(error);
    if (limited) {
      const response = limited;
      Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }
  }

  if (origin && !(await isAllowedOrigin(origin, websiteId, request))) {
    return NextResponse.json(
      { success: false, error: "This origin is not allowed to send mail for that site." },
      { status: 403, headers: corsHeaders(null) },
    );
  }

  const meta = await readWebsiteMeta(websiteId);
  const subscription = await readSubscription(websiteId);
  const to = meta?.contactEmail || subscription?.email || "";

  if (!to) {
    return NextResponse.json(
      { success: false, error: "This website has no contact recipient configured." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  try {
    await sendContactEmail({
      to,
      name,
      email,
      phone,
      message,
      businessName: businessName || meta?.businessName,
    });
    return NextResponse.json(
      { success: true },
      { headers: corsHeaders(origin) },
    );
  } catch (error) {
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode, headers: corsHeaders(origin) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Could not send the message. Please try again." },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
