import { extractBusinessName } from "./domain-name";
import type { GeneratedWebsite, WebsiteFile, WebsiteImageRequest } from "./types";

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function isMockAiEnabled(): boolean {
  if (process.env.MOCK_AI === "false") {
    return false;
  }
  if (process.env.MOCK_AI === "true") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}

export async function mockDelay(ms = 600): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPhone(text: string): string | null {
  const labeled =
    text.match(/phone[:\s]+([+\d][\d\s-]{8,})/i) ??
    text.match(/\b(0\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/);
  return labeled?.[1]?.trim() ?? null;
}

function extractWhatsAppNumber(text: string): string {
  const match = text.match(/whatsapp[:\s]+([+\d][\d\s-]{8,})/i);
  return match?.[1]?.trim() ?? "";
}

function extractContactEmail(text: string): string {
  const labeled = text.match(/set "to" to "([^"]+)"/i);
  if (labeled?.[1]) {
    return labeled[1].trim();
  }
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? "";
}

function extractContactEndpoint(text: string): string {
  const match = text.match(/https?:\/\/[^\s]+\/api\/contact/i);
  return match?.[0] ?? "/api/contact";
}

export function mockValidateDescription(prompt: string) {
  const text = prompt.trim();
  const hasPhone = Boolean(extractPhone(text));
  const hasServices =
    /service|repair|provide|offer|install|renovation|product/i.test(text);
  const hasBusiness = text.length > 15 && !/^\d+$/.test(text);

  const missing_fields: Array<"business" | "services" | "phone"> = [];
  if (!hasBusiness) missing_fields.push("business");
  if (!hasServices) missing_fields.push("services");
  if (!hasPhone) missing_fields.push("phone");

  const whatsappNumber = extractWhatsAppNumber(text);
  let whatsapp_preference: "yes" | "no" | "unknown" = "unknown";

  if (/whatsapp/i.test(text)) {
    whatsapp_preference = /no whatsapp|without whatsapp/i.test(text)
      ? "no"
      : "yes";
  }

  const message =
    missing_fields.length === 0
      ? ""
      : missing_fields.includes("business") &&
          missing_fields.includes("services") &&
          missing_fields.includes("phone")
        ? "Please provide your business name, the services you offer, and your phone number."
        : `Please provide your ${missing_fields.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;

  return {
    valid: missing_fields.length === 0,
    missing_fields,
    business_name: extractBusinessName(text) || "Demo Business",
    message,
    whatsapp_preference,
    whatsapp_number: whatsappNumber,
  };
}

export function mockGenerateWebsite(prompt: string): GeneratedWebsite {
  const businessName = extractBusinessName(prompt) || "Demo Business";
  const phone = extractPhone(prompt) ?? "000 000 0000";
  const whatsapp = extractWhatsAppNumber(prompt) || phone;
  const includeMap = /address|map|street|road|avenue|durban|johannesburg|cape town/i.test(
    prompt,
  );
  const includeWhatsApp =
    /whatsapp/i.test(prompt) || Boolean(extractWhatsAppNumber(prompt));
  const includeContactForm = /contact us form|contact form/i.test(prompt);
  const contactEmail = extractContactEmail(prompt);
  const contactEndpoint = extractContactEndpoint(prompt);

  const mapSection = includeMap
    ? `<section id="map">
    <h2>Find us</h2>
    <iframe title="Map" width="100%" height="280" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(prompt.match(/address[:\s]+([^\n]+)/i)?.[1]?.trim() || "Durban")}&output=embed"></iframe>
  </section>`
    : "";

  const whatsappButton = includeWhatsApp
    ? `<a class="whatsapp" href="https://wa.me/${whatsapp.replace(/\D/g, "")}">WhatsApp us</a>`
    : "";

  const contactSection =
    includeContactForm && contactEmail
      ? `<section id="contact">
    <h2>Contact us</h2>
    <form id="contact-form">
      <label>Name <input name="name" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Phone <input name="phone" type="tel"></label>
      <label>Message <textarea name="message" required></textarea></label>
      <button type="submit">Send message</button>
      <p id="contact-status" role="status"></p>
    </form>
  </section>`
      : "";

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${businessName}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>${businessName}</h1>
    <p>Mock website generated locally for testing.</p>
  </header>
  <main>
    <section class="hero">
      <img src="images/hero.png" alt="${businessName}">
      <p>Phone: <a href="tel:${phone.replace(/\s/g, "")}">${phone}</a></p>
      ${whatsappButton}
    </section>
    ${mapSection}
    ${contactSection}
  </main>
  <script src="script.js"></script>
</body>
</html>`;

  const stylesCss = `* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; color: #1c1917; background: #fafaf9; }
header, main { max-width: 960px; margin: 0 auto; padding: 24px; }
.hero img { width: 100%; max-height: 320px; object-fit: cover; border-radius: 16px; }
.whatsapp { display: inline-block; margin-top: 12px; padding: 10px 16px; background: #128c7e; color: white; text-decoration: none; border-radius: 999px; }
#map iframe { border-radius: 16px; }
#contact form { display: grid; gap: 12px; }
#contact input, #contact textarea { width: 100%; padding: 10px 12px; border: 1px solid #d6d3d1; border-radius: 10px; }
#contact button { justify-self: start; padding: 10px 16px; background: #115e59; color: white; border: 0; border-radius: 999px; }
#contact-status { min-height: 1.2em; color: #57534e; }`;

  const escapedBusiness = businessName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const scriptJs = `document.addEventListener("DOMContentLoaded", () => {
  console.log("Mock website loaded for ${escapedBusiness}");
  const form = document.getElementById("contact-form");
  const status = document.getElementById("contact-status");
  if (!form || !status) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Sending...";
    try {
      const data = new FormData(form);
      const response = await fetch("${contactEndpoint}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId: "__WEBSITE_ID__",
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone") || "",
          message: data.get("message"),
          businessName: "${escapedBusiness}",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to send");
      }
      status.textContent = "Thanks, your message has been sent.";
      form.reset();
    } catch {
      status.textContent = "Sorry, we could not send your message. Please try again.";
    }
  });
});`;

  return {
    files: [
      { path: "index.html", content: indexHtml },
      { path: "styles.css", content: stylesCss },
      { path: "script.js", content: scriptJs },
    ],
    images: [
      {
        path: "images/hero.png",
        prompt: `Hero image for ${businessName}`,
      },
    ],
  };
}

export function mockGenerateImages(
  requests: WebsiteImageRequest[],
): WebsiteFile[] {
  return requests.map((request) => ({
    path: request.path,
    content: MOCK_PNG_BASE64,
    encoding: "base64" as const,
  }));
}

export function mockPlanEditFiles(
  instruction: string,
  manifest: Array<{ path: string; type: string }>,
): string[] {
  const text = instruction.toLowerCase();
  const pathsFor = (type: string) =>
    manifest.filter((entry) => entry.type === type).map((entry) => entry.path);

  const adding = /\b(add|remove|new|create|delete)\b/.test(text);
  const styleOnly =
    /\b(colo(?:u)?r|green|blue|red|white|black|background|font|padding|margin|border|hover|shadow|opacity)\b/.test(
      text,
    );
  const behavior =
    /\b(click|submit|fetch|javascript|animation|toggle|dropdown|scroll|validate)\b/.test(
      text,
    );

  if (styleOnly && !adding && !behavior) {
    const css = pathsFor("css");
    if (css.length > 0) return css;
  }

  if (behavior && !adding) {
    const js = pathsFor("javascript");
    if (js.length > 0) return js;
  }

  if (adding) {
    const selected = [...pathsFor("html"), ...pathsFor("css")];
    if (behavior) selected.push(...pathsFor("javascript"));
    if (selected.length > 0) return [...new Set(selected)];
  }

  const html = pathsFor("html");
  if (html.length > 0 && !styleOnly && !behavior) {
    return html;
  }

  return manifest.map((entry) => entry.path);
}

export function mockEditWebsite(
  files: WebsiteFile[],
  instruction: string,
): WebsiteFile[] {
  const phoneMatch =
    instruction.match(/(?:phone|number|it's|is)\s*[:\s]*([+\d][\d\s-]{8,})/i) ??
    instruction.match(/\b(0\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/);
  const wantsGreen = /\bgreen\b/i.test(instruction);
  const note = instruction.replace(/-->/g, "").replace(/\*\//g, "");
  const updated: WebsiteFile[] = [];

  for (const file of files) {
    if (file.path.endsWith(".css") && wantsGreen) {
      let content = file.content;
      if (/\.whatsapp\s*\{[^}]*background\s*:/i.test(content)) {
        content = content.replace(
          /(\.whatsapp\s*\{[^}]*background:\s*)[^;]+/i,
          "$1#25d366",
        );
      } else {
        content = `${content}\n/* Mock edit applied: ${note} */`;
      }
      updated.push({ path: file.path, content });
      continue;
    }

    if (file.path.endsWith(".html")) {
      let content = file.content;

      if (phoneMatch) {
        const phone = phoneMatch[1].trim();
        const tel = phone.replace(/\s/g, "");
        content = content.replace(/href="tel:[^"]+"/g, `href="tel:${tel}"`);
        content = content.replace(
          /Phone:\s*<a href="tel:[^"]+">[^<]+<\/a>/,
          `Phone: <a href="tel:${tel}">${phone}</a>`,
        );
        content = content.replace(/\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, phone);
      } else if (content.includes("</body>")) {
        content = content.replace(
          "</body>",
          `  <!-- Mock edit applied: ${note} -->\n</body>`,
        );
      } else {
        content = `${content}\n<!-- Mock edit applied: ${note} -->`;
      }

      updated.push({ path: file.path, content });
      continue;
    }

    updated.push({
      path: file.path,
      content: `${file.content}\n/* Mock edit applied: ${note} */`,
    });
  }

  return updated;
}
