import { NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/resend";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json(
      { success: false, error: "Request body must be valid JSON." },
      400,
    );
  }

  if (!body || typeof body !== "object") {
    return json({ success: false, error: "Invalid request body." }, 400);
  }

  const payload = body as Record<string, unknown>;
  const to = typeof payload.to === "string" ? payload.to : "";
  const name = typeof payload.name === "string" ? payload.name : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const phone = typeof payload.phone === "string" ? payload.phone : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const businessName =
    typeof payload.businessName === "string" ? payload.businessName : "";

  try {
    await sendContactEmail({
      to,
      name,
      email,
      phone,
      message,
      businessName,
    });
    return json({ success: true });
  } catch (error) {
    if (error instanceof GeneratorError) {
      return json({ success: false, error: error.message }, error.statusCode);
    }

    return json(
      { success: false, error: "Could not send the message. Please try again." },
      500,
    );
  }
}
