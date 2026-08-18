export interface WebsiteFile {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

export interface WebsiteImageRequest {
  path: string;
  prompt: string;
}

export interface GeneratedWebsite {
  files: WebsiteFile[];
  images?: WebsiteImageRequest[];
}

export interface GenerateWebsiteResult {
  success: true;
  websiteId: string;
  files: WebsiteFile[];
}

export interface GenerateWebsiteError {
  success: false;
  error: string;
}

export type GenerateWebsiteResponse =
  | GenerateWebsiteResult
  | GenerateWebsiteError;
