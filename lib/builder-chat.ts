import type { ChatMessage, IntakeChatResult } from "@/lib/intake";
import { hasEnoughIntakeToGenerate, lastUserMessageIsConfirmation } from "@/lib/intake";

export const BUILDER_WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business, or upload one flyer, business card, or PDF if you have one.\n\nI'll need this information:\n\n- Business name\n- About us\n- List of services\n- Contact number\n- WhatsApp number, if WhatsApp is required\n- Email address, if a contact form is required\n- Trading hours, if you have them";

export const BUILDER_READY_MESSAGE =
  "Your website is ready. Preview it, describe any changes, or attach one photo to replace an image. Subscribe when you want to deploy it live.";

export function intakeReadyToBuild(
  result: Pick<IntakeChatResult, "complete" | "intake">,
  history: ChatMessage[],
): boolean {
  return (
    result.complete ||
    (hasEnoughIntakeToGenerate(result.intake) &&
      (Boolean(result.intake.user_confirmed) || lastUserMessageIsConfirmation(history)))
  );
}
