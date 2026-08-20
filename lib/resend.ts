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

async function sendResendEmail(input: {
  to: string;
  replyTo: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = getResendApiKey();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;

  let response: Response;

  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        reply_to: input.replyTo,
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(20_000),
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
