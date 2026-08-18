import { isValidEmail } from "./email";
import { getPeopleEthnicityOption, type PeopleEthnicityId } from "./people-ethnicity";

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type WhatsAppPreference = "yes" | "no" | "unknown";
export type ContactFormPreference = "yes" | "no" | "unknown";

export type WebsiteIntake = {
  business_name: string;
  services: string;
  phone: string;
  use_whatsapp: WhatsAppPreference;
  whatsapp_number: string;
  use_contact_form: ContactFormPreference;
  contact_email: string;
  people_ethnicity: PeopleEthnicityId | "";
  design_preference: string;
  design_preference_resolved: boolean;
  extra_details: string;
  user_confirmed: boolean;
  address: string;
};

export type IntakeChatResult = {
  reply: string;
  complete: boolean;
  intake: WebsiteIntake;
};

export function missingIntakeFields(intake: WebsiteIntake): string[] {
  const missing: string[] = [];

  if (!intake.business_name.trim()) missing.push("business_name");
  if (!intake.services.trim()) missing.push("services");
  if (!intake.phone.trim()) missing.push("phone");
  if (intake.use_whatsapp === "unknown") missing.push("use_whatsapp");
  if (intake.use_whatsapp === "yes" && !(intake.whatsapp_number.trim() || intake.phone.trim())) {
    missing.push("whatsapp_number");
  }
  if (intake.use_contact_form === "unknown") missing.push("use_contact_form");
  if (intake.use_contact_form === "yes" && !isValidEmail(intake.contact_email)) {
    missing.push("contact_email");
  }
  if (!getPeopleEthnicityOption(intake.people_ethnicity)) missing.push("people_ethnicity");
  if (!intake.design_preference_resolved) missing.push("design_preference");
  if (!intake.user_confirmed) missing.push("user_confirmed");

  return missing;
}

export function isIntakeComplete(intake: WebsiteIntake): boolean {
  return missingIntakeFields(intake).length === 0;
}

export function compileBusinessDescription(intake: WebsiteIntake): string {
  const parts = [
    intake.business_name.trim(),
    intake.services.trim(),
    intake.phone.trim() ? `Phone: ${intake.phone.trim()}` : "",
  ].filter(Boolean);

  return parts.join(". ").replace(/\.\./g, ".");
}
