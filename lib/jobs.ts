import "server-only";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import type { AuthUser } from "@/lib/auth-server";
import {
  createWebsiteId,
  deleteWebsiteDirectory,
  updateWebsiteFiles,
} from "@/lib/file-manager";
import {
  listUserJobDocuments,
  readUserJobDocument,
  writeUserJobDocument,
} from "@/lib/firestore";
import { generateWebsiteImageFile } from "@/lib/image-generator";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  BackgroundUnsupportedError,
  cancelBackgroundStructuredResponse,
  generateWebsiteFromOpenAI,
  pollWebsiteGenerationBackground,
  startWebsiteGenerationBackground,
} from "@/lib/openai";
import { createOwnedWebsite } from "@/lib/sites";
import { hasActiveSubscription } from "@/lib/subscription";
import type {
  SiteJobKind,
  SiteJobStatus,
  SiteJobView,
  WebsiteFile,
  WebsiteImageRequest,
} from "@/lib/types";
import { GeneratorError, isValidWebsiteId, validateGeneratedWebsite } from "@/lib/validation";
import { generateWebsite } from "@/lib/website-generator";
import {
  applyMockWebsiteEdit,
  pollWebsiteEditBackground,
  prepareEditFiles,
  startWebsiteEditBackground,
} from "@/lib/website-editor";

export type SiteJobStep = "queued" | "openai" | "images" | "saving" | "done";

export type SiteJob = {
  jobId: string;
  kind: SiteJobKind;
  status: SiteJobStatus;
  step: SiteJobStep;
  progress: number;
  message: string;
  ownerUid: string;
  websiteId: string;
  businessName: string;
  contactEmail: string;
  peopleEthnicity: string;
  prompt: string;
  instruction: string;
  openaiResponseId: string;
  claimId: string;
  leaseUntil: string;
  files: WebsiteFile[];
  imageRequests: WebsiteImageRequest[];
  imageIndex: number;
  allowedPaths: string[];
  error: string;
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string;
};

const JOB_TTL_MS = 10 * 60 * 1000;
const LEASE_MS = 50_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function nowIso(): string {
  return new Date().toISOString();
}

function createJobId(): string {
  return randomBytes(16).toString("hex");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asFiles(value: unknown): WebsiteFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((file): file is WebsiteFile => {
    return (
      Boolean(file) &&
      typeof file === "object" &&
      typeof (file as WebsiteFile).path === "string" &&
      typeof (file as WebsiteFile).content === "string"
    );
  });
}

function asImageRequests(value: unknown): WebsiteImageRequest[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is WebsiteImageRequest => {
    return (
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as WebsiteImageRequest).path === "string" &&
      typeof (item as WebsiteImageRequest).prompt === "string"
    );
  });
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asJob(data: Record<string, unknown>): SiteJob | null {
  const jobId = stringField(data.jobId);
  const kind = stringField(data.kind);
  const status = stringField(data.status);
  if (!jobId || (kind !== "generate" && kind !== "edit")) return null;
  if (
    status !== "queued" &&
    status !== "running" &&
    status !== "complete" &&
    status !== "failed" &&
    status !== "cancelled"
  ) {
    return null;
  }

  const step = stringField(data.step);
  return {
    jobId,
    kind,
    status,
    step:
      step === "openai" ||
      step === "images" ||
      step === "saving" ||
      step === "done" ||
      step === "queued"
        ? step
        : "queued",
    progress: Math.max(0, Math.min(100, numberField(data.progress))),
    message: stringField(data.message) || "Working...",
    ownerUid: stringField(data.ownerUid),
    websiteId: stringField(data.websiteId),
    businessName: stringField(data.businessName),
    contactEmail: stringField(data.contactEmail),
    peopleEthnicity: stringField(data.peopleEthnicity),
    prompt: stringField(data.prompt),
    instruction: stringField(data.instruction),
    openaiResponseId: stringField(data.openaiResponseId),
    claimId: stringField(data.claimId),
    leaseUntil: stringField(data.leaseUntil),
    files: asFiles(data.files),
    imageRequests: asImageRequests(data.imageRequests),
    imageIndex: Math.max(0, numberField(data.imageIndex)),
    allowedPaths: asStringArray(data.allowedPaths),
    error: stringField(data.error),
    createdAt: stringField(data.createdAt) || nowIso(),
    updatedAt: stringField(data.updatedAt) || nowIso(),
    heartbeatAt: stringField(data.heartbeatAt) || stringField(data.updatedAt) || nowIso(),
  };
}

function jobPayload(job: SiteJob): Record<string, unknown> {
  return { ...job };
}

export function toJobView(job: SiteJob): SiteJobView {
  return {
    jobId: job.jobId,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    message: job.message,
    websiteId: job.websiteId || undefined,
    error: job.error || undefined,
  };
}

export function jobJsonHeaders(): HeadersInit {
  return NO_STORE_HEADERS;
}

function isTerminal(job: SiteJob): boolean {
  return job.status === "complete" || job.status === "failed" || job.status === "cancelled";
}

function leaseActive(job: SiteJob): boolean {
  if (!job.leaseUntil) return false;
  const until = Date.parse(job.leaseUntil);
  return Number.isFinite(until) && until > Date.now();
}

function jobExpired(job: SiteJob): boolean {
  const created = Date.parse(job.createdAt);
  return Number.isFinite(created) && Date.now() - created > JOB_TTL_MS;
}

export async function readJob(user: AuthUser, jobId: string): Promise<SiteJob | null> {
  if (!isValidWebsiteId(jobId)) return null;
  const data = await readUserJobDocument(user, jobId);
  if (!data) return null;
  const job = asJob(data);
  if (!job || job.ownerUid !== user.uid) return null;
  return job;
}

async function writeJob(user: AuthUser, job: SiteJob): Promise<void> {
  await writeUserJobDocument(user, job.jobId, jobPayload(job));
}

async function patchJob(
  user: AuthUser,
  job: SiteJob,
  patch: Partial<SiteJob>,
): Promise<SiteJob> {
  const next: SiteJob = {
    ...job,
    ...patch,
    updatedAt: nowIso(),
    heartbeatAt: nowIso(),
  };
  await writeJob(user, next);
  return next;
}

async function failJob(user: AuthUser, job: SiteJob, error: unknown): Promise<SiteJob> {
  if (isTerminal(job) && job.status !== "running" && job.status !== "queued") {
    return job;
  }

  const message =
    error instanceof GeneratorError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";

  const failed = await patchJob(user, job, {
    status: "failed",
    step: job.step,
    progress: job.progress,
    message,
    error: message,
    leaseUntil: "",
    claimId: "",
    prompt: "",
    instruction: "",
    files: [],
    imageRequests: [],
  });

  if (job.kind === "generate" && job.websiteId && job.step !== "done") {
    await deleteWebsiteDirectory(job.websiteId, user.idToken).catch(() => undefined);
  }

  return failed;
}

async function completeJob(
  user: AuthUser,
  job: SiteJob,
  websiteId: string,
  message: string,
): Promise<SiteJob> {
  return patchJob(user, job, {
    status: "complete",
    step: "done",
    progress: 100,
    message,
    websiteId,
    error: "",
    leaseUntil: "",
    claimId: "",
    prompt: "",
    instruction: "",
    openaiResponseId: "",
    files: [],
    imageRequests: [],
    allowedPaths: [],
  });
}

async function claimJob(user: AuthUser, job: SiteJob): Promise<SiteJob | null> {
  if (isTerminal(job) || leaseActive(job)) return null;

  const claimId = randomBytes(8).toString("hex");
  const claimed = await patchJob(user, job, {
    status: "running",
    claimId,
    leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
  });

  const latest = await readJob(user, job.jobId);
  if (!latest || latest.claimId !== claimId) return null;
  return claimed;
}

async function releaseLease(user: AuthUser, job: SiteJob, claimId: string): Promise<void> {
  const latest = await readJob(user, job.jobId);
  if (!latest || latest.claimId !== claimId || isTerminal(latest)) return;
  await patchJob(user, latest, { leaseUntil: "", claimId: "" });
}

export async function findActiveJob(
  user: AuthUser,
  kind: SiteJobKind,
  websiteId?: string,
): Promise<SiteJob | null> {
  const documents = await listUserJobDocuments(user);
  const jobs = documents
    .map((data) => asJob(data))
    .filter((job): job is SiteJob => Boolean(job));

  return (
    jobs.find((job) => {
      if (job.kind !== kind || isTerminal(job) || jobExpired(job)) return false;
      if (websiteId && job.websiteId !== websiteId) return false;
      return true;
    }) ?? null
  );
}

export async function createGenerateJob(
  user: AuthUser,
  input: {
    prompt: string;
    peopleEthnicity?: string;
    businessName?: string;
    contactEmail?: string;
  },
): Promise<SiteJob> {
  const now = nowIso();
  const job: SiteJob = {
    jobId: createJobId(),
    kind: "generate",
    status: "queued",
    step: "queued",
    progress: 4,
    message: "Starting your website...",
    ownerUid: user.uid,
    websiteId: createWebsiteId(),
    businessName: input.businessName?.trim() ?? "",
    contactEmail: input.contactEmail?.trim() ?? "",
    peopleEthnicity: input.peopleEthnicity?.trim() ?? "",
    prompt: input.prompt,
    instruction: "",
    openaiResponseId: "",
    claimId: "",
    leaseUntil: "",
    files: [],
    imageRequests: [],
    imageIndex: 0,
    allowedPaths: [],
    error: "",
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
  };

  await writeJob(user, job);
  return job;
}

export async function createEditJob(
  user: AuthUser,
  input: { websiteId: string; instruction: string },
): Promise<SiteJob> {
  const existing = await findActiveJob(user, "edit", input.websiteId);
  if (existing) return existing;

  const now = nowIso();
  const job: SiteJob = {
    jobId: createJobId(),
    kind: "edit",
    status: "queued",
    step: "queued",
    progress: 6,
    message: "Starting your changes...",
    ownerUid: user.uid,
    websiteId: input.websiteId,
    businessName: "",
    contactEmail: "",
    peopleEthnicity: "",
    prompt: "",
    instruction: input.instruction,
    openaiResponseId: "",
    claimId: "",
    leaseUntil: "",
    files: [],
    imageRequests: [],
    imageIndex: 0,
    allowedPaths: [],
    error: "",
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
  };

  await writeJob(user, job);
  return job;
}

export function scheduleJobTick(user: AuthUser, jobId: string): void {
  after(() => {
    void tickJob(user, jobId, { allowSlow: true });
  });
}

async function storeGeneratedDraft(
  user: AuthUser,
  job: SiteJob,
  files: WebsiteFile[],
  imageRequests: WebsiteImageRequest[],
): Promise<SiteJob> {
  const nextStep: SiteJobStep = imageRequests.length > 0 ? "images" : "saving";
  return patchJob(user, job, {
    status: "running",
    step: nextStep,
    progress: imageRequests.length > 0 ? 48 : 82,
    message:
      imageRequests.length > 0
        ? `Generating images (1 of ${imageRequests.length})...`
        : "Saving your website...",
    files,
    imageRequests,
    imageIndex: 0,
    openaiResponseId: "",
  });
}

async function storeEditDraft(
  user: AuthUser,
  job: SiteJob,
  files: WebsiteFile[],
): Promise<SiteJob> {
  return patchJob(user, job, {
    status: "running",
    step: "saving",
    progress: 82,
    message: "Saving your changes...",
    files,
    openaiResponseId: "",
  });
}

async function startGenerateOpenAI(
  user: AuthUser,
  job: SiteJob,
  allowSlow: boolean,
): Promise<SiteJob> {
  if (isMockAiEnabled()) {
    const result = await generateWebsite(
      job.prompt,
      job.peopleEthnicity || undefined,
      user.idToken,
    );
    await createOwnedWebsite({
      websiteId: result.websiteId,
      user,
      businessName: job.businessName || undefined,
      contactEmail: job.contactEmail || undefined,
    });
    return completeJob(user, job, result.websiteId, "Website ready!");
  }

  try {
    const started = await startWebsiteGenerationBackground(job.prompt);
    if (started.website) {
      const files = validateGeneratedWebsite(started.website);
      return storeGeneratedDraft(user, job, files, started.website.images ?? []);
    }

    return patchJob(user, job, {
      status: "running",
      step: "openai",
      progress: 18,
      message: "Writing pages...",
      openaiResponseId: started.id,
      leaseUntil: "",
      claimId: "",
    });
  } catch (error) {
    if (!(error instanceof BackgroundUnsupportedError)) throw error;
    if (!allowSlow) {
      await releaseLease(user, job, job.claimId);
      return job;
    }
    const generated = await generateWebsiteFromOpenAI(job.prompt);
    const files = validateGeneratedWebsite(generated);
    return storeGeneratedDraft(user, job, files, generated.images ?? []);
  }
}

async function startEditOpenAI(user: AuthUser, job: SiteJob): Promise<SiteJob> {
  const filesToEdit = await prepareEditFiles(job.websiteId, job.instruction, user.idToken);

  if (isMockAiEnabled()) {
    await applyMockWebsiteEdit(job.websiteId, job.instruction, filesToEdit, user.idToken);
    return completeJob(user, job, job.websiteId, "Changes applied!");
  }

  const started = await startWebsiteEditBackground(job.instruction, filesToEdit);
  if (started.files) {
    return storeEditDraft(user, job, started.files);
  }
  if (!started.id) {
    throw new GeneratorError("Could not start the edit request. Please try again.", 502);
  }

  return patchJob(user, job, {
    status: "running",
    step: "openai",
    progress: 22,
    message: "Applying your changes...",
    openaiResponseId: started.id,
    allowedPaths: filesToEdit.map((file) => file.path),
    leaseUntil: "",
    claimId: "",
  });
}

async function pollOpenAI(user: AuthUser, job: SiteJob): Promise<SiteJob> {
  if (!job.openaiResponseId) {
    throw new GeneratorError("The job lost its OpenAI request. Please try again.", 502);
  }

  if (job.kind === "generate") {
    const poll = await pollWebsiteGenerationBackground(job.openaiResponseId);
    if (poll.status === "pending") {
      return patchJob(user, job, {
        status: "running",
        progress: Math.max(job.progress, 28),
        message: "Writing pages...",
      });
    }
    if (poll.status === "failed") {
      throw new GeneratorError(poll.error, 502);
    }
    const files = validateGeneratedWebsite(poll.website);
    return storeGeneratedDraft(user, job, files, poll.website.images ?? []);
  }

  const poll = await pollWebsiteEditBackground(job.openaiResponseId, job.allowedPaths);
  if (poll.status === "pending") {
    return patchJob(user, job, {
      status: "running",
      progress: Math.max(job.progress, 36),
      message: "Applying your changes...",
    });
  }
  if (poll.status === "failed") {
    throw new GeneratorError(poll.error, 502);
  }
  return storeEditDraft(user, job, poll.files);
}

async function generateNextImage(user: AuthUser, job: SiteJob): Promise<SiteJob> {
  const request = job.imageRequests[job.imageIndex];
  if (!request) {
    return patchJob(user, job, {
      step: "saving",
      progress: 86,
      message: "Saving your website...",
    });
  }

  const image = await generateWebsiteImageFile(request, job.peopleEthnicity || undefined);
  await updateWebsiteFiles(job.websiteId, [image], user.idToken);
  const nextIndex = job.imageIndex + 1;
  const remaining = job.imageRequests.length - nextIndex;

  if (remaining <= 0) {
    return patchJob(user, job, {
      step: "saving",
      progress: 88,
      message: "Saving your website...",
      imageIndex: nextIndex,
    });
  }

  return patchJob(user, job, {
    step: "images",
    progress: Math.min(80, 48 + Math.round((nextIndex / job.imageRequests.length) * 32)),
    message: `Generating images (${nextIndex + 1} of ${job.imageRequests.length})...`,
    imageIndex: nextIndex,
  });
}

async function saveJobResult(user: AuthUser, job: SiteJob): Promise<SiteJob> {
  if (job.kind === "generate") {
    await updateWebsiteFiles(job.websiteId, job.files, user.idToken);
    await createOwnedWebsite({
      websiteId: job.websiteId,
      user,
      businessName: job.businessName || undefined,
      contactEmail: job.contactEmail || undefined,
    });
    return completeJob(user, job, job.websiteId, "Website ready!");
  }

  if (!(await hasActiveSubscription(job.websiteId))) {
    throw new GeneratorError("Subscribe to make changes to your website.", 402);
  }

  await updateWebsiteFiles(job.websiteId, job.files, user.idToken);
  return completeJob(user, job, job.websiteId, "Changes applied!");
}

async function advanceJob(
  user: AuthUser,
  job: SiteJob,
  allowSlow: boolean,
): Promise<void> {
  if (job.step === "queued") {
    if (!allowSlow) return;
    const claimed = await claimJob(user, job);
    if (!claimed) return;
    try {
      if (claimed.kind === "generate") {
        await startGenerateOpenAI(user, claimed, allowSlow);
      } else {
        await startEditOpenAI(user, claimed);
      }
    } catch (error) {
      await failJob(user, claimed, error);
    }
    return;
  }

  if (job.step === "openai") {
    try {
      await pollOpenAI(user, job);
    } catch (error) {
      await failJob(user, job, error);
    }
    return;
  }

  if (job.step === "images" || job.step === "saving") {
    if (!allowSlow) return;
    const claimed = await claimJob(user, job);
    if (!claimed) return;
    try {
      if (claimed.step === "images") {
        await generateNextImage(user, claimed);
      } else {
        await saveJobResult(user, claimed);
      }
    } catch (error) {
      await failJob(user, claimed, error);
    } finally {
      const latest = await readJob(user, job.jobId);
      if (latest && !isTerminal(latest) && latest.claimId === claimed.claimId) {
        await releaseLease(user, latest, claimed.claimId);
      }
    }
  }
}

export async function tickJob(
  user: AuthUser,
  jobId: string,
  options?: { allowSlow?: boolean },
): Promise<SiteJob | null> {
  const allowSlow = options?.allowSlow ?? false;
  const job = await readJob(user, jobId);
  if (!job) return null;

  if (isTerminal(job)) return job;

  if (jobExpired(job)) {
    return failJob(
      user,
      job,
      new GeneratorError("This took too long. Please try again.", 504),
    );
  }

  try {
    await advanceJob(user, job, allowSlow);
  } catch (error) {
    const latest = (await readJob(user, jobId)) ?? job;
    return failJob(user, latest, error);
  }

  return readJob(user, jobId);
}

export async function cancelJob(user: AuthUser, jobId: string): Promise<SiteJob | null> {
  const job = await readJob(user, jobId);
  if (!job) return null;
  if (isTerminal(job)) return job;

  if (job.openaiResponseId) {
    await cancelBackgroundStructuredResponse(job.openaiResponseId);
  }

  const cancelled = await patchJob(user, job, {
    status: "cancelled",
    message: "Cancelled.",
    error: "",
    leaseUntil: "",
    claimId: "",
    prompt: "",
    instruction: "",
    files: [],
    imageRequests: [],
  });

  if (job.kind === "generate" && job.websiteId) {
    await deleteWebsiteDirectory(job.websiteId, user.idToken).catch(() => undefined);
  }

  return cancelled;
}
