import { GeneratorError } from "./validation";
import type { GeneratedWebsite } from "./types";
import { isMockAiEnabled, mockDelay, mockGenerateWebsite } from "./mock-ai";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.5";

const SYSTEM_INSTRUCTION = `You are an expert web developer. Generate lightweight production-ready websites using HTML, CSS and vanilla JavaScript. The website will be saved to the filesystem and previewed as a static website.

Return ONLY the requested structured output.

The website must contain:

* index.html
* styles.css
* script.js

Use relative paths between files.

Do not use React.
Do not use Next.js.
Do not use external build tools.
Do not use server-side code.

Do not reference files that you have not generated.

Do not use external image URLs. Use relative image paths under images/ (for example images/hero.png).

Include 2-3 images in the images array with prompts for a hero image and supporting visuals that match the business. Reference those image paths in index.html.

If the user specifies who people in photos should look like, include that direction in every image prompt that depicts people.

Do not invent missing business information.

If the user asks for a Contact Us form:
- Include a contact section with name, email, and message fields (phone optional).
- Display the business email address visibly on the website (contact section, header or footer) as a mailto link.
- Submit with fetch() POST as JSON to the provided contact API endpoint. Include the recipient email as "to".
- Show success and error feedback on the page without a full reload.
- Never include API keys, Resend secrets, or server-side code in the generated files.
- Do not use mailto: as the primary form submit method.

Create a professional, responsive and mobile-friendly website.`;

const WEBSITE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "images"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: {
            type: "string",
            description: "Relative file path inside the website directory.",
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
