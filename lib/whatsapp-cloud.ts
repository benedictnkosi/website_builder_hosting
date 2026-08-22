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

export async function sendWhatsAppAddressOptions(
  to: string,
  options: Array<{ id: string; title: string; description?: string }>,
): Promise<string | undefined> {
  const accessToken = required("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "Choose your address" },
          body: { text: "Select the correct Google address below." },
          action: {
            button: "View addresses",
            sections: [{
              title: "Google Places results",
              rows: options.slice(0, 10).map((option) => ({
                id: option.id.slice(0, 200),
                title: option.title.slice(0, 24),
                description: option.description?.slice(0, 72),
              })),
            }],
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as SendTextResult | null;
  if (!response.ok) {
    throw new Error(`WhatsApp address list failed (${payload?.error?.code ?? response.status}).`);
  }
  return payload?.messages?.[0]?.id;
}
