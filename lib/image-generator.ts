import sharp from "sharp";
import { GeneratorError, isSafeRelativePath, normalizeRelativePath } from "./validation";
import { getPeopleEthnicityOption } from "./people-ethnicity";
import type { WebsiteFile, WebsiteImageRequest } from "./types";
import { isMockAiEnabled, mockDelay, mockGenerateImages } from "./mock-ai";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_MODEL = "gpt-image-1-mini";
const IMAGE_SIZE = "1024x1024";
const IMAGE_QUALITY = "low";
const MAX_IMAGES = 3;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new GeneratorError(
      "OPENAI_API_KEY is not configured. Add it to your .env.local file.",
      500,
    );
  }

  return apiKey;
}

function validateImageRequest(request: WebsiteImageRequest): WebsiteImageRequest {
  if (!request || typeof request.path !== "string" || typeof request.prompt !== "string") {
    throw new GeneratorError("Each image request needs a path and prompt.");
  }

  const normalizedPath = normalizeRelativePath(request.path.trim());
  const prompt = request.prompt.trim();

  if (!isSafeRelativePath(request.path) || !isSafeRelativePath(normalizedPath)) {
    throw new GeneratorError(`Unsafe image path rejected: ${request.path}`);
  }

  if (!normalizedPath.startsWith("images/")) {
    throw new GeneratorError(
      `Image path must be under images/: ${request.path}`,
    );
  }

  if (!/\.(png|webp)$/i.test(normalizedPath)) {
    throw new GeneratorError(
      `Image path must end with .png or .webp: ${request.path}`,
    );
  }

  if (!prompt) {
    throw new GeneratorError(`Image prompt is required for ${request.path}`);
  }

  return { path: normalizedPath, prompt };
}

function withPeopleDirection(prompt: string, peopleEthnicity?: string): string {
  const option = getPeopleEthnicityOption(peopleEthnicity);
  if (!option) {
    return prompt;
  }

  return `${prompt}\n\nIf this image includes people, they should be ${option.prompt}. Photorealistic, respectful, professional photography.`;
}

async function generateImage(prompt: string): Promise<string> {
  const apiKey = getApiKey();

  let response: Response;

  try {
    response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new GeneratorError(
      aborted
        ? "Image generation timed out. Please try again."
        : "Unable to reach the OpenAI image API.",
      502,
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("OpenAI image error:", response.status, errorBody);
    const message =
      errorBody?.error?.message ||
      `Image generation failed with status ${response.status}.`;
    throw new GeneratorError(message, 502);
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
    usage?: unknown;
  };
  const b64 = payload.data?.[0]?.b64_json;

  if (!b64) {
    throw new GeneratorError("OpenAI returned an empty image.", 502);
  }

  return b64;
}

const COMPRESSED_MAX_WIDTH = 800;
const WEBP_QUALITY = 75;

async function compressPngToWebp(b64Png: string): Promise<string> {
  const input = Buffer.from(b64Png, "base64");
  const compressed = await sharp(input)
    .resize({ width: COMPRESSED_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return compressed.toString("base64");
}

export async function generateWebsiteImages(
  requests: WebsiteImageRequest[],
  peopleEthnicity?: string,
): Promise<WebsiteFile[]> {
  if (!requests.length) {
    return [];
  }

  const validated = requests
    .slice(0, MAX_IMAGES)
    .map((request) => validateImageRequest(request));

  const seen = new Set<string>();
  const unique: WebsiteImageRequest[] = [];

  for (const request of validated) {
    const key = request.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(request);
  }

  if (isMockAiEnabled()) {
    console.log("[mock-ai] Generating mock images");
    await mockDelay(400);
    return mockGenerateImages(unique);
  }

  const imageFiles: WebsiteFile[] = [];

  for (const request of unique) {
    imageFiles.push(await generateWebsiteImageFile(request, peopleEthnicity));
  }

  return imageFiles;
}

export async function generateWebsiteImageFile(
  request: WebsiteImageRequest,
  peopleEthnicity?: string,
): Promise<WebsiteFile> {
  const validated = validateImageRequest(request);
  console.log(`Generating image: ${validated.path}`);
  if (isMockAiEnabled()) {
    await mockDelay(400);
    const [file] = mockGenerateImages([validated]);
    if (!file) {
      throw new GeneratorError("Mock image generation failed.", 502);
    }
    return file;
  }
  const b64 = await generateImage(
    withPeopleDirection(validated.prompt, peopleEthnicity),
  );
  const compressed = await compressPngToWebp(b64);
  const webpPath = validated.path.replace(/\.png$/i, ".webp");
  return {
    path: webpPath,
    content: compressed,
    encoding: "base64",
  };
}
