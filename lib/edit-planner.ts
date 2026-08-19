import path from "node:path";
import { looksLikeImageEdit, instructionHasImagePlanDetails } from "./image-edit-planner";
import { isMockAiEnabled, mockPlanEditFiles } from "./mock-ai";
import type { WebsiteFile } from "./types";
import { chargeOpenAIUsage, chargeTokens, FALLBACK_TOKEN_USAGE, MOCK_TOKEN_USAGE } from "./tokens";
import { GeneratorError, normalizeRelativePath } from "./validation";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_PLANNER_MODEL = "gpt-5-mini";

export type WebsiteFileKind = "html" | "css" | "javascript" | "other";

export type WebsiteFileManifestEntry = {
  path: string;
  type: WebsiteFileKind;
  description: string;
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "imageIntent", "imagePlanReady"],
  properties: {
    files: {
      type: "array",
      description: "Relative paths of files that need to be edited.",
      items: { type: "string" },
    },
    imageIntent: {
      type: "boolean",
      description:
        "True only when the user wants to add, replace, or regenerate a website photo.",
    },
    imagePlanReady: {
      type: "boolean",
      description:
        "True only when imageIntent is true and the user already said what the photo should show and where it belongs or which current photo to replace.",
    },
  },
} as const;

const PLANNER_INSTRUCTION = `You decide which website files need to be edited for a user request.

Return ONLY the smallest set of file paths that are sufficient to make the change.
Typical mapping:
- Visual styling (colour, spacing, fonts, hover) → CSS
- Content or structure (text, sections, links, markup) → HTML
- Photos, images, hero/about pictures (change src, alt, or add an img) → HTML
- Behaviour (clicks, forms, animations) → JavaScript

Set imageIntent to true only if the user wants to add, replace, or change a photo. Text, colour, phone, and layout changes are false.

Set imagePlanReady to true only when imageIntent is true AND the user message itself already contains both:
- what the new photo should show (subject, people, scene, or style)
- where it belongs or which current photo to change (about, hero, logo, services, etc.)
If either is missing, imagePlanReady is false. Do not guess. Do not use the file list as a substitute for the user saying this.
Examples:
- "change the about image to a Black woman plumber" → imageIntent true, imagePlanReady true
- "change the image" or "make a nicer photo" → imageIntent true, imagePlanReady false
- "make the heading green" → both false

Do not read or require HTML for this decision.

Include extra files only when the request clearly needs them, for example adding a new button often needs HTML and CSS.
If you are unsure, include every file that might need to change.
Do not invent paths that are not in the file list.
Return ONLY the structured output.`;

function fileKindFromPath(filePath: string): WebsiteFileKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "html";
  if (extension === ".css") return "css";
  if (extension === ".js") return "javascript";
  return "other";
}

function describeWebsiteFile(file: WebsiteFile, kind: WebsiteFileKind): string {
  const lower = file.content.toLowerCase();
  const features: string[] = [];

  if (lower.includes("whatsapp")) features.push("WhatsApp");
  if (lower.includes('id="about"') || lower.includes("id='about'")) {
    features.push("about");
  }
  if (lower.includes("contact-form") || lower.includes('id="contact"')) {
    features.push("contact form");
  }
  if (lower.includes("google.com/maps") || lower.includes('id="map"')) {
    features.push("map");
  }

  const unique = [...new Set(features)];
  const suffix = unique.length > 0 ? ` (${unique.join(", ")})` : "";

  if (kind === "html") {
    const isMain =
      file.path === "index.html" || file.path.endsWith("/index.html");
    return `${isMain ? "Main website structure and content" : "Website page structure and content"}${suffix}`;
  }

  if (kind === "css") {
    return `All website styling${suffix}`;
  }

  if (kind === "javascript") {
    return `Interactive functionality${suffix}`;
  }

  return `Website file${suffix}`;
}

export function buildFileManifest(
  files: WebsiteFile[],
): WebsiteFileManifestEntry[] {
  return files.map((file) => {
    const kind = fileKindFromPath(file.path);
    return {
      path: file.path,
      type: kind,
      description: describeWebsiteFile(file, kind),
    };
  });
}

function formatManifestForPlanner(manifest: WebsiteFileManifestEntry[]): string {
  return manifest
    .map((entry) => `${entry.path} - ${entry.description}`)
    .join("\n");
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
      throw new GeneratorError("OpenAI refused to plan the edit.", 502);
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
          part.refusal || "OpenAI refused to plan the edit.",
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

function parseEditPlan(
  rawText: string,
  allowedPaths: Set<string>,
): { paths: string[]; imageIntent: boolean; imagePlanReady: boolean } {
  const empty = { paths: [] as string[], imageIntent: false, imagePlanReady: false };
  const trimmed = rawText.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) {
      return empty;
    }
    try {
      parsed = JSON.parse(fenced[1].trim());
    } catch {
      return empty;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return empty;
  }

  const record = parsed as {
    files?: unknown;
    imageIntent?: unknown;
    imagePlanReady?: unknown;
  };
  const imageIntent = record.imageIntent === true;
  const imagePlanReady = imageIntent && record.imagePlanReady === true;
  const files = record.files;
  if (!Array.isArray(files)) {
    return { paths: [], imageIntent, imagePlanReady };
  }

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const item of files) {
    if (typeof item !== "string") continue;
    const normalized = normalizeRelativePath(item.trim());
    if (!allowedPaths.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push(normalized);
  }

  return { paths: selected, imageIntent, imagePlanReady };
}

export function selectFilesForEdit(
  files: WebsiteFile[],
  plannedPaths: string[],
): WebsiteFile[] {
  if (plannedPaths.length === 0) {
    return files;
  }

  const byPath = new Map(files.map((file) => [file.path, file]));
  const selected: WebsiteFile[] = [];

  for (const filePath of plannedPaths) {
    const file = byPath.get(filePath);
    if (file) {
      selected.push(file);
    }
  }

  return selected.length > 0 ? selected : files;
}

async function planEditFilesWithOpenAI(
  instruction: string,
  manifest: WebsiteFileManifestEntry[],
): Promise<{ paths: string[]; imageIntent: boolean; imagePlanReady: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new GeneratorError(
      "OPENAI_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }

  const allowedPaths = new Set(manifest.map((entry) => entry.path));
  const userMessage = `User request:\n${instruction.trim()}\n\nFiles:\n${formatManifestForPlanner(manifest)}`;

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
        max_output_tokens: 256,
        input: [
          { role: "developer", content: PLANNER_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "edit_file_plan",
            strict: true,
            schema: PLAN_SCHEMA,
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
        ? "The edit planning request timed out. Please try again."
        : "Unable to reach the OpenAI API.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("OpenAI edit planner error:", response.status, errorBody);
    throw new GeneratorError("Edit planning request failed.", 502);
  }

  const payload = await response.json();
  await chargeOpenAIUsage(payload, FALLBACK_TOKEN_USAGE.plan, "plan");
  if (payload.error?.message) {
    throw new GeneratorError(payload.error.message, 502);
  }

  const outputText = collectOutputText(payload);
  return parseEditPlan(outputText, allowedPaths);
}

export type EditFilePlan = {
  files: WebsiteFile[];
  imageIntent: boolean;
  imagePlanReady: boolean;
};

export async function planRelevantEditFiles(
  instruction: string,
  files: WebsiteFile[],
): Promise<EditFilePlan> {
  if (files.length <= 1) {
    const imageIntent = looksLikeImageEdit(instruction);
    return {
      files,
      imageIntent,
      imagePlanReady: imageIntent && instructionHasImagePlanDetails(instruction),
    };
  }

  const manifest = buildFileManifest(files);

  if (isMockAiEnabled()) {
    const planned = mockPlanEditFiles(instruction, manifest);
    console.log("[edit-planner] mock relevant files:", planned);
    await chargeTokens(MOCK_TOKEN_USAGE.plan, 0, undefined, "plan");
    return {
      files: selectFilesForEdit(files, planned.files),
      imageIntent: planned.imageIntent,
      imagePlanReady: planned.imageIntent && planned.imagePlanReady,
    };
  }

  try {
    const planned = await planEditFilesWithOpenAI(instruction, manifest);
    console.log("[edit-planner] relevant files:", planned);
    return {
      files: selectFilesForEdit(files, planned.paths),
      imageIntent: planned.imageIntent,
      imagePlanReady: planned.imageIntent && planned.imagePlanReady,
    };
  } catch (error) {
    console.error("Edit planner failed, sending all files:", error);
    const imageIntent = looksLikeImageEdit(instruction);
    return {
      files,
      imageIntent,
      imagePlanReady: imageIntent && instructionHasImagePlanDetails(instruction),
    };
  }
}
