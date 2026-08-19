import { GeneratorError, REQUIRED_FILES } from "./validation";
import type { GeneratedWebsite } from "./types";
import { isMockAiEnabled, mockDelay, mockGenerateWebsite } from "./mock-ai";
import { chargeOpenAIUsage, chargeTokens, FALLBACK_TOKEN_USAGE, MOCK_TOKEN_USAGE } from "./tokens";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.5";

const SYSTEM_INSTRUCTION = `You are an expert web developer. Generate lightweight production-ready websites using HTML, CSS and vanilla JavaScript. The website will be saved to the filesystem and previewed as a static website.

Return ONLY the requested structured output.

Generate exactly these 3 files and no others:

${REQUIRED_FILES.map((file) => `* ${file}`).join("\n")}

Do not generate additional pages, stylesheets, scripts, or any other website files.

Use relative paths between files.

Do not use React.
Do not use Next.js.
Do not use external build tools.
Do not use server-side code.

Do not reference files that you have not generated.

Do not use external image URLs. Use relative image paths under images/ (for example images/hero.png).

Include 2-3 images in the images array with prompts for a hero image and supporting visuals that match the business. Reference those image paths in index.html.

If the user specifies who people in photos should look like, include that direction in every image prompt that depicts people.

If the user describes a design preference such as colours, mood, or style, follow it closely in the layout, CSS, and image prompts.

Do not invent missing business information.

If the user provides an About us / business story:
- Include an About section with id="about" using that text.
- Do not invent history, years in business, credentials, awards, or a backstory they did not provide.
- If no about text is provided, omit the About section rather than fabricating one.

If the user asks for a Contact Us form:
- Include a contact section with name, email, and message fields (phone optional).
- Display the business email address visibly on the website (contact section, header or footer) as a mailto link.
- Submit with fetch() POST as JSON to the provided contact API endpoint.
- JSON body fields: websiteId, name, email, phone, message, businessName.
- Set websiteId to "__WEBSITE_ID__". Never send a recipient "to" address.
- Show success and error feedback on the page without a full reload.
- Never include API keys, Resend secrets, or server-side code in the generated files.
- Do not use mailto: as the primary form submit method.

Create a professional, responsive and mobile-friendly website.

Aggressive on-page SEO is required in index.html:
- Set <html lang> to en-ZA when the business is in South Africa, otherwise the matching language.
- Unique <title> of 50-60 characters: business name, primary service, and city/area if known.
- <meta name="description"> of 140-160 characters with the main service, location, and a clear call to action. Do not invent claims.
- <meta name="robots" content="index, follow">
- Open Graph tags: og:title, og:description, og:type=website, og:locale=en_ZA (if South Africa), og:image pointing at the hero image relative path.
- Twitter card summary_large_image with twitter:title, twitter:description, and twitter:image.
- Semantic HTML: header, nav, main, section, footer. Exactly one h1. Logical h2/h3 headings that include real services and the location when known.
- Descriptive alt text on every image. Never empty alt on meaningful photos.
- Visible click-to-call tel: links and WhatsApp links when those details exist.
- A JSON-LD <script type="application/ld+json"> LocalBusiness (or a more specific subtype such as Plumber, HairSalon, Restaurant, ProfessionalService) with name, description, telephone, address, areaServed, and url omitted if unknown. Do not add FAQPage JSON-LD.
- Do not include an FAQ section.
- Do not invent reviews, star ratings, prices, licences, or credentials.
- Use internal in-page links (#about, #services, #contact) in the nav. Include #about only when an About section exists. Do not link to #faq.
- Do not keyword-stuff, hide text, or repeat the same phrase unnaturally.`;

const WEBSITE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "images"],
  properties: {
    files: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: {
            type: "string",
            enum: [...REQUIRED_FILES],
            description: "Must be index.html, styles.css, or script.js.",
          },
          content: {
            type: "string",
            description: "Full file contents.",
          },
        },
      },
    },
    images: {
      type: "array",
      description:
        "Image files to generate. Paths must be under images/ and end with .png.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "prompt"],
        properties: {
          path: {
            type: "string",
            description: "Relative path such as images/hero.png.",
          },
          prompt: {
            type: "string",
            description: "Prompt for generating this image.",
          },
        },
      },
    },
  },
} as const;

interface OpenAIErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

interface OpenAIOutputContent {
  type?: string;
  text?: string;
  parsed?: unknown;
  refusal?: string;
}

interface OpenAIOutputItem {
  type?: string;
  role?: string;
  status?: string;
  content?: OpenAIOutputContent[] | string;
}

interface OpenAIResponsesPayload {
  id?: string;
  status?: string;
  error?: { message?: string; code?: string } | null;
  output_text?: string;
  output?: OpenAIOutputItem[];
  incomplete_details?: { reason?: string };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

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

function extractMessage(errorBody: OpenAIErrorBody | null, status: number): string {
  return (
    errorBody?.error?.message ||
    `OpenAI request failed with status ${status}.`
  );
}

function collectOutputText(payload: OpenAIResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type === "refusal" || (item as { refusal?: string }).refusal) {
      throw new GeneratorError(
        "OpenAI refused to generate the website. Try a different description.",
        502,
      );
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
          part.refusal || "OpenAI refused to generate the website.",
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

function parseGeneratedWebsite(rawText: string): GeneratedWebsite {
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new GeneratorError(
      "OpenAI returned an empty response. Please try again.",
      502,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) {
      throw new GeneratorError(
        "Failed to parse structured JSON from the OpenAI response.",
        502,
      );
    }

    try {
      parsed = JSON.parse(fenced[1].trim());
    } catch {
      throw new GeneratorError(
        "Failed to parse structured JSON from the OpenAI response.",
        502,
      );
    }
  }

  if (!parsed || typeof parsed !== "object" || !("files" in parsed)) {
    throw new GeneratorError(
      "OpenAI response did not include a files array.",
      502,
    );
  }

  return parsed as GeneratedWebsite;
}

export async function generateWebsiteFromOpenAI(
  prompt: string,
): Promise<GeneratedWebsite> {
  if (isMockAiEnabled()) {
    console.log("[mock-ai] Generating mock website");
    await mockDelay(900);
    await chargeTokens(MOCK_TOKEN_USAGE.generate, 0, undefined, "generate");
    return mockGenerateWebsite(prompt);
  }

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
        max_output_tokens: 16384,
        input: [
          {
            role: "developer",
            content: SYSTEM_INSTRUCTION,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "generated_website",
            strict: true,
            schema: WEBSITE_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
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
        ? "The OpenAI request timed out. Please try again."
        : "Unable to reach the OpenAI API.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as OpenAIErrorBody | null;
    console.error("OpenAI error response:", response.status, errorBody);
    const status = response.status === 401 || response.status === 403 ? 500 : 502;
    throw new GeneratorError(extractMessage(errorBody, response.status), status);
  }

  const payload = (await response.json()) as OpenAIResponsesPayload;
  console.log("OpenAI response:", JSON.stringify(payload, null, 2));
  await chargeOpenAIUsage(payload, FALLBACK_TOKEN_USAGE.generate, "generate");

  if (payload.error?.message) {
    throw new GeneratorError(payload.error.message, 502);
  }

  if (payload.status === "failed") {
    throw new GeneratorError("OpenAI failed to generate the website.", 502);
  }

  if (payload.status === "incomplete") {
    const reason = payload.incomplete_details?.reason;
    throw new GeneratorError(
      reason
        ? `OpenAI response was incomplete (${reason}). Try a shorter description.`
        : "OpenAI response was incomplete. Try a shorter description.",
      502,
    );
  }

  const outputText = collectOutputText(payload);
  return parseGeneratedWebsite(outputText);
}

export class BackgroundUnsupportedError extends Error {
  constructor() {
    super("OpenAI background responses are not available.");
    this.name = "BackgroundUnsupportedError";
  }
}

export type BackgroundResponsePoll =
  | { status: "pending" }
  | { status: "complete"; outputText: string }
  | { status: "failed"; error: string };

function isBackgroundUnsupported(status: number, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = message.toLowerCase();
  return lower.includes("background") || lower.includes("unknown parameter");
}

async function postResponses(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ response: Response; payload: OpenAIResponsesPayload | OpenAIErrorBody | null }> {
  const apiKey = getApiKey();
  let response: Response;

  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof GeneratorError) throw error;
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new GeneratorError(
      aborted
        ? "The OpenAI request timed out. Please try again."
        : "Unable to reach the OpenAI API.",
      502,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | OpenAIResponsesPayload
    | OpenAIErrorBody
    | null;
  return { response, payload };
}

export async function startBackgroundStructuredResponse(input: {
  model: string;
  maxOutputTokens: number;
  developer: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<{ id: string; outputText?: string }> {
  const { response, payload } = await postResponses(
    {
      model: input.model,
      background: true,
      store: true,
      max_output_tokens: input.maxOutputTokens,
      input: [
        { role: "developer", content: input.developer },
        { role: "user", content: input.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    },
    20_000,
  );

  const errorMessage =
    payload && "error" in payload && payload.error && typeof payload.error === "object"
      ? String((payload.error as { message?: string }).message ?? "")
      : "";

  if (!response.ok) {
    console.error("OpenAI background start error:", response.status, payload);
    if (isBackgroundUnsupported(response.status, errorMessage)) {
      throw new BackgroundUnsupportedError();
    }
    const status = response.status === 401 || response.status === 403 ? 500 : 502;
    throw new GeneratorError(
      errorMessage || extractMessage(payload as OpenAIErrorBody | null, response.status),
      status,
    );
  }

  const result = payload as OpenAIResponsesPayload | null;
  const id = typeof result?.id === "string" ? result.id.trim() : "";
  if (!id) {
    throw new GeneratorError("OpenAI did not return a response id.", 502);
  }

  if (result?.status === "completed") {
    await chargeOpenAIUsage(result, 0);
    return { id, outputText: collectOutputText(result) };
  }

  if (result?.status === "failed" || result?.status === "incomplete") {
    throw new GeneratorError(
      result.error?.message || "OpenAI failed to start the request.",
      502,
    );
  }

  return { id };
}

export async function runForegroundStructuredResponse(input: {
  model: string;
  maxOutputTokens: number;
  developer: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<string> {
  const { response, payload } = await postResponses(
    {
      model: input.model,
      max_output_tokens: input.maxOutputTokens,
      input: [
        { role: "developer", content: input.developer },
        { role: "user", content: input.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    },
    90_000,
  );

  if (!response.ok) {
    const errorBody = payload as OpenAIErrorBody | null;
    console.error("OpenAI foreground error:", response.status, errorBody);
    const status = response.status === 401 || response.status === 403 ? 500 : 502;
    throw new GeneratorError(extractMessage(errorBody, response.status), status);
  }

  const result = payload as OpenAIResponsesPayload | null;
  if (!result) {
    throw new GeneratorError("No response from AI.", 502);
  }
  if (result.error?.message) {
    throw new GeneratorError(result.error.message, 502);
  }
  if (result.status === "failed") {
    throw new GeneratorError("OpenAI failed to generate a response.", 502);
  }
  if (result.status === "incomplete") {
    const reason = result.incomplete_details?.reason;
    throw new GeneratorError(
      reason
        ? `OpenAI response was incomplete (${reason}). Try a shorter description.`
        : "OpenAI response was incomplete. Try a shorter description.",
      502,
    );
  }

  await chargeOpenAIUsage(result, FALLBACK_TOKEN_USAGE.edit, "edit");
  return collectOutputText(result);
}

export async function retrieveBackgroundStructuredResponse(
  responseId: string,
): Promise<BackgroundResponsePoll> {
  const apiKey = getApiKey();
  const id = responseId.trim();
  if (!id) {
    return { status: "failed", error: "Missing OpenAI response id." };
  }

  let response: Response;
  try {
    response = await fetch(`${OPENAI_RESPONSES_URL}/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { status: "pending" };
  }

  const payload = (await response.json().catch(() => null)) as OpenAIResponsesPayload | null;

  if (!response.ok) {
    if (response.status === 404) {
      return { status: "failed", error: "The OpenAI request was lost. Please try again." };
    }
    console.error("OpenAI background poll error:", response.status, payload);
    return { status: "pending" };
  }

  if (!payload) {
    return { status: "pending" };
  }

  if (payload.status === "queued" || payload.status === "in_progress") {
    return { status: "pending" };
  }

  if (payload.status === "cancelled") {
    return { status: "failed", error: "The request was cancelled." };
  }

  if (payload.status === "failed") {
    return {
      status: "failed",
      error: payload.error?.message || "OpenAI failed to generate a response.",
    };
  }

  if (payload.status === "incomplete") {
    const reason = payload.incomplete_details?.reason;
    return {
      status: "failed",
      error: reason
        ? `OpenAI response was incomplete (${reason}). Try a shorter description.`
        : "OpenAI response was incomplete. Try a shorter description.",
    };
  }

  try {
    await chargeOpenAIUsage(payload, 0);
    return { status: "complete", outputText: collectOutputText(payload) };
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error ? error.message : "OpenAI returned an empty response.",
    };
  }
}

export async function cancelBackgroundStructuredResponse(
  responseId: string,
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const id = responseId.trim();
  if (!apiKey || !id) return;

  await fetch(`${OPENAI_RESPONSES_URL}/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}

export async function startWebsiteGenerationBackground(
  prompt: string,
): Promise<{ id: string; website?: GeneratedWebsite }> {
  const started = await startBackgroundStructuredResponse({
    model: OPENAI_MODEL,
    maxOutputTokens: 16384,
    developer: SYSTEM_INSTRUCTION,
    user: prompt,
    schemaName: "generated_website",
    schema: WEBSITE_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  if (started.outputText) {
    return { id: started.id, website: parseGeneratedWebsite(started.outputText) };
  }

  return { id: started.id };
}

export async function pollWebsiteGenerationBackground(
  responseId: string,
): Promise<{ status: "pending" } | { status: "complete"; website: GeneratedWebsite } | { status: "failed"; error: string }> {
  const poll = await retrieveBackgroundStructuredResponse(responseId);
  if (poll.status === "complete") {
    try {
      return { status: "complete", website: parseGeneratedWebsite(poll.outputText) };
    } catch (error) {
      return {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse the generated website.",
      };
    }
  }
  return poll;
}
