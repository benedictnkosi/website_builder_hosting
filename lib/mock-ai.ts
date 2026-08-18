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

function extractBusinessName(text: string): string {
  const named = text.match(
    /(?:called|named|business name[:\s]+|company called)\s+([^.\n,]+)/i,
  );
  if (named?.[1]) {
    return named[1].trim();
  }

  const firstLine = text.split("\n")[0]?.trim();
  if (firstLine && firstLine.length <= 60) {
    return firstLine.replace(/\.$/, "");
  }

  return "Demo Business";
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
    message,
    whatsapp_preference,
    whatsapp_number: whatsappNumber,
  };
}

export function mockGenerateWebsite(prompt: string): GeneratedWebsite {
  const businessName = extractBusinessName(prompt);
  const phone = extractPhone(prompt) ?? "000 000 0000";
  const whatsapp = extractWhatsAppNumber(prompt) || phone;
  const includeMap = /address|map|street|road|avenue|durban|johannesburg|cape town/i.test(
    prompt,
  );
  const includeWhatsApp =
    /whatsapp/i.test(prompt) || Boolean(extractWhatsAppNumber(prompt));

  const mapSection = includeMap
    ? `<section id="map">
    <h2>Find us</h2>
    <iframe title="Map" width="100%" height="280" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(prompt.match(/address[:\s]+([^\n]+)/i)?.[1]?.trim() || "Durban")}&output=embed"></iframe>
  </section>`
    : "";

  const whatsappButton = includeWhatsApp
    ? `<a class="whatsapp" href="https://wa.me/${whatsapp.replace(/\D/g, "")}">WhatsApp us</a>`
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
  </main>
  <script src="script.js"></script>
</body>
</html>`;

  const stylesCss = `* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; color: #1c1917; background: #fafaf9; }
header, main { max-width: 960px; margin: 0 auto; padding: 24px; }
.hero img { width: 100%; max-height: 320px; object-fit: cover; border-radius: 16px; }
.whatsapp { display: inline-block; margin-top: 12px; padding: 10px 16px; background: #128c7e; color: white; text-decoration: none; border-radius: 999px; }
#map iframe { border-radius: 16px; }`;

  const scriptJs = `document.addEventListener("DOMContentLoaded", () => {
  console.log("Mock website loaded for ${businessName.replace(/"/g, '\\"')}");
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

export function mockEditWebsite(
  files: WebsiteFile[],
  instruction: string,
): WebsiteFile[] {
  const phoneMatch =
    instruction.match(/(?:phone|number|it's|is)\s*[:\s]*([+\d][\d\s-]{8,})/i) ??
    instruction.match(/\b(0\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/);

  const updated: WebsiteFile[] = [];

  for (const file of files) {
    if (file.path !== "index.html") {
      continue;
    }

    let content = file.content;

    if (phoneMatch) {
      const phone = phoneMatch[1].trim();
      const tel = phone.replace(/\s/g, "");
      content = content.replace(/href="tel:[^"]+"/g, `href="tel:${tel}"`);
      content = content.replace(
        /Phone:\s*<a href="tel:[^"]+">[^<]+<\/a>/,
        `Phone: <a href="tel:${tel}">${phone}</a>`,
      );
      content = content.replace(
        /\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
        phone,
      );
    } else {
      content = content.replace(
        "</body>",
        `  <!-- Mock edit applied: ${instruction.replace(/-->/g, "")} -->\n</body>`,
      );
    }

    updated.push({ path: file.path, content });
  }

  if (updated.length === 0) {
    const fallback = files.find((file) => file.path.endsWith(".html"));
    if (fallback) {
      updated.push({
        path: fallback.path,
        content: `${fallback.content}\n<!-- Mock edit: ${instruction} -->`,
      });
    }
  }

  return updated;
}
