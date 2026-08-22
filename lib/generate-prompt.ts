import { compileBusinessDescription, type WebsiteIntake } from "@/lib/intake";
import { getPeopleEthnicityOption } from "@/lib/people-ethnicity";

export function buildWebsiteGeneratePrompt(intake: WebsiteIntake, origin: string): string {
  const promptParts = [compileBusinessDescription(intake)];

  if (intake.about.trim()) {
    promptParts.push(
      `About the business:\n${intake.about.trim()}
Include an About section with id="about" using this information. Do not invent extra history, years in business, credentials, or awards.`,
    );
  }

  if (intake.address.trim()) {
    promptParts.push(
      `Business address: ${intake.address.trim()}\nInclude an embedded Google Map on the website showing this location.`,
    );
  }

  if (intake.use_whatsapp === "yes") {
    const number = intake.whatsapp_number.trim() || intake.phone.trim();
    if (number) {
      promptParts.push(
        `Add a WhatsApp contact button or link on the website using this WhatsApp number: ${number}. The business phone number for calls may be different — show both correctly if they differ.`,
      );
    }
  }

  if (intake.use_contact_form === "yes" && intake.contact_email.trim()) {
    promptParts.push(
      `Include a Contact Us form with name, email, and message fields (phone optional).
When the form is submitted, send a fetch POST with JSON to this contact API endpoint: ${origin.replace(/\/$/, "")}/api/contact
JSON body fields: websiteId, name, email, phone, message, businessName.
Set websiteId to "__WEBSITE_ID__". Do not send a recipient "to" address.
Show success and error messages on the page without a full reload.
Do not include API keys, Resend secrets, or any server-side code in the website files.
Do not use mailto: as the primary submit method.`,
    );
  }

  if (intake.use_trading_hours === "yes" && intake.trading_hours.trim()) {
    promptParts.push(
      `Trading hours:\n${intake.trading_hours.trim()}
Include a trading hours section with id="hours" using exactly these hours. Link it in the nav. Do not invent extra days, times, or public-holiday notes they did not provide.`,
    );
  } else {
    promptParts.push(
      "The business did not provide trading hours. Do not add a trading hours, opening hours, or hours of business section, and do not invent hours.",
    );
  }

  const ethnicity = getPeopleEthnicityOption(intake.people_ethnicity);
  if (ethnicity) {
    promptParts.push(
      `People in website photos: ${ethnicity.prompt}. If an image includes people, they should be ${ethnicity.prompt}. Include this in every image prompt that depicts people.`,
    );
  }

  if (intake.design_preference.trim()) {
    promptParts.push(
      `Design preference: ${intake.design_preference.trim()}
Follow this closely in layout, colours, typography, and overall mood. If an instruction conflicts with keeping the site professional and usable, keep it usable and still honour the preference as far as possible.`,
    );
  }

  if (intake.extra_details.trim()) {
    promptParts.push(
      `Additional details from the customer:\n${intake.extra_details.trim()}
Use these details on the website where they fit. Do not invent extras beyond what they provided.`,
    );
  }

  return promptParts.join("\n\n");
}
