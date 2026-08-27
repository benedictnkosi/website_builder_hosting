import { escapeHtml, isValidEmail } from "./email";
import { GeneratorError } from "./validation";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Website Contact <hello@lulaweb.co.za>";
const DEFAULT_SUPPORT_INBOX = "nkosi.benedict@gmail.com";

export function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new GeneratorError(
      "RESEND_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }

  return apiKey;
}

export function getSupportInbox(): string {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_INBOX;
}

export type ContactEmailInput = {
  to: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  businessName?: string;
};

export type SupportEmailInput = {
  name: string;
  email: string;
  message: string;
  accountEmail?: string;
};

export type ResendAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

async function sendResendEmail(input: {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
}): Promise<void> {
  const apiKey = getResendApiKey();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;

  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };

  if (input.replyTo) {
    payload.reply_to = input.replyTo;
  }
  if (input.text) {
    payload.text = input.text;
  }
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      ...(attachment.contentType
        ? { content_type: attachment.contentType }
        : {}),
    }));
  }

  let response: Response;

  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new GeneratorError(
      aborted
        ? "The email service timed out. Please try again."
        : "Unable to reach the email service.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    const messageText =
      errorBody?.error?.message ||
      errorBody?.message ||
      `Email service failed with status ${response.status}.`;
    console.error("Resend error response:", response.status, errorBody);
    throw new GeneratorError(messageText, response.status === 401 ? 500 : 502);
  }
}

const MAX_ADMIN_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AdminEmailInput = {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  attachment?: ResendAttachment;
};

export async function sendAdminEmail(input: AdminEmailInput): Promise<void> {
  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const replyTo = input.replyTo?.trim() || undefined;

  if (!isValidEmail(to)) {
    throw new GeneratorError("A valid recipient email is required.", 400);
  }
  if (replyTo && !isValidEmail(replyTo)) {
    throw new GeneratorError("Reply-to email is not valid.", 400);
  }
  if (!subject) {
    throw new GeneratorError("Subject is required.", 400);
  }
  if (subject.length > 200) {
    throw new GeneratorError("Subject is too long (max 200 characters).", 400);
  }
  if (!body) {
    throw new GeneratorError("Body is required.", 400);
  }
  if (body.length > 50_000) {
    throw new GeneratorError("Body is too long (max 50,000 characters).", 400);
  }

  let attachments: ResendAttachment[] | undefined;
  if (input.attachment) {
    const filename = input.attachment.filename.trim();
    const content = input.attachment.content.trim();
    if (!filename) {
      throw new GeneratorError("Attachment filename is required.", 400);
    }
    if (filename.length > 200 || /[/\\]/.test(filename)) {
      throw new GeneratorError("Attachment filename is invalid.", 400);
    }
    if (!content) {
      throw new GeneratorError("Attachment content is required.", 400);
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(content)) {
      throw new GeneratorError("Attachment must be base64-encoded.", 400);
    }
    const approxBytes = Math.floor((content.replace(/\s/g, "").length * 3) / 4);
    if (approxBytes > MAX_ADMIN_ATTACHMENT_BYTES) {
      throw new GeneratorError(
        "Attachment is too large (max 10 MB).",
        400,
      );
    }
    attachments = [
      {
        filename,
        content: content.replace(/\s/g, ""),
        contentType: input.attachment.contentType?.trim() || undefined,
      },
    ];
  }

  const safeHtml = escapeHtml(body).replaceAll("\n", "<br>");

  await sendResendEmail({
    to,
    replyTo,
    subject,
    text: body,
    html: `<p>${safeHtml}</p>`,
    attachments,
  });
}

function assertContactFields(name: string, email: string, message: string, to: string) {
  if (!isValidEmail(to) || !isValidEmail(email)) {
    throw new GeneratorError("A valid recipient and sender email are required.", 400);
  }

  if (!name || !message) {
    throw new GeneratorError("Name and message are required.", 400);
  }

  if (name.length > 120) {
    throw new GeneratorError("Name is too long.", 400);
  }

  if (message.length > 5000) {
    throw new GeneratorError("Message is too long.", 400);
  }
}

export async function sendContactEmail(input: ContactEmailInput): Promise<void> {
  const to = input.to.trim();
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone?.trim() ?? "";
  const message = input.message.trim();
  const businessName = input.businessName?.trim() || "your website";

  assertContactFields(name, email, message, to);

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");
  const safeBusiness = escapeHtml(businessName);

  await sendResendEmail({
    to,
    replyTo: email,
    subject: `New message from ${name} via ${businessName}`,
    html: `<p>You received a new message from the contact form on <strong>${safeBusiness}</strong>.</p>
<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
${phone ? `<p><strong>Phone:</strong> ${safePhone}</p>` : ""}
<p><strong>Message:</strong></p>
<p>${safeMessage}</p>`,
  });
}

export async function sendSupportEmail(input: SupportEmailInput): Promise<void> {
  const to = getSupportInbox();
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  const accountEmail = input.accountEmail?.trim() ?? "";

  assertContactFields(name, email, message, to);

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeAccount = escapeHtml(accountEmail);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");

  await sendResendEmail({
    to,
    replyTo: email,
    subject: `Lulaweb support: ${name}`,
    html: `<p>You received a new message from the Lulaweb customer support form.</p>
<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
${accountEmail && accountEmail !== email ? `<p><strong>Signed-in account:</strong> ${safeAccount}</p>` : ""}
<p><strong>Message:</strong></p>
<p>${safeMessage}</p>`,
  });
}
