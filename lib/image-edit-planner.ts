import { isMockAiEnabled, mockPlanImageEdits } from "./mock-ai";
import type {
  WebsiteFile,
  WebsiteImageChange,
  WebsiteImageChangeAction,
  WebsiteImagePlan,
} from "./types";
import { chargeOpenAIUsage, chargeTokens, FALLBACK_TOKEN_USAGE, MOCK_TOKEN_USAGE } from "./tokens";
import { GeneratorError, isSafeRelativePath, normalizeRelativePath } from "./validation";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_PLANNER_MODEL = "gpt-5-mini";
const MAX_IMAGE_CHANGES = 3;

const IMAGE_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["imageIntent", "images"],
  properties: {
    imageIntent: {
      type: "boolean",
      description:
        "True when the user wants to add, replace, or regenerate a website photo.",
    },
    images: {
      type: "array",
      description: "Concrete image changes. Empty when imageIntent is false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "path", "prompt", "replacePath", "placement"],
        properties: {
          action: {
            type: "string",
            enum: ["replace", "add"],
          },
          path: {
            type: "string",
            description: "New image path under images/, ending with .webp.",
          },
          prompt: {
            type: "string",
            description: "Full image-generation prompt for the new photo.",
          },
          replacePath: {
            type: "string",
            description:
              "Existing image path to replace and delete. Empty string when adding.",
          },
          placement: {
            type: "string",
            description:
              "Where this image belongs, e.g. About section img in index.html.",
          },
        },
      },
    },
  },
} as const;

const PLANNER_INSTRUCTION = `You plan website image changes before any files are edited or photos are generated.

Decide whether the user wants to add, replace, or regenerate a photo.
If they do not, set imageIntent to false and return an empty images array.

If they do, set imageIntent to true and return 1-3 concrete image changes. You MUST identify all of the following for every change before any update can proceed:
- action: "replace" an existing photo, or "add" a new one
- prompt: a detailed photorealistic generation prompt for what the new image should show
- path: the new file to generate, under images/ and ending with .webp
- placement: exactly where it belongs in the HTML (section, img, alt, or CSS background)
- replacePath: the existing images/ file being replaced. Empty string only for add.

Rules:
- Find current photos from the HTML only: <img src>, CSS urls, og:image, and twitter:image. "about image" means the photo in the About section, "hero" means the main banner, and so on.
- For replace, choose a NEW filename (for example images/about.webp → images/about-plumbing.webp) so the old file can be deleted after the update. Put the old HTML src in replacePath.
- For add, choose a new unused path and describe where to insert the <img>.
- Never invent a replacePath that is not already referenced in the HTML.
- Never return an image change without a real prompt, path, and placement.
- If the request is about images but several photos could match, pick the most likely one from the HTML.
- Do not plan image changes for text, colour, layout, or contact details that do not involve photos.
Return ONLY the structured output.`;

export function looksLikeImageEdit(instruction: string): boolean {
  return /\b(image|images|photo|photos|picture|pictures|img|logo|hero|portrait|headshot)\b/i.test(
    instruction,
  );
}

export function instructionHasImagePlanDetails(instruction: string): boolean {
  if (!looksLikeImageEdit(instruction)) return false;
  const hasTarget =
    /\b(about|hero|logo|banner|header|footer|services?|team|contact)\b/i.test(
      instruction,
    );
  const words = instruction
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  return hasTarget && words.length >= 6;
}

export function imageRequestsFromPlan(
  plan: WebsiteImagePlan,
): { path: string; prompt: string }[] {
  return plan.images.map((image) => ({ path: image.path, prompt: image.prompt }));
}

export function replacePathsFromPlan(plan: WebsiteImagePlan): string[] {
  const newPaths = new Set(plan.images.map((image) => image.path));
  const replacePaths: string[] = [];
  const seen = new Set<string>();

  for (const image of plan.images) {
    if (!image.replacePath || newPaths.has(image.replacePath)) continue;
    if (seen.has(image.replacePath)) continue;
    seen.add(image.replacePath);
    replacePaths.push(image.replacePath);
  }

  return replacePaths;
}

export function formatImagePlanForEditor(plan: WebsiteImagePlan): string {
  if (plan.images.length === 0) {
    return "";
  }

  const lines = plan.images.map((image, index) => {
    const action =
      image.action === "replace"
        ? `REPLACE "${image.replacePath}" with "${image.path}"`
        : `ADD "${image.path}"`;
    return `${index + 1}. ${action}
   Placement: ${image.placement}
   New photo: ${image.prompt}`;
  });

  return `IMAGE PLAN (already decided — apply these exact paths in HTML/CSS; do not invent other image files):
${lines.join("\n")}

For replacements, update the matching <img src>, alt text, and og:image / twitter:image if they used the old path.
For additions, insert an <img> at the described placement with the new src and descriptive alt text.`;
}

function htmlContext(files: WebsiteFile[]): string {
  const htmlFiles = files.filter((file) => file.path.toLowerCase().endsWith(".html"));
  if (htmlFiles.length === 0) {
    return files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
  }
  return htmlFiles.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
}

function collectOutputText(payload: {
  output_text?: string;
  output?: Array<{
    type?: string;
    refusal?: string;
    content?:
      | Array<{ type?: string; text?: string; parsed?: unknown; refusal?: string }>
      | string;
  }>;
}): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type === "refusal" || item.refusal) {
      throw new GeneratorError("OpenAI refused to plan the image change.", 502);
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
          part.refusal || "OpenAI refused to plan the image change.",
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

function parseJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) return null;
    try {
      const parsed = JSON.parse(fenced[1].trim()) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function asAction(value: unknown): WebsiteImageChangeAction | null {
  return value === "replace" || value === "add" ? value : null;
}

function validateImagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeRelativePath(value.trim());
  if (!isSafeRelativePath(value) || !isSafeRelativePath(normalized)) return null;
  if (!normalized.toLowerCase().startsWith("images/")) return null;
  if (!/\.(png|webp)$/i.test(normalized)) return null;
  return normalized;
}

function validateChange(
  item: unknown,
  existingImagePaths: Set<string>,
): WebsiteImageChange | null {
  if (!item || typeof item !== "object") return null;

  const record = item as Record<string, unknown>;
  const action = asAction(record.action);
  const path = validateImagePath(record.path);
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  const placement =
    typeof record.placement === "string" ? record.placement.trim() : "";

  if (!action || !path || !prompt || !placement) return null;

  let replacePath = "";
  if (action === "replace") {
    const candidate =
      typeof record.replacePath === "string"
        ? normalizeRelativePath(record.replacePath.trim())
        : "";
    if (!candidate || !existingImagePaths.has(candidate) || candidate === path) {
      return null;
    }
    replacePath = candidate;
  }

  return { action, path, prompt, replacePath, placement };
}

function parseImagePlan(
  rawText: string,
  existingImagePaths: string[],
): WebsiteImagePlan {
  const parsed = parseJsonObject(rawText);
  if (!parsed) {
    throw new GeneratorError("Could not parse the image change plan.", 502);
  }

  const imageIntent = parsed.imageIntent === true;
  if (!imageIntent) {
    return { imageIntent: false, images: [] };
  }

  const existing = new Set(existingImagePaths);
  const images: WebsiteImageChange[] = [];
  const seen = new Set<string>();

  if (Array.isArray(parsed.images)) {
    for (const item of parsed.images) {
      if (images.length >= MAX_IMAGE_CHANGES) break;
      const change = validateChange(item, existing);
      if (!change) continue;
      const key = change.path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      images.push(change);
    }
  }

  if (images.length === 0) {
    throw new GeneratorError(
      "Could not tell which photo to change, what to generate, or where to place it. Please say which image (hero, about, etc.) and what it should show.",
      400,
    );
  }

  return { imageIntent: true, images };
}

async function planImageEditsWithOpenAI(
  instruction: string,
  files: WebsiteFile[],
  existingImagePaths: string[],
): Promise<WebsiteImagePlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new GeneratorError(
      "OPENAI_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }

  const userMessage = `User request:\n${instruction.trim()}\n\nWebsite HTML:\n${htmlContext(files)}`;

  let response: Response;

  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_PLANNER_MODEL,
        max_output_tokens: 1024,
        input: [
          { role: "developer", content: PLANNER_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "image_edit_plan",
            strict: true,
            schema: IMAGE_PLAN_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new GeneratorError(
      aborted
        ? "The image planning request timed out. Please try again."
        : "Unable to reach the OpenAI API.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("OpenAI image edit planner error:", response.status, errorBody);
    throw new GeneratorError("Image planning request failed.", 502);
  }

  const payload = await response.json();
  await chargeOpenAIUsage(payload, FALLBACK_TOKEN_USAGE.plan, "plan");
  if (payload.error?.message) {
    throw new GeneratorError(payload.error.message, 502);
  }

  return parseImagePlan(collectOutputText(payload), existingImagePaths);
}

export async function planImageEdits(
  instruction: string,
  files: WebsiteFile[],
  existingImagePaths: string[],
): Promise<WebsiteImagePlan> {
  if (isMockAiEnabled()) {
    const planned = mockPlanImageEdits(instruction, existingImagePaths);
    console.log("[image-edit-planner] mock plan:", planned);
    await chargeTokens(MOCK_TOKEN_USAGE.plan, 0, undefined, "plan");
    return planned;
  }

  try {
    const planned = await planImageEditsWithOpenAI(
      instruction,
      files,
      existingImagePaths,
    );
    console.log("[image-edit-planner] plan:", planned);
    return planned;
  } catch (error) {
    if (error instanceof GeneratorError && error.statusCode === 400) {
      throw error;
    }
    if (looksLikeImageEdit(instruction)) {
      throw error;
    }
    console.error("Image edit planner failed, continuing without images:", error);
    return { imageIntent: false, images: [] };
  }
}
