import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { jsonAuthError } from "@/lib/auth-server";
import { sendAdminEmail } from "@/lib/resend";
import { GeneratorError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (error) {
    const authResponse = jsonAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const payload = body as Record<string, unknown>;
  const to = stringField(payload, "to").trim();
  const subject = stringField(payload, "subject").trim();
  const message = stringField(payload, "body").trim();
  const replyTo =
    stringField(payload, "replyTo").trim() || admin.email?.trim() || undefined;

  let attachment:
    | { filename: string; content: string; contentType?: string }
    | undefined;

  const rawAttachment = payload.attachment;
  if (rawAttachment && typeof rawAttachment === "object") {
    const file = rawAttachment as Record<string, unknown>;
    const filename =
      typeof file.filename === "string" ? file.filename.trim() : "";
    const content =
      typeof file.content === "string" ? file.content.trim() : "";
    const contentType =
      typeof file.contentType === "string"
        ? file.contentType.trim()
        : undefined;
    if (filename || content) {
      attachment = { filename, content, contentType };
    }
  }

  try {
    await sendAdminEmail({
      to,
      subject,
      body: message,
      replyTo,
      attachment,
    });
    return NextResponse.json({ success: true, to, subject });
  } catch (error) {
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const messageText =
      error instanceof Error ? error.message : "Could not send email.";
    return NextResponse.json(
      { success: false, error: messageText },
      { status: 502 },
    );
  }
}
