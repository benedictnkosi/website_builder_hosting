import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getWebsiteDirectory,
  readEditableWebsiteFiles,
} from "@/lib/file-manager";
import { GeneratorError, isValidWebsiteId, normalizeRelativePath } from "@/lib/validation";
import type { WebsiteFile } from "@/lib/types";
import {
  isMockAiEnabled,
  mockDelay,
  mockEditWebsite,
} from "@/lib/mock-ai";
import { hasActiveSubscription } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
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

const SYSTEM_INSTRUCTION = `You are an expert web developer. You will be given the current text files of a website (HTML, CSS, JS) and a user request to change something. Apply the requested change and return ONLY the files that were modified with their full updated content. Do not return files that were not changed.

Do not modify or return image files. Image paths in HTML should stay as they are unless the user explicitly asks to change them.

If adding or updating a contact form, submit with fetch() POST JSON to the existing contact API endpoint. Never add API keys, Resend secrets, or server-side code.

Return ONLY the structured output with the updated files.`;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const websiteId =
    typeof body === "object" && body !== null && "websiteId" in body && typeof body.websiteId === "string"
      ? body.websiteId
      : null;
  const instruction =
    typeof body === "object" && body !== null && "instruction" in body && typeof body.instruction === "string"
      ? body.instruction
      : null;

  if (!websiteId || !isValidWebsiteId(websiteId) || !instruction) {
    return NextResponse.json(
      { success: false, error: "websiteId and instruction are required." },
      { status: 400 },
    );
  }

  if (!(await hasActiveSubscription(websiteId))) {
    return NextResponse.json(
      {
        success: false,
        error: "Subscribe to make changes to your website.",
        paywall: true,
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let editableFiles: WebsiteFile[];

  try {
    editableFiles = await readEditableWebsiteFiles(websiteId);
  } catch (error) {
    const message =
      error instanceof GeneratorError
        ? error.message
        : "Could not read website files.";
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }

  const filesContext = editableFiles
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join("\n\n");

  const userMessage = `Here are the current website files:\n\n${filesContext}\n\n---\n\nUser request: ${instruction}`;

  if (isMockAiEnabled()) {
    console.log("[mock-ai] Applying mock edit");
    await mockDelay(700);
    const updatedFiles = mockEditWebsite(editableFiles, instruction);
    const websiteDir = getWebsiteDirectory(websiteId);

    for (const file of updatedFiles) {
      const normalizedPath = normalizeRelativePath(file.path);
      const dest = path.resolve(websiteDir, normalizedPath);
      if (!dest.startsWith(websiteDir)) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, file.content, "utf8");
    }

    return NextResponse.json({
      success: true,
      updatedFiles,
    });
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: 16384,
        input: [
          { role: "developer", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "edited_website",
            strict: true,
            schema: EDIT_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      console.error("OpenAI edit error:", response.status, errorBody);
      const apiMessage = errorBody?.error?.message as string | undefined;
      throw new GeneratorError(
        apiMessage?.includes("context window")
          ? "The website is too large to edit in one request. Try a smaller change."
          : apiMessage || "Edit request failed.",
        502,
      );
    }

    const payload = await response.json();

    let outputText = "";
    if (payload.output_text && typeof payload.output_text === "string") {
      outputText = payload.output_text;
    } else if (Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (Array.isArray(item.content)) {
          for (const part of item.content) {
            if (typeof part.text === "string" && part.text.trim()) {
              outputText = part.text;
              break;
            }
          }
        }
        if (outputText) break;
      }
    }

    if (!outputText) {
      return NextResponse.json(
        { success: false, error: "No response from AI." },
        { status: 502 },
      );
    }

    const result = JSON.parse(outputText) as { files: WebsiteFile[] };
    const editablePaths = new Set(editableFiles.map((file) => file.path));
    const websiteDir = getWebsiteDirectory(websiteId);

    for (const file of result.files) {
      const normalizedPath = normalizeRelativePath(file.path);
      if (!editablePaths.has(normalizedPath)) {
        continue;
      }

      const dest = path.resolve(websiteDir, normalizedPath);
      if (!dest.startsWith(websiteDir)) continue;

      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, file.content, "utf8");
    }

    return NextResponse.json({
      success: true,
      updatedFiles: result.files.filter((file) =>
        editablePaths.has(normalizeRelativePath(file.path)),
      ),
    });
  } catch (error) {
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("Edit error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to apply changes. Please try again." },
      { status: 500 },
    );
  }
}
