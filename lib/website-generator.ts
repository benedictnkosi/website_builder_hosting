import { writeWebsiteFiles } from "./file-manager";
import { generateWebsiteImages } from "./image-generator";
import { generateWebsiteFromOpenAI } from "./openai";
import type { GenerateWebsiteResult } from "./types";
import { GeneratorError, validateGeneratedWebsite } from "./validation";

/**
 * Current flow: prompt -> OpenAI -> validate -> generate images -> write files.
 * Later this result can feed preview, edits, regeneration, and deploy.
 */
export async function generateWebsite(
  prompt: string,
  peopleEthnicity?: string,
  idToken?: string,
): Promise<GenerateWebsiteResult> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new GeneratorError("A website description is required.");
  }

  const generated = await generateWebsiteFromOpenAI(trimmedPrompt);
  const files = validateGeneratedWebsite(generated);
  const imageFiles = await generateWebsiteImages(
    generated.images ?? [],
    peopleEthnicity,
  );
  const allFiles = [...files, ...imageFiles];
  const websiteId = await writeWebsiteFiles(allFiles, idToken);

  return {
    success: true,
    websiteId,
  };
}
