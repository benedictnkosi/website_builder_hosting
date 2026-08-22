import "server-only";

type SendTextResult = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number };
};

export type WhatsAppMediaDownload = {
  filename: string;
  mediaType: string;
  data: string;
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

export async function sendWhatsAppActionMenu(to: string): Promise<string | undefined> {
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
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "You already have a website. What would you like to do?" },
          action: { buttons: [
            { type: "reply", reply: { id: "action:update", title: "Update a site" } },
            { type: "reply", reply: { id: "action:new", title: "Create a new site" } },
          ] },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as SendTextResult | null;
  if (!response.ok) throw new Error(`WhatsApp action menu failed (${payload?.error?.code ?? response.status}).`);
  return payload?.messages?.[0]?.id;
}

export async function sendWhatsAppSiteOptions(
  to: string,
  sites: Array<{ id: string; title: string }>,
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
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: "Choose the website you want to update." },
          action: {
            button: "Choose website",
            sections: [{ title: "Your websites", rows: sites.slice(0, 10).map((site) => ({
              id: site.id,
              title: site.title.slice(0, 24),
            })) }],
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as SendTextResult | null;
  if (!response.ok) throw new Error(`WhatsApp site list failed (${payload?.error?.code ?? response.status}).`);
  return payload?.messages?.[0]?.id;
}

export async function downloadWhatsAppMedia(
  mediaId: string,
  filename: string,
): Promise<WhatsAppMediaDownload> {
  const accessToken = required("WHATSAPP_ACCESS_TOKEN");
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  const metadataResponse = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const metadata = (await metadataResponse.json().catch(() => null)) as {
    url?: string;
    mime_type?: string;
  } | null;
  if (!metadataResponse.ok || !metadata?.url) {
    throw new Error("Could not retrieve the WhatsApp upload.");
  }
  const mediaResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!mediaResponse.ok) throw new Error("Could not download the WhatsApp upload.");
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) {
    throw new Error("The WhatsApp upload must be between 1 byte and 4 MB.");
  }
  return {
    filename: filename || "whatsapp-upload",
    mediaType: metadata.mime_type?.trim().toLowerCase() || "application/octet-stream",
    data: bytes.toString("base64"),
  };
}
