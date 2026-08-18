import "server-only";

import { planRelevantEditFiles } from "@/lib/edit-planner";
import {
  readEditableWebsiteFiles,
  updateWebsiteFiles,
} from "@/lib/file-manager";
import { mockDelay, mockEditWebsite } from "@/lib/mock-ai";
import {
  BackgroundUnsupportedError,
  retrieveBackgroundStructuredResponse,
  runForegroundStructuredResponse,
  startBackgroundStructuredResponse,
} from "@/lib/openai";
import type { WebsiteFile } from "@/lib/types";
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

Do not modify or return image files. Image paths in HTML should stay as they are unless the user explicitly asks to change them.

If adding or updating a contact form, submit with fetch() POST JSON to the existing contact API endpoint. Send websiteId, name, email, phone, message, and businessName. Never send a recipient "to" address, API keys, Resend secrets, or server-side code.

Return ONLY the structured output with the updated files.`;

function filesContext(files: WebsiteFile[]): string {
  return files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
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
): Promise<WebsiteFile[]> {
  const userMessage = `Here are the website files that may need to change:\n\n${filesContext(filesToEdit)}\n\n---\n\nUser request: ${instruction}`;
  const outputText = await runForegroundStructuredResponse({
    model: OPENAI_MODEL,
    maxOutputTokens: 16384,
    developer: SYSTEM_INSTRUCTION,
    user: userMessage,
    schemaName: "edited_website",
    schema: EDIT_SCHEMA as unknown as Record<string, unknown>,
  });
  return parseEditedFiles(outputText, new Set(filesToEdit.map((file) => file.path)));
}

export async function prepareEditFiles(
  websiteId: string,
  instruction: string,
  idToken: string,
): Promise<WebsiteFile[]> {
  const editableFiles = await readEditableWebsiteFiles(websiteId, idToken);
  return planRelevantEditFiles(instruction, editableFiles);
}

export async function startWebsiteEditBackground(
  instruction: string,
  filesToEdit: WebsiteFile[],
): Promise<{ id: string; files?: WebsiteFile[] }> {
  const userMessage = `Here are the website files that may need to change:\n\n${filesContext(filesToEdit)}\n\n---\n\nUser request: ${instruction}`;
  const allowedPaths = new Set(filesToEdit.map((file) => file.path));

  try {
    const started = await startBackgroundStructuredResponse({
      model: OPENAI_MODEL,
      maxOutputTokens: 16384,
      developer: SYSTEM_INSTRUCTION,
      user: userMessage,
      schemaName: "edited_website",
      schema: EDIT_SCHEMA as unknown as Record<string, unknown>,
    });

    if (started.outputText) {
      return { id: started.id, files: parseEditedFiles(started.outputText, allowedPaths) };
    }

    return { id: started.id };
  } catch (error) {
    if (error instanceof BackgroundUnsupportedError) {
      return { id: "", files: await runSyncWebsiteEdit(instruction, filesToEdit) };
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
): Promise<WebsiteFile[]> {
  console.log("[mock-ai] Applying mock edit");
  await mockDelay(700);
  const updatedFiles = mockEditWebsite(filesToEdit, instruction);
  await updateWebsiteFiles(websiteId, updatedFiles, idToken);
  return updatedFiles;
}
