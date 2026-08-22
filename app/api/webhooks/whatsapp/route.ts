import {
  handleWhatsAppVerification,
  handleWhatsAppWebhook,
} from "@/lib/whatsapp-webhook";
import { after } from "next/server";
import { processWhatsAppConversationMessage } from "@/lib/whatsapp-conversation";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  return handleWhatsAppVerification(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleWhatsAppWebhook(request, process.env, {
    onMessage(message) {
      after(async () => {
        try {
          await processWhatsAppConversationMessage(message);
        } catch (error) {
          console.error("WhatsApp background processing failed", {
            error: error instanceof Error ? error.name : "UnknownError",
          });
        }
      });
    },
  });
}
