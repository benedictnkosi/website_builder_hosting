export const INTAKE_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf";
export const EDIT_IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const INTAKE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const INTAKE_UPLOAD_MAX_EDGE = 1600;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_TYPES = new Set([...ALLOWED_IMAGE_TYPES, "application/pdf"]);

export type IntakeUpload = {
  filename: string;
  mediaType: string;
  data: string;
};

export function isAllowedIntakeUploadType(mediaType: string): boolean {
  return ALLOWED_TYPES.has(mediaType);
}

export function isAllowedEditImageUploadType(mediaType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mediaType);
}

export function sanitizeIntakeFilename(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() || "upload";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "upload";
}

function stripDataUrl(value: string): string {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma >= 0) {
    return trimmed.slice(comma + 1).replace(/\s/g, "");
  }
  return trimmed.replace(/\s/g, "");
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read that file."));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

async function resizeImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const longest = Math.max(image.width, image.height);
  const scale = longest > INTAKE_UPLOAD_MAX_EDGE ? INTAKE_UPLOAD_MAX_EDGE / longest : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare that image.");
  }
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.85);
  });
  if (!blob) {
    throw new Error("Could not prepare that image.");
  }
  return blob;
}

export async function fileToEditImageUpload(file: File): Promise<IntakeUpload> {
  if (!isAllowedEditImageUploadType(file.type)) {
    throw new Error("Upload a JPG, PNG, WebP, or GIF photo.");
  }
  return fileToIntakeUpload(file);
}

export async function fileToIntakeUpload(file: File): Promise<IntakeUpload> {
  const filename = sanitizeIntakeFilename(file.name);
  const type = file.type;

  if (!isAllowedIntakeUploadType(type)) {
    throw new Error("Upload a JPG, PNG, WebP, GIF, or PDF.");
  }

  if (type === "application/pdf") {
    if (file.size > INTAKE_UPLOAD_MAX_BYTES) {
      throw new Error("That PDF is too large. Please use a file under 4 MB.");
    }
    const dataUrl = await readAsDataUrl(file);
    return {
      filename,
      mediaType: type,
      data: stripDataUrl(dataUrl),
    };
  }

  const prepared =
    file.size > 900_000 || type !== "image/jpeg" ? await resizeImage(file) : file;
  if (prepared.size > INTAKE_UPLOAD_MAX_BYTES) {
    throw new Error("That image is too large. Please try a smaller photo.");
  }
  const dataUrl = await readAsDataUrl(prepared);
  return {
    filename,
    mediaType: prepared.type || "image/jpeg",
    data: stripDataUrl(dataUrl),
  };
}
