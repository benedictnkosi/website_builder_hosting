import { escapeHtml, isValidEmail } from "./email";
import { GeneratorError } from "./validation";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Website Contact <onboarding@resend.dev>";

export function getResendApiKey(): string {
  const apiKey =
    process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new GeneratorError(
      "NEXT_PUBLIC_RESEND_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }

  return apiKey;
}

export type ContactEmailInput = {
  to: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  businessName?: string;
};

export async function sendContactEmail(input: ContactEmailInput): Promise<void> {
  const to = input.to.trim();
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone?.trim() ?? "";
  const message = input.message.trim();
  const businessName = input.businessName?.trim() || "your website";

  if (!isValidEmail(to) || !isValidEmail(email)) {
    throw new GeneratorError("A valid recipient and sender email are required.", 400);
  }

  if (!name || !message) {
    throw new GeneratorError("Name and message are required.", 400);
  }

  if (message.length > 5000) {
    throw new GeneratorError("Message is too long.", 400);
  }

  const apiKey = getResendApiKey();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");
  const safeBusiness = escapeHtml(businessName);

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
        to: [to],
        reply_to: email,
        subject: `New message from ${name} via ${businessName}`,
        html: `<p>You received a new message from the contact form on <strong>${safeBusiness}</strong>.</p>
<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
${phone ? `<p><strong>Phone:</strong> ${safePhone}</p>` : ""}
<p><strong>Message:</strong></p>
<p>${safeMessage}</p>`,
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
