import "server-only";

import { planRelevantEditFiles } from "@/lib/edit-planner";
import {
  listWebsiteImagePaths,
  readEditableWebsiteFiles,
  updateWebsiteFiles,
} from "@/lib/file-manager";
import {
  formatImagePlanForEditor,
  planImageEdits,
} from "@/lib/image-edit-planner";
import { mockDelay, mockEditWebsite } from "@/lib/mock-ai";
import {
  BackgroundUnsupportedError,
  retrieveBackgroundStructuredResponse,
  runForegroundStructuredResponse,
  startBackgroundStructuredResponse,
} from "@/lib/openai";
import type { WebsiteFile, WebsiteImagePlan } from "@/lib/types";
import { chargeTokens, MOCK_TOKEN_USAGE } from "@/lib/tokens";
import { GeneratorError, normalizeRelativePath } from "@/lib/validation";

const OPENAI_MODEL = "gpt-5.5";

const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
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
            description: "Relative file path of the changed file.",
          },
          content: {
            type: "string",
            description: "Full updated file contents.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_INSTRUCTION = `You are an expert web developer. You will be given only the website files that likely need to change (HTML, CSS, and/or JS) and a user request. Apply the requested change and return ONLY the files that were modified with their full updated content. Do not return files that were not changed.

Do not modify or return image files. Never invent image paths.

If an IMAGE PLAN is provided, follow it exactly:
- Use the given new paths in <img src>, CSS urls, and Open Graph / Twitter image tags.
- Update alt text to match the new photo.
- For additions, insert the image at the described placement.
- Do not change other images.

If no IMAGE PLAN is provided, keep existing image paths as they are.

Preserve existing SEO unless the user asks to change it: title, meta description, Open Graph tags, Twitter tags, JSON-LD, heading structure, and image alt text. If the requested edit changes the business name, about text, services, phone, address, or location, update those SEO fields so they stay accurate. Do not invent reviews, ratings, or credentials.

If adding or updating a contact form, submit with fetch() POST JSON to the existing contact API endpoint. Send websiteId, name, email, phone, message, and businessName. Never send a recipient "to" address, API keys, Resend secrets, or server-side code.

Return ONLY the structured output with the updated files.`;

function filesContext(files: WebsiteFile[]): string {
  return files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
}

function editUserMessage(
  instruction: string,
  filesToEdit: WebsiteFile[],
  imagePlan?: WebsiteImagePlan,
): string {
  const planText = imagePlan ? formatImagePlanForEditor(imagePlan) : "";
  const planBlock = planText ? `\n\n---\n\n${planText}` : "";
  return `Here are the website files that may need to change:\n\n${filesContext(filesToEdit)}${planBlock}\n\n---\n\nUser request: ${instruction}`;
}

function withFilesByExtension(
  selected: WebsiteFile[],
  all: WebsiteFile[],
  extension: string,
): WebsiteFile[] {
  const byPath = new Map(selected.map((file) => [file.path, file]));
  for (const file of all) {
    if (!file.path.toLowerCase().endsWith(extension)) continue;
    if (!byPath.has(file.path)) {
      byPath.set(file.path, file);
    }
  }
  return [...byPath.values()];
}

function parseEditedFiles(outputText: string, allowedPaths: Set<string>): WebsiteFile[] {
  const parsed = JSON.parse(outputText) as { files?: WebsiteFile[] };
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new GeneratorError("AI did not return an edited files array.", 502);
  }

  return parsed.files.filter((file) => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      return false;
    }
    return allowedPaths.has(normalizeRelativePath(file.path));
  });
}

async function runSyncWebsiteEdit(
  instruction: string,
  filesToEdit: WebsiteFile[],
  imagePlan?: WebsiteImagePlan,
): Promise<WebsiteFile[]> {
  const outputText = await runForegroundStructuredResponse({
    model: OPENAI_MODEL,
    maxOutputTokens: 16384,
    developer: SYSTEM_INSTRUCTION,
    user: editUserMessage(instruction, filesToEdit, imagePlan),
    schemaName: "edited_website",
    schema: EDIT_SCHEMA as unknown as Record<string, unknown>,
  });
  return parseEditedFiles(outputText, new Set(filesToEdit.map((file) => file.path)));
}

export async function prepareWebsiteEdit(
  websiteId: string,
  instruction: string,
  idToken: string,
): Promise<{ filesToEdit: WebsiteFile[]; imagePlan: WebsiteImagePlan }> {
  const editableFiles = await readEditableWebsiteFiles(websiteId, idToken);
  const planned = await planRelevantEditFiles(instruction, editableFiles);
  let filesToEdit = planned.files;

  if (!planned.imageIntent) {
    return { filesToEdit, imagePlan: { imageIntent: false, images: [] } };
  }

  if (!planned.imagePlanReady) {
    throw new GeneratorError(
      "To change a photo, say which image (hero, about, etc.) and what it should show.",
      400,
    );
  }

  const existingImagePaths = await listWebsiteImagePaths(websiteId, idToken);
  const imagePlan = await planImageEdits(instruction, editableFiles, existingImagePaths);

  if (imagePlan.images.length > 0) {
    filesToEdit = withFilesByExtension(filesToEdit, editableFiles, ".html");
    if (imagePlan.images.some((image) => image.action === "add")) {
      filesToEdit = withFilesByExtension(filesToEdit, editableFiles, ".css");
    }
  }

  return { filesToEdit, imagePlan };
}

export async function startWebsiteEditBackground(
  instruction: string,
  filesToEdit: WebsiteFile[],
  imagePlan?: WebsiteImagePlan,
): Promise<{ id: string; files?: WebsiteFile[] }> {
  const allowedPaths = new Set(filesToEdit.map((file) => file.path));

  try {
    const started = await startBackgroundStructuredResponse({
      model: OPENAI_MODEL,
      maxOutputTokens: 16384,
      developer: SYSTEM_INSTRUCTION,
      user: editUserMessage(instruction, filesToEdit, imagePlan),
      schemaName: "edited_website",
      schema: EDIT_SCHEMA as unknown as Record<string, unknown>,
    });

    if (started.outputText) {
      return { id: started.id, files: parseEditedFiles(started.outputText, allowedPaths) };
    }

    return { id: started.id };
  } catch (error) {
    if (error instanceof BackgroundUnsupportedError) {
      return { id: "", files: await runSyncWebsiteEdit(instruction, filesToEdit, imagePlan) };
    }
    throw error;
  }
}

export async function pollWebsiteEditBackground(
  responseId: string,
  allowedPaths: string[],
): Promise<
  | { status: "pending" }
  | { status: "complete"; files: WebsiteFile[] }
  | { status: "failed"; error: string }
> {
  const poll = await retrieveBackgroundStructuredResponse(responseId);
  if (poll.status === "complete") {
    try {
      return {
        status: "complete",
        files: parseEditedFiles(poll.outputText, new Set(allowedPaths)),
      };
    } catch (error) {
      return {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse the edited website.",
      };
    }
  }
  return poll;
}

export async function applyMockWebsiteEdit(
  websiteId: string,
  instruction: string,
  filesToEdit: WebsiteFile[],
  idToken: string,
  imagePlan?: WebsiteImagePlan,
): Promise<WebsiteFile[]> {
  console.log("[mock-ai] Applying mock edit");
  await mockDelay(700);
  await chargeTokens(MOCK_TOKEN_USAGE.edit, 0, undefined, "edit");
  const updatedFiles = mockEditWebsite(filesToEdit, instruction, imagePlan);
  await updateWebsiteFiles(websiteId, updatedFiles, idToken);
  return updatedFiles;
}
