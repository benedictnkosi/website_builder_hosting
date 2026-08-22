import "server-only";

type AddressAssessment = {
  sufficient: boolean;
  query: string;
  reply: string;
};

export async function assessWhatsAppAddress(
  userText: string,
  businessName: string,
): Promise<AddressAssessment> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      instructions: `Decide whether a South African business address has enough location detail for Google Places autocomplete. A street number plus street and town/suburb is sufficient. A named building, shopping centre, landmark, or business plus a town/suburb can also be sufficient. A suburb or city alone is not sufficient. Never invent missing address details. If insufficient, ask exactly one short question for the most useful missing detail. If sufficient, normalize only obvious spacing and return the user's address as the query. The business name is context only: ${businessName || "unknown"}.`,
      input: userText,
      text: {
        format: {
          type: "json_schema",
          name: "address_assessment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sufficient", "query", "reply"],
            properties: {
              sufficient: { type: "boolean" },
              query: { type: "string" },
              reply: { type: "string" },
            },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Address assessment failed.");
  const outputText = payload?.output_text || payload?.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("") || "";
  const parsed = JSON.parse(outputText || "{}") as Partial<AddressAssessment>;
  return {
    sufficient: parsed.sufficient === true,
    query: typeof parsed.query === "string" ? parsed.query.trim() : "",
    reply: typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Please send the street number, street name, and suburb or town.",
  };
}
