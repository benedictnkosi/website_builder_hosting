import { NextResponse } from "next/server";
import { GeneratorError } from "@/lib/validation";
import {
  isMockAiEnabled,
  mockDelay,
  mockValidateDescription,
} from "@/lib/mock-ai";

export const runtime = "nodejs";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.5";

const VALIDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["missing_fields", "message", "whatsapp_preference", "whatsapp_number"],
  properties: {
    missing_fields: {
      type: "array",
      items: {
        type: "string",
        enum: ["business", "services", "phone"],
      },
    },
    message: {
      type: "string",
      description:
        "A friendly message to the user listing what information is missing. Empty string if nothing is missing.",
    },
    whatsapp_preference: {
      type: "string",
      enum: ["yes", "no", "unknown"],
      description:
        "Whether the user wants WhatsApp on the website. yes if they want it or provided a WhatsApp number. no if they declined. unknown if not mentioned.",
    },
    whatsapp_number: {
      type: "string",
      description:
        "WhatsApp number if provided. Empty string if not provided or WhatsApp is not wanted. May differ from the main phone number.",
    },
  },
} as const;

const SYSTEM_INSTRUCTION = `You are an assistant that checks whether a business description contains enough information to generate a website.

Required fields:
- business: The business name or clear identity of the business.
- services: A description of what services or products the business provides.
- phone: A phone number for the business.

Also extract WhatsApp details from the description:
- whatsapp_preference: "yes" if the user wants WhatsApp, provided a WhatsApp number, or asked to use a number for WhatsApp. "no" if they explicitly do not want WhatsApp. "unknown" if WhatsApp was not mentioned.
- whatsapp_number: The WhatsApp number if explicitly provided (e.g. "WhatsApp: 082 123 4567"). Empty string if not provided or WhatsApp is not wanted. The WhatsApp number and main phone number may be different — extract each separately when given.

Analyse the user's description and return which required fields are missing. If all required fields are present, return an empty missing_fields array and empty message.

If fields are missing, write a short friendly message telling the user what to add to their description.`;

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

  const prompt =
    typeof body === "object" &&
    body !== null &&
    "prompt" in body &&
    typeof body.prompt === "string"
      ? body.prompt
      : null;

  if (!prompt) {
    return NextResponse.json(
      { success: false, error: "A prompt string is required." },
      { status: 400 },
    );
  }

  if (isMockAiEnabled()) {
    await mockDelay();
    const result = mockValidateDescription(prompt);
    return NextResponse.json({ success: true, ...result });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
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
        max_output_tokens: 1024,
        input: [
          { role: "developer", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "validation_result",
            strict: true,
            schema: VALIDATION_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      console.error("OpenAI validation error:", response.status, errorBody);
      throw new GeneratorError("Validation request failed.", 502);
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
    console.log("Validate outputText:", outputText);

    if (!outputText) {
      return NextResponse.json({
        success: true,
        valid: false,
        missing_fields: ["business", "services", "phone"],
        message:
          "Please make sure your description includes: your business name, the services/products you offer, and your phone number.",
      });
    }

    let result: {
      missing_fields: string[];
      message: string;
      whatsapp_preference: "yes" | "no" | "unknown";
      whatsapp_number: string;
    };
    try {
      result = JSON.parse(outputText);
    } catch {
      return NextResponse.json({
        success: true,
        valid: false,
        missing_fields: ["business", "services", "phone"],
        message:
          "Please make sure your description includes: your business name, the services/products you offer, and your phone number.",
      });
    }

    return NextResponse.json({
      success: true,
      valid: result.missing_fields.length === 0,
      missing_fields: result.missing_fields,
      message: result.message,
      whatsapp_preference: result.whatsapp_preference ?? "unknown",
      whatsapp_number: result.whatsapp_number ?? "",
    });
  } catch (error) {
    console.error("Validation error:", error);
    if (error instanceof GeneratorError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      {
        success: true,
        valid: false,
        missing_fields: ["business", "services", "phone"],
        message:
          "Please make sure your description includes: your business name, the services/products you offer, and your phone number.",
      },
      { status: 200 },
    );
  }
}
