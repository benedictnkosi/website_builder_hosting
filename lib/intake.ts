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
  about: string;
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
  if (!intake.about.trim()) missing.push("about");
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

export function emptyWebsiteIntake(): WebsiteIntake {
  return {
    business_name: "",
    about: "",
    services: "",
    phone: "",
    use_whatsapp: "unknown",
    whatsapp_number: "",
    use_contact_form: "unknown",
    contact_email: "",
    people_ethnicity: "",
    design_preference: "",
    design_preference_resolved: false,
    extra_details: "",
    user_confirmed: false,
    address: "",
  };
}

function conversationNotes(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n");
}

export function intakeFromPartialChat(
  intake: WebsiteIntake | null,
  messages: ChatMessage[],
): WebsiteIntake {
  const next: WebsiteIntake = { ...(intake ?? emptyWebsiteIntake()) };
  const notes = conversationNotes(messages);
  const extra = next.extra_details.trim();
  const fallbackNote =
    "The customer ran out of chat tokens before finishing intake. Build the best professional website possible from the information above. Do not invent a business name, about story, services, phone number, email, or address that were not provided.";

  if (notes && !extra) {
    next.extra_details = `${notes}\n\n${fallbackNote}`;
  } else if (notes && !extra.includes(notes)) {
    next.extra_details = `${extra}\n\nDetails from the conversation:\n${notes}\n\n${fallbackNote}`;
  } else if (extra && !extra.includes("ran out of chat tokens")) {
    next.extra_details = `${extra}\n\n${fallbackNote}`;
  } else if (!extra) {
    next.extra_details = fallbackNote;
  }

  if (next.use_whatsapp === "unknown") {
    next.use_whatsapp = "no";
  }
  if (next.use_whatsapp === "yes" && !next.whatsapp_number.trim()) {
    next.whatsapp_number = next.phone;
  }
  if (next.use_contact_form === "unknown") {
    next.use_contact_form = "no";
  }
  if (!next.design_preference_resolved) {
    next.design_preference_resolved = true;
  }
  next.user_confirmed = true;

  return next;
}

export function compileBusinessDescription(intake: WebsiteIntake): string {
  const parts = [
    intake.business_name.trim(),
    intake.about.trim() ? `About: ${intake.about.trim()}` : "",
    intake.services.trim(),
    intake.phone.trim() ? `Phone: ${intake.phone.trim()}` : "",
  ].filter(Boolean);

  const compiled = parts.join(". ").replace(/\.\./g, ".");
  if (compiled) return compiled;
  return intake.extra_details.trim() || "A small business website.";
}
