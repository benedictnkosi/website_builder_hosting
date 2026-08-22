import {
  handleWhatsAppVerification,
  handleWhatsAppWebhook,
} from "@/lib/whatsapp-webhook";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  return handleWhatsAppVerification(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleWhatsAppWebhook(request);
}
