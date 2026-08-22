import "server-only";

type SendTextResult = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number };
};

function required(name: "WHATSAPP_ACCESS_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function sendWhatsAppText(to: string, text: string): Promise<string | undefined> {
  const accessToken = required("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body: text.slice(0, 4096) },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as SendTextResult | null;
  if (!response.ok) {
    throw new Error(
      `WhatsApp send failed (${payload?.error?.code ?? response.status}): ${payload?.error?.message ?? "Unknown error"}`,
    );
  }
  return payload?.messages?.[0]?.id;
}
