import "server-only";

import { escapeHtml, isValidEmail } from "@/lib/email";
import { getSupportInbox } from "@/lib/resend";
import { GeneratorError } from "@/lib/validation";
import type { WhatsAppLead } from "./types";
import { MANAGED_WEBSITE_OFFER } from "./config";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Website Contact <hello@lulaweb.co.za>";

export async function sendWhatsAppLeadEmail(lead: WhatsAppLead): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing — skipping WhatsApp lead email.");
    return;
  }

  const to = getSupportInbox();
  if (!isValidEmail(to)) {
    throw new GeneratorError("SUPPORT_EMAIL is not a valid inbox address.", 500);
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const f = lead.fields;
  const replyTo =
    f.email && isValidEmail(f.email) ? f.email.trim() : undefined;

  const safe = {
    name: escapeHtml(f.name || lead.contactName || "Unknown"),
    business: escapeHtml(f.businessName || "—"),
    email: escapeHtml(f.email || "—"),
    phone: escapeHtml(f.phone || lead.waId),
    industry: escapeHtml(f.industry || "—"),
    notes: escapeHtml(f.notes || "—").replaceAll("\n", "<br>"),
    waId: escapeHtml(lead.waId),
    status: escapeHtml(lead.status),
  };

  const transcript = lead.messages
    .slice(-12)
    .map((m) => {
      const who = m.role === "user" ? "Customer" : "Bot";
      return `<p><strong>${who}:</strong> ${escapeHtml(m.content).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");

  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `WhatsApp lead (R${MANAGED_WEBSITE_OFFER.priceZar}/yr): ${f.businessName || f.name || lead.waId}`,
      html: `<p>New Facebook advert → WhatsApp lead for the <strong>R${MANAGED_WEBSITE_OFFER.priceZar}/year</strong> ${escapeHtml(MANAGED_WEBSITE_OFFER.label)} (R${MANAGED_WEBSITE_OFFER.depositZar} refundable deposit).</p>
<p><strong>Name:</strong> ${safe.name}</p>
<p><strong>Business:</strong> ${safe.business}</p>
<p><strong>Email:</strong> ${safe.email}</p>
<p><strong>Phone / WhatsApp:</strong> ${safe.phone}</p>
<p><strong>Industry:</strong> ${safe.industry}</p>
<p><strong>Notes:</strong></p>
<p>${safe.notes}</p>
<p><strong>WhatsApp ID:</strong> ${safe.waId}</p>
<p><strong>Status:</strong> ${safe.status}</p>
<hr>
<p><strong>Recent chat</strong></p>
${transcript || "<p>(no messages stored)</p>"}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("WhatsApp lead email failed:", response.status, errorBody);
    throw new GeneratorError("Could not send the WhatsApp lead email.", 502);
  }
}
