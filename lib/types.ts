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
  files?: WebsiteFile[];
}

export interface GenerateWebsiteError {
  success: false;
  error: string;
}

export type GenerateWebsiteResponse =
  | GenerateWebsiteResult
  | GenerateWebsiteError;

export type SiteJobKind = "generate" | "edit";

export type SiteJobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type SiteJobView = {
  jobId: string;
  kind: SiteJobKind;
  status: SiteJobStatus;
  progress: number;
  message: string;
  websiteId?: string;
  error?: string;
};
