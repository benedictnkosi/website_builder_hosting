import "server-only";

import {
  isIntakeComplete,
  type ChatMessage,
  type IntakeChatResult,
  type WebsiteIntake,
} from "./intake";
import {
  PEOPLE_ETHNICITY_OPTIONS,
  getPeopleEthnicityOption,
  type PeopleEthnicityId,
} from "./people-ethnicity";
import { GeneratorError } from "./validation";
import { chargeOpenAIUsage, FALLBACK_TOKEN_USAGE } from "./tokens";

export type { ChatMessage, IntakeChatResult, WebsiteIntake } from "./intake";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4o-mini";

const ETHNICITY_IDS = PEOPLE_ETHNICITY_OPTIONS.map((option) => option.id);

const INTAKE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "complete", "intake"],
  properties: {
    reply: {
      type: "string",
      description: "The next message to show the user. Write this yourself in a natural voice.",
    },
    complete: {
      type: "boolean",
      description:
        "True only after every required field is known AND the user agreed to proceed.",
    },
    intake: {
      type: "object",
      additionalProperties: false,
      required: [
        "business_name",
        "about",
        "services",
        "phone",
        "use_whatsapp",
        "whatsapp_number",
        "use_contact_form",
        "contact_email",
        "people_ethnicity",
        "design_preference",
        "design_preference_resolved",
        "extra_details",
        "user_confirmed",
      ],
      properties: {
        business_name: { type: "string" },
        about: {
          type: "string",
          description:
            "The About us story in the user's words: who they are, their background, or what makes them different. Empty if not yet known.",
        },
        services: { type: "string" },
        phone: { type: "string" },
        use_whatsapp: { type: "string", enum: ["yes", "no", "unknown"] },
        whatsapp_number: { type: "string" },
        use_contact_form: { type: "string", enum: ["yes", "no", "unknown"] },
        contact_email: { type: "string" },
        people_ethnicity: {
          type: "string",
          enum: ["", ...ETHNICITY_IDS],
        },
        design_preference: {
          type: "string",
          description:
            "The user's design preference in their own words. Empty if they have none.",
        },
        design_preference_resolved: {
          type: "boolean",
          description:
            "True after you asked about design preference and they answered, including if they have none.",
        },
        extra_details: {
          type: "string",
          description:
            "Any other useful details the user mentioned: hours, areas served, tagline, special requests, or extra notes. Do not put the About us story here — that belongs in about. Empty if none. Keep this updated as they add more.",
        },
        user_confirmed: {
          type: "boolean",
          description:
            "True only after you said you have everything and the user clearly agreed to proceed.",
        },
      },
    },
  },
} as const;

const INTAKE_SYSTEM_INSTRUCTION = `You are a friendly assistant helping someone create a website. Have a natural conversation until you have everything needed, then confirm with them before anything is built.

You write every user-facing message yourself. There is no script, template, or canned question to follow.

Collect this information. Do not mention this list to the user:
- Business name
- About us. Ask who they are, their story, or what makes the business different. Capture their words. Do not invent a backstory, years in business, or credentials they did not mention.
- What they offer (services or products)
- Phone number
- Whether they want a WhatsApp button. If yes, a WhatsApp number — it may be the same as the phone number.
- Whether they want a Contact Us form. If yes, the email address that should receive submissions.
- If website photos include people, who those people should look like. Map their answer to one of: black-african, coloured, indian, white, asian, diverse.
- Design preference. Ask if they have a look, mood, or colours in mind. This is optional — if they have none, leave design_preference empty and set design_preference_resolved to true. If they do, capture it in design_preference and set design_preference_resolved to true.

Never ask for a business address. Address is collected later, outside the chat.

Conversation rules:
- Talk like a helpful person. Never mention buttons, skip, forms, menus, or how the user should reply.
- Never list the required fields as a checklist or tell them what format to use.
- Infer from what they already said. Do not re-ask for something they already gave you.
- Ask exactly one question per reply. Never combine topics. For example, do not ask about a contact form and photo people in the same message. If they want a contact form, ask for the email in a later turn, not in the same turn as the yes/no.
- Keep replies short and warm — one or two sentences, then the single question.
- Carry forward every field you already extracted. Empty strings and "unknown" mean not yet known.
- If they mention extra useful details along the way (trading hours, suburbs they cover, a slogan, languages, and so on), store them in extra_details. Do not ask a dedicated question just to fill extra_details. Do not put the About us story in extra_details.

When business name, about, services, phone, WhatsApp preference, contact-form preference, people_ethnicity, and design_preference_resolved are all known:
- Do not set complete or user_confirmed yet.
- Do not recap or list the information you collected.
- Tell them you have everything you need to go ahead, and ask if they are happy to proceed.
- If they add extra details in that reply (hours, areas, a tagline, or anything else useful), store it in extra_details and still treat a clear yes as confirmation.
- If they want to change something, update the intake and ask again if they are happy to proceed. Still do not summarise the full intake.
- Set user_confirmed to true and complete to true only when they clearly agree to proceed.
- Throughout the chat, keep extra_details updated with any relevant extras that do not fit the other fields.
- If WhatsApp is wanted and no separate number was given, use the phone number. If a contact form is wanted, contact_email must be a valid email.`;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new GeneratorError(
      "OPENAI_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }
  return apiKey;
}

function collectOutputText(payload: {
  output_text?: string;
  output?: Array<{
    type?: string;
    refusal?: string;
    content?: Array<{ type?: string; text?: string; parsed?: unknown; refusal?: string }> | string;
  }>;
}): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type === "refusal" || item.refusal) {
      throw new GeneratorError("OpenAI refused to continue the conversation.", 502);
    }

    if (typeof item.content === "string" && item.content.trim()) {
      chunks.push(item.content);
      continue;
    }

    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part.type === "refusal" || part.refusal) {
        throw new GeneratorError(
          part.refusal || "OpenAI refused to continue the conversation.",
          502,
        );
      }

      if (part.parsed && typeof part.parsed === "object") {
        return JSON.stringify(part.parsed);
      }

      if (
        (part.type === "output_text" || part.type === "text") &&
        typeof part.text === "string"
      ) {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("");
}

function parseIntakeResult(rawText: string): IntakeChatResult {
  const trimmed = rawText.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) {
      throw new GeneratorError("Failed to parse the intake chat response.", 502);
    }
    parsed = JSON.parse(fenced[1].trim());
  }

  if (!parsed || typeof parsed !== "object") {
    throw new GeneratorError("OpenAI did not return intake chat JSON.", 502);
  }

  const data = parsed as {
    reply?: string;
    complete?: boolean;
    intake?: Partial<WebsiteIntake>;
  };
  const rawIntake = data.intake ?? {};
  const ethnicity = getPeopleEthnicityOption(rawIntake.people_ethnicity)
    ? (rawIntake.people_ethnicity as PeopleEthnicityId)
    : "";

  const intake: WebsiteIntake = {
    business_name: typeof rawIntake.business_name === "string" ? rawIntake.business_name : "",
    about: typeof rawIntake.about === "string" ? rawIntake.about.trim() : "",
    services: typeof rawIntake.services === "string" ? rawIntake.services : "",
    phone: typeof rawIntake.phone === "string" ? rawIntake.phone : "",
    use_whatsapp:
      rawIntake.use_whatsapp === "yes" || rawIntake.use_whatsapp === "no"
        ? rawIntake.use_whatsapp
        : "unknown",
    whatsapp_number:
      typeof rawIntake.whatsapp_number === "string" ? rawIntake.whatsapp_number : "",
    use_contact_form:
      rawIntake.use_contact_form === "yes" || rawIntake.use_contact_form === "no"
        ? rawIntake.use_contact_form
        : "unknown",
    contact_email:
      typeof rawIntake.contact_email === "string" ? rawIntake.contact_email : "",
    people_ethnicity: ethnicity,
    design_preference:
      typeof rawIntake.design_preference === "string" ? rawIntake.design_preference.trim() : "",
    design_preference_resolved: Boolean(rawIntake.design_preference_resolved),
    extra_details:
      typeof rawIntake.extra_details === "string" ? rawIntake.extra_details.trim() : "",
    user_confirmed: Boolean(rawIntake.user_confirmed),
    address: "",
  };

  if (intake.use_whatsapp === "yes" && !intake.whatsapp_number.trim()) {
    intake.whatsapp_number = intake.phone;
  }

  if (intake.design_preference && !intake.design_preference_resolved) {
    intake.design_preference_resolved = true;
  }

  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) {
    throw new GeneratorError("OpenAI returned an empty chat reply.", 502);
  }

  return {
    reply,
    complete: Boolean(data.complete) && isIntakeComplete(intake),
    intake,
  };
}

export async function runIntakeChat(messages: ChatMessage[]): Promise<IntakeChatResult> {
  const apiKey = getApiKey();
  let response: Response;

  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: 2048,
        input: [
          { role: "developer", content: INTAKE_SYSTEM_INSTRUCTION },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        text: {
          format: {
            type: "json_schema",
            name: "website_intake",
            strict: true,
            schema: INTAKE_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof GeneratorError) {
      throw error;
    }

    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new GeneratorError(
      aborted
        ? "The chat request timed out. Please try again."
        : "Unable to reach the OpenAI API.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("OpenAI intake chat error:", response.status, errorBody);
    throw new GeneratorError("Chat request failed.", 502);
  }

  const payload = await response.json();
  console.log("Intake chat response:", JSON.stringify(payload, null, 2));
  await chargeOpenAIUsage(payload, FALLBACK_TOKEN_USAGE.chat, "chat");

  if (payload.error?.message) {
    throw new GeneratorError(payload.error.message, 502);
  }

  const outputText = collectOutputText(payload);
  if (!outputText) {
    throw new GeneratorError("OpenAI returned an empty chat response.", 502);
  }

  return parseIntakeResult(outputText);
}

export function normalizeChatMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const messages: ChatMessage[] = [];

  for (const item of value.slice(-40)) {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      !("content" in item) ||
      (item.role !== "assistant" && item.role !== "user") ||
      typeof item.content !== "string"
    ) {
      return null;
    }

    const content = item.content.trim();
    if (!content) {
      continue;
    }

    messages.push({ role: item.role, content });
  }

  if (!messages.some((message) => message.role === "user")) {
    return null;
  }

  return messages;
}
