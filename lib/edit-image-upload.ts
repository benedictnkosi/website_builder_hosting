import "server-only";

import sharp from "sharp";
import {
  INTAKE_UPLOAD_MAX_BYTES,
  isAllowedEditImageUploadType,
  sanitizeIntakeFilename,
  type IntakeUpload,
} from "./intake-upload";
import { GeneratorError } from "./validation";

const COMPRESSED_MAX_WIDTH = 800;
const WEBP_QUALITY = 75;

export function parseEditImageUpload(raw: unknown): IntakeUpload {
  if (!raw || typeof raw !== "object") {
    throw new GeneratorError("The uploaded photo was not readable. Please try again.", 400);
  }

  const data = raw as Record<string, unknown>;
  if (
    typeof data.filename !== "string" ||
    typeof data.mediaType !== "string" ||
    typeof data.data !== "string"
  ) {
    throw new GeneratorError("The uploaded photo was not readable. Please try again.", 400);
  }

  const mediaType = data.mediaType.trim().toLowerCase();
  if (!isAllowedEditImageUploadType(mediaType)) {
    throw new GeneratorError("Upload a JPG, PNG, WebP, or GIF photo.", 400);
  }

  const dataBase64 = data.data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!dataBase64) {
    throw new GeneratorError("The uploaded photo was empty.", 400);
  }

  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0) {
    throw new GeneratorError("The uploaded photo was empty.", 400);
  }
  if (bytes.length > INTAKE_UPLOAD_MAX_BYTES) {
    throw new GeneratorError("That photo is too large. Please use a file under 4 MB.", 400);
  }

  return {
    filename: sanitizeIntakeFilename(data.filename),
    mediaType,
    data: dataBase64,
  };
}

export async function convertEditUploadToWebp(upload: IntakeUpload): Promise<string> {
  try {
    const compressed = await sharp(Buffer.from(upload.data, "base64"), {
      animated: false,
    })
      .rotate()
      .resize({ width: COMPRESSED_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    if (compressed.length === 0) {
      throw new GeneratorError("Could not prepare that photo.", 400);
    }
    if (compressed.length > INTAKE_UPLOAD_MAX_BYTES) {
      throw new GeneratorError("That photo is too large. Please try a smaller photo.", 400);
    }

    return compressed.toString("base64");
  } catch (error) {
    if (error instanceof GeneratorError) throw error;
    throw new GeneratorError("Could not read that photo. Please try another image.", 400);
  }
}
