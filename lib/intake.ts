import { isValidEmail } from "./email";
import { getPeopleEthnicityOption, type PeopleEthnicityId } from "./people-ethnicity";

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type WhatsAppPreference = "yes" | "no" | "unknown";
export type ContactFormPreference = "yes" | "no" | "unknown";
export type TradingHoursPreference = "yes" | "no" | "unknown";

export type WebsiteIntake = {
  business_name: string;
  about: string;
  services: string;
  phone: string;
  use_whatsapp: WhatsAppPreference;
  whatsapp_number: string;
  use_contact_form: ContactFormPreference;
  contact_email: string;
  use_trading_hours: TradingHoursPreference;
  trading_hours: string;
  people_ethnicity: PeopleEthnicityId | "";
  design_preference: string;
  design_preference_resolved: boolean;
  extra_details: string;
  user_confirmed: boolean;
  address: string;
  flyer_uploaded: boolean;
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
  if (intake.use_trading_hours === "unknown") missing.push("use_trading_hours");
  if (intake.use_trading_hours === "yes" && !intake.trading_hours.trim()) {
    missing.push("trading_hours");
  }
  if (!getPeopleEthnicityOption(intake.people_ethnicity)) missing.push("people_ethnicity");
  if (!intake.design_preference_resolved) missing.push("design_preference");
  if (!intake.user_confirmed) missing.push("user_confirmed");

  return missing;
}

export function isIntakeComplete(intake: WebsiteIntake): boolean {
  return missingIntakeFields(intake).length === 0;
}

export function hasCoreIntakeForWebsite(intake: WebsiteIntake | null | undefined): boolean {
  if (!intake) return false;
  if (!intake.business_name.trim() || !intake.about.trim() || !intake.services.trim() || !intake.phone.trim()) {
    return false;
  }
  if (intake.use_whatsapp === "unknown") return false;
  if (intake.use_whatsapp === "yes" && !(intake.whatsapp_number.trim() || intake.phone.trim())) {
    return false;
  }
  if (intake.use_contact_form === "unknown") return false;
  if (intake.use_contact_form === "yes" && !isValidEmail(intake.contact_email)) {
    return false;
  }
  if (intake.use_trading_hours === "unknown") return false;
  if (intake.use_trading_hours === "yes" && !intake.trading_hours.trim()) {
    return false;
  }
  return true;
}

export function hasEnoughIntakeToGenerate(intake: WebsiteIntake | null | undefined): boolean {
  return hasCoreIntakeForWebsite(intake);
}

export function isIntakeConfirmation(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  return /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|let'?s go|start|proceed|build(?: it)?|do it|confirm|sounds good|looks good|i'?m (?:happy|ready)|happy to proceed)(?:\s*[.!]*)?$/.test(
    value,
  );
}

export function lastUserMessageIsConfirmation(messages: ChatMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return isIntakeConfirmation(messages[index].content);
    }
  }
  return false;
}

export function mergeWebsiteIntake(
  prior: WebsiteIntake | null | undefined,
  next: WebsiteIntake,
): WebsiteIntake {
  if (!prior) return next;
  return {
    business_name: next.business_name.trim() || prior.business_name,
    about: next.about.trim() || prior.about,
    services: next.services.trim() || prior.services,
    phone: next.phone.trim() || prior.phone,
    use_whatsapp: next.use_whatsapp !== "unknown" ? next.use_whatsapp : prior.use_whatsapp,
    whatsapp_number: next.whatsapp_number.trim() || prior.whatsapp_number,
    use_contact_form:
      next.use_contact_form !== "unknown" ? next.use_contact_form : prior.use_contact_form,
    contact_email: next.contact_email.trim() || prior.contact_email,
    use_trading_hours:
      next.use_trading_hours !== "unknown" ? next.use_trading_hours : prior.use_trading_hours,
    trading_hours: next.trading_hours.trim() || prior.trading_hours,
    people_ethnicity: next.people_ethnicity || prior.people_ethnicity,
    design_preference: next.design_preference.trim() || prior.design_preference,
    design_preference_resolved:
      next.design_preference_resolved || prior.design_preference_resolved,
    extra_details: next.extra_details.trim() || prior.extra_details,
    user_confirmed: next.user_confirmed || prior.user_confirmed,
    address: "",
    flyer_uploaded: next.flyer_uploaded || prior.flyer_uploaded,
  };
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
    use_trading_hours: "unknown",
    trading_hours: "",
    people_ethnicity: "",
    design_preference: "",
    design_preference_resolved: false,
    extra_details: "",
    user_confirmed: false,
    address: "",
    flyer_uploaded: false,
  };
}

function yesNoUnknown(value: unknown): WhatsAppPreference {
  return value === "yes" || value === "no" ? value : "unknown";
}

export function coerceWebsiteIntake(raw: unknown): WebsiteIntake {
  const base = emptyWebsiteIntake();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;
  const ethnicity =
    typeof data.people_ethnicity === "string" && getPeopleEthnicityOption(data.people_ethnicity)
      ? (data.people_ethnicity as PeopleEthnicityId)
      : "";

  const intake: WebsiteIntake = {
    business_name: typeof data.business_name === "string" ? data.business_name : "",
    about: typeof data.about === "string" ? data.about.trim() : "",
    services: typeof data.services === "string" ? data.services : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    use_whatsapp: yesNoUnknown(data.use_whatsapp),
    whatsapp_number: typeof data.whatsapp_number === "string" ? data.whatsapp_number : "",
    use_contact_form: yesNoUnknown(data.use_contact_form),
    contact_email: typeof data.contact_email === "string" ? data.contact_email : "",
    use_trading_hours: yesNoUnknown(data.use_trading_hours),
    trading_hours: typeof data.trading_hours === "string" ? data.trading_hours.trim() : "",
    people_ethnicity: ethnicity,
    design_preference:
      typeof data.design_preference === "string" ? data.design_preference.trim() : "",
    design_preference_resolved: Boolean(data.design_preference_resolved),
    extra_details: typeof data.extra_details === "string" ? data.extra_details.trim() : "",
    user_confirmed: Boolean(data.user_confirmed),
    address: typeof data.address === "string" ? data.address : "",
    flyer_uploaded: Boolean(data.flyer_uploaded),
  };

  if (intake.use_whatsapp === "yes" && !intake.whatsapp_number.trim()) {
    intake.whatsapp_number = intake.phone;
  }
  if (intake.trading_hours && intake.use_trading_hours === "unknown") {
    intake.use_trading_hours = "yes";
  }
  if (intake.design_preference && !intake.design_preference_resolved) {
    intake.design_preference_resolved = true;
  }

  return intake;
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
    "The customer stopped intake before finishing. Build the best professional website possible from the information above. Do not invent a business name, about story, services, phone number, email, or address that were not provided.";

  if (notes && !extra) {
    next.extra_details = `${notes}\n\n${fallbackNote}`;
  } else if (notes && !extra.includes(notes)) {
    next.extra_details = `${extra}\n\nDetails from the conversation:\n${notes}\n\n${fallbackNote}`;
  } else if (extra && !extra.includes("stopped intake before finishing")) {
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
  if (next.use_trading_hours === "unknown" || (next.use_trading_hours === "yes" && !next.trading_hours.trim())) {
    next.use_trading_hours = "no";
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
    intake.use_trading_hours === "yes" && intake.trading_hours.trim()
      ? `Trading hours: ${intake.trading_hours.trim()}`
      : "",
  ].filter(Boolean);

  const compiled = parts.join(". ").replace(/\.\./g, ".");
  if (compiled) return compiled;
  return intake.extra_details.trim() || "A small business website.";
}
