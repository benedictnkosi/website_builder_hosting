import "server-only";

import {
  coerceWebsiteIntake,
  emptyWebsiteIntake,
  hasCoreIntakeForWebsite,
  lastUserMessageIsConfirmation,
  mergeWebsiteIntake,
  missingIntakeFields,
  type ChatMessage,
  type IntakeChatResult,
  type WebsiteIntake,
} from "./intake";
import { PEOPLE_ETHNICITY_OPTIONS } from "./people-ethnicity";
import { GeneratorError } from "./validation";
import { isMockAiEnabled, mockDelay } from "./mock-ai";
import { BUILDER_GENERATING_MESSAGE } from "./builder-chat";
import {
  INTAKE_UPLOAD_MAX_BYTES,
  isAllowedIntakeUploadType,
  sanitizeIntakeFilename,
  type IntakeUpload,
} from "./intake-upload";

export type { ChatMessage, IntakeChatResult, WebsiteIntake } from "./intake";
export type { IntakeUpload } from "./intake-upload";

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
        "use_trading_hours",
        "trading_hours",
        "people_ethnicity",
        "design_preference",
        "design_preference_resolved",
        "address",
        "address_resolved",
        "extra_details",
        "user_confirmed",
      ],
      properties: {
        business_name: { type: "string" },
        about: {
          type: "string",
          description:
            "About us copy. From a flyer or PDF, use the visible description, tagline, intro, or who-we-are text. Empty only if neither the document nor the chat describes the business.",
        },
        services: { type: "string" },
        phone: { type: "string" },
        use_whatsapp: { type: "string", enum: ["yes", "no", "unknown"] },
        whatsapp_number: { type: "string" },
        use_contact_form: { type: "string", enum: ["yes", "no", "unknown"] },
        contact_email: { type: "string" },
        use_trading_hours: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "yes if they have trading hours, no if they do not, unknown until asked.",
        },
        trading_hours: {
          type: "string",
          description:
            "The days and times they are open, in their words. Empty if they have no hours or it is not yet known.",
        },
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
        address: {
          type: "string",
          description: "The complete public business address, or empty when the user says there is no public address.",
        },
        address_resolved: {
          type: "boolean",
          description: "True after the user provides a complete address or clearly says the business has no public address.",
        },
        extra_details: {
          type: "string",
          description:
            "Any other useful details the user mentioned: areas served, tagline, special requests, or extra notes. Do not put the About us story or trading hours here. Empty if none. Keep this updated as they add more.",
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
- About us. Capture who they are, their story, or what makes the business different, in their words or from a flyer. Do not invent a backstory, years in business, or credentials they did not mention. If a flyer already described the business, that is the About us — do not ask again.
- What they offer (services or products)
- Phone number
- Whether they want a WhatsApp button. If yes, a WhatsApp number — it may be the same as the phone number.
- Whether they want a Contact Us form. If yes, the email address that should receive submissions.
- Whether they have trading hours. Ask if they have opening hours. If no, set use_trading_hours to no and leave trading_hours empty. If yes, ask for the days and times in a later turn (unless they already gave them) and store that in trading_hours.
- If website photos include people, who those people should look like. Map their answer to one of: black-african, coloured, indian, white, asian, diverse.
- Design preference. Ask if they have a look, mood, or colours in mind. This is optional — if they have none, leave design_preference empty and set design_preference_resolved to true. If they do, capture it in design_preference and set design_preference_resolved to true.
- Public business address. Ask for the full address naturally. Accept a complete address given in one message and preserve it exactly; do not split it into repeated street-number, street-name, and suburb questions. If it appears complete (for example "27 Everest Road, Durban North"), store the whole value and set address_resolved to true. If the user says there is no public address or asks to skip it, leave address empty and set address_resolved to true.

Conversation rules:
- Talk like a helpful person. Never mention buttons, skip, forms, menus, or how the user should reply.
- Never list the required fields as a checklist or tell them what format to use.
- Infer from what they already said. Do not re-ask for something they already gave you.
- If they uploaded a flyer, business card, or PDF, treat facts already in the intake as given. Do not re-ask those. Still ask for anything missing. Never invent details that are not clearly in the document or chat.
- Ask exactly one question per reply. Never combine topics. For example, do not ask about a contact form and photo people in the same message. If they want a contact form, ask for the email in a later turn, not in the same turn as the yes/no. If they have trading hours, ask for the days and times in a later turn, not in the same turn as the yes/no.
- Keep replies short and warm — one or two sentences, then the single question.
- Carry forward every field you already extracted. Empty strings and "unknown" mean not yet known.
- If they mention extra useful details along the way (suburbs they cover, a slogan, languages, and so on), store them in extra_details. Do not ask a dedicated question just to fill extra_details. Do not put the About us story or trading hours in extra_details.

When business name, about, services, phone, WhatsApp preference, contact-form preference, trading-hours preference (and hours text if they have hours), people_ethnicity, design_preference_resolved, and the address choice are all known:
- Do not set complete or user_confirmed yet.
- Do not recap or list the information you collected.
- Tell them you have everything you need to go ahead, and ask if they are happy to proceed.
- If they add extra details in that reply (areas, a tagline, or anything else useful), store it in extra_details and still treat a clear yes as confirmation.
- If they want to change something, update the intake and ask again if they are happy to proceed. Still do not summarise the full intake.
- Set user_confirmed to true and complete to true only when they clearly agree to proceed.
- If they already agreed (yes, start, go ahead, proceed, I'm ready) and the required fields are known, set user_confirmed and complete to true immediately. Reply with one short sentence. Do not recap. Do not ask another question. Carry forward every field you already have.
- When complete is true, do not invite more details or changes and do not tell the user to send another message. Tell them to wait while the website is created and that progress updates will arrive automatically.
- Never say that you are starting, building, working on, or generating the website unless complete is true. If any information is unresolved, ask the next missing question instead.
- Throughout the chat, keep extra_details updated with any relevant extras that do not fit the other fields.
- If WhatsApp is wanted and no separate number was given, use the phone number. If a contact form is wanted, contact_email must be a valid email.`;

const DOCUMENT_INTAKE_INSTRUCTION = `${INTAKE_SYSTEM_INSTRUCTION}

The user uploaded a photo or PDF of their business information. Read all visible text carefully and fill intake fields from it. Do not invent missing facts.

About us from the flyer (required if any description exists):
- Fill about whenever the document describes the business. Do not wait for a heading that says "About".
- Use taglines, intro paragraphs, who-we-are copy, mission lines, or a short paragraph made only from phrases on the flyer (what they do, who they serve, what they stand for).
- A services list belongs in services. If the flyer also has a one-line description, that line still goes in about. If the only copy is a services list plus a name, write one factual about sentence from that copy (for example who they serve and what they offer). Do not leave about empty in that case.
- After you fill about from the flyer, do not ask for an About us story.

Other fields:
- If a phone number is visible but WhatsApp is not mentioned, leave use_whatsapp as unknown.
- If an email is visible, you may set use_contact_form to yes and contact_email to that address only when it is clearly for enquiries. Otherwise leave use_contact_form unknown.
- If opening hours are clearly listed, set use_trading_hours to yes and copy them. If none are listed, leave use_trading_hours unknown.
- If a complete address is visible, store it in address and set address_resolved to true. Do not put it in about or extra_details.
- complete must be false. user_confirmed must be false.
- Reply with one short thank-you for the upload, then ask the next missing question that is not About us if about is already filled.
- Do not recap every field. If you mention a few facts, use a short plain bullet list like "Business name: ..." with no markdown asterisks, no "Unknown" values, and no assumptions in parentheses.`;

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

function parseIntakeResult(
  rawText: string,
  currentIntake?: WebsiteIntake | null,
  messages: ChatMessage[] = [],
): IntakeChatResult {
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
    intake?: unknown;
  };
  const intake = mergeWebsiteIntake(currentIntake, coerceWebsiteIntake(data.intake));
  const confirmed =
    Boolean(data.complete) ||
    intake.user_confirmed ||
    lastUserMessageIsConfirmation(messages);
  if (confirmed && hasCoreIntakeForWebsite(intake)) {
    intake.user_confirmed = true;
    if (!intake.design_preference_resolved) {
      intake.design_preference_resolved = true;
    }
  }

  let reply = typeof data.reply === "string" ? data.reply.trim() : "";
  const complete = intake.user_confirmed && hasCoreIntakeForWebsite(intake);
  if (complete) reply = BUILDER_GENERATING_MESSAGE;
  if (!complete && /(?:start|begin|working on|build|generat).{0,50}(?:website|site)|progress updates/i.test(reply)) {
    reply = nextMissingIntakeQuestion(intake);
  }
  if (!reply) {
    throw new GeneratorError("OpenAI returned an empty chat reply.", 502);
  }

  return {
    reply,
    complete,
    intake,
  };
}

function nextMissingIntakeQuestion(intake: WebsiteIntake): string {
  const missing = missingIntakeFields(intake);
  const questions: Record<string, string> = {
    business_name: "What is the business name?",
    about: "Please tell me a little about the business for the About Us section.",
    services: "What services or products does the business offer?",
    phone: "What contact number should appear on the website?",
    use_whatsapp: "Would you like a WhatsApp contact button on the website?",
    whatsapp_number: "What WhatsApp number should the website use?",
    use_contact_form: "Would you like a Contact Us form on the website?",
    contact_email: "What email address should receive contact-form enquiries?",
    use_trading_hours: "Does the business have trading hours you want displayed?",
    trading_hours: "What are the business trading hours?",
    people_ethnicity: "If website photos include people, who should those people look like?",
    design_preference: "Do you have preferred colours, style, or mood for the website?",
    address: "What is the full public business address? You can say there is no public address.",
    user_confirmed: "I have everything I need. Are you happy for me to start building the website?",
  };
  return questions[missing[0] ?? ""] ?? "What other information should I include before building the website?";
}

export async function runIntakeChat(
  messages: ChatMessage[],
  currentIntake?: WebsiteIntake | null,
): Promise<IntakeChatResult> {
  return requestIntake(
    [
      { role: "developer", content: INTAKE_SYSTEM_INSTRUCTION },
      ...intakeContextMessage(currentIntake),
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
    30_000,
    currentIntake,
    messages,
  );
}

export function parseIntakeUpload(raw: unknown): IntakeUpload {
  if (!raw || typeof raw !== "object") {
    throw new GeneratorError("The uploaded file was not readable. Please try again.", 400);
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.filename !== "string" || typeof data.mediaType !== "string" || typeof data.data !== "string") {
    throw new GeneratorError("The uploaded file was not readable. Please try again.", 400);
  }

  const mediaType = data.mediaType.trim().toLowerCase();
  if (!isAllowedIntakeUploadType(mediaType)) {
    throw new GeneratorError("Upload a JPG, PNG, WebP, GIF, or PDF.", 400);
  }

  const dataBase64 = data.data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!dataBase64) {
    throw new GeneratorError("The uploaded file was empty.", 400);
  }

  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0) {
    throw new GeneratorError("The uploaded file was empty.", 400);
  }
  if (bytes.length > INTAKE_UPLOAD_MAX_BYTES) {
    throw new GeneratorError("That file is too large. Please use a file under 4 MB.", 400);
  }

  return {
    filename: sanitizeIntakeFilename(data.filename),
    mediaType,
    data: dataBase64,
  };
}

export async function runIntakeFromDocument(
  messages: ChatMessage[],
  document: IntakeUpload,
  currentIntake?: WebsiteIntake | null,
): Promise<IntakeChatResult> {
  if (isMockAiEnabled()) {
    await mockDelay(800);
    return withFlyerUploaded(mockIntakeFromDocument(document.filename, currentIntake));
  }

  const prior = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  const dataUrl = `data:${document.mediaType};base64,${document.data}`;
  const filePart =
    document.mediaType === "application/pdf"
      ? { type: "input_file", filename: document.filename, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl };

  const result = await requestIntake(
    [
      { role: "developer", content: DOCUMENT_INTAKE_INSTRUCTION },
      ...intakeContextMessage(currentIntake),
      ...prior.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user",
        content: [
          filePart,
          {
            type: "input_text",
            text:
              last?.content ||
              "I uploaded a file with my business information.",
          },
          {
            type: "input_text",
            text: "Extract every visible fact. Fill about from the flyer's description, tagline, intro, or who-we-are copy. Do not leave about empty if the flyer describes the business. Do not ask for About us if you can fill it from this file.",
          },
        ],
      },
    ],
    60_000,
    currentIntake,
    messages,
  );
  return withFlyerUploaded(result);
}

function withFlyerUploaded(result: IntakeChatResult): IntakeChatResult {
  return {
    ...result,
    intake: { ...result.intake, flyer_uploaded: true },
  };
}

function intakeContextMessage(intake?: WebsiteIntake | null): Array<{ role: "developer"; content: string }> {
  if (!intake) return [];
  return [
    {
      role: "developer",
      content: `Already collected intake (carry these forward; only change a field when the user or document clearly updates it):\n${JSON.stringify(intake)}`,
    },
  ];
}

function mockIntakeFromDocument(
  filename: string,
  currentIntake?: WebsiteIntake | null,
): IntakeChatResult {
  const intake: WebsiteIntake = {
    ...emptyWebsiteIntake(),
    ...currentIntake,
    business_name: currentIntake?.business_name || "Thando Plumbing",
    about: currentIntake?.about || "Local plumbing services in Durban.",
    services: currentIntake?.services || "Geyser repairs, blocked drains, leak detection",
    phone: currentIntake?.phone || "082 123 4567",
    extra_details: [currentIntake?.extra_details, `Details read from ${filename}.`]
      .filter(Boolean)
      .join(" "),
    user_confirmed: false,
    address: "",
    address_resolved: false,
  };
  return {
    reply:
      "Thanks, I read your file. Do you want a WhatsApp button on the website as well?",
    complete: false,
    intake,
  };
}

async function requestIntake(
  input: unknown[],
  timeoutMs: number,
  currentIntake?: WebsiteIntake | null,
  messages: ChatMessage[] = [],
): Promise<IntakeChatResult> {
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
        input,
        text: {
          format: {
            type: "json_schema",
            name: "website_intake",
            strict: true,
            schema: INTAKE_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
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

  if (payload.error?.message) {
    throw new GeneratorError(payload.error.message, 502);
  }

  const outputText = collectOutputText(payload);
  if (!outputText) {
    throw new GeneratorError("OpenAI returned an empty chat response.", 502);
  }

  return parseIntakeResult(outputText, currentIntake, messages);
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
