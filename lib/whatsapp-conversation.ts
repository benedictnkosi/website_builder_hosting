import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { AuthUser } from "@/lib/auth-server";
import { BUILDER_GENERATING_MESSAGE, BUILDER_WELCOME_MESSAGE, intakeReadyToBuild } from "@/lib/builder-chat";
import { assertEditEdits, assertGenerateEdits } from "@/lib/edits";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { buildWebsiteGeneratePrompt } from "@/lib/generate-prompt";
import { searchDomainAvailability } from "@/lib/domains-co-za";
import { slugifyDomainName } from "@/lib/domain-name";
import { coerceWebsiteIntake, emptyWebsiteIntake, type ChatMessage, type WebsiteIntake } from "@/lib/intake";
import { runIntakeChat, runIntakeFromDocument } from "@/lib/intake-chat";
import { isAllowedIntakeUploadType, sanitizeIntakeFilename } from "@/lib/intake-upload";
import { cancelJob, createEditJob, createGenerateJob, findActiveJob, tickJob, type SiteJob } from "@/lib/jobs";
import { runWithMockAiOverride } from "@/lib/mock-ai";
import { ANNUAL_PLAN_MONTHLY_ZAR, ANNUAL_PLAN_ZAR, formatZar, MONTHLY_PLAN_ZAR, type BillingFrequency } from "@/lib/pricing";
import { downloadWhatsAppMedia, sendWhatsAppActionMenu, sendWhatsAppSiteOptions, sendWhatsAppText } from "@/lib/whatsapp-cloud";
import type { WhatsAppMessage } from "@/lib/whatsapp-webhook";
import { isValidWebsiteId } from "@/lib/validation";

const MAX_MESSAGES = 30;
const MAX_PROCESSED_IDS = 200;
const CONVERSATION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

type StoredConversation = {
  messages?: unknown;
  intake?: unknown;
  processedMessageIds?: unknown;
  processingMessageId?: unknown;
  processingStartedAt?: unknown;
  phase?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  websites?: unknown;
  handoffMode?: unknown;
  handoffWebsiteId?: unknown;
  activeWebsiteId?: unknown;
  activeBusinessName?: unknown;
  selectedDomain?: unknown;
  billingFrequency?: unknown;
  domainSuggestions?: unknown;
};

type LinkedWebsite = { websiteId: string; businessName: string; createdAt: string };

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messageText(message: WhatsAppMessage): string {
  const text = message.text;
  if (!text || typeof text !== "object") return "";
  return stringValue((text as Record<string, unknown>).body);
}

function interactiveSelection(message: WhatsAppMessage): string {
  if (!message.interactive || typeof message.interactive !== "object") return "";
  const interactive = message.interactive as Record<string, unknown>;
  const listReply = interactive.list_reply;
  const buttonReply = interactive.button_reply;
  const reply = listReply && typeof listReply === "object"
    ? listReply
    : buttonReply && typeof buttonReply === "object"
      ? buttonReply
      : null;
  return reply ? stringValue((reply as Record<string, unknown>).id) : "";
}

function mediaReference(message: WhatsAppMessage): { id: string; filename: string } | null {
  const source = message.image && typeof message.image === "object"
    ? message.image
    : message.document && typeof message.document === "object"
      ? message.document
      : null;
  if (!source) return null;
  const data = source as Record<string, unknown>;
  const id = stringValue(data.id);
  if (!id) return null;
  return {
    id,
    filename: sanitizeIntakeFilename(stringValue(data.filename) || "whatsapp-upload"),
  };
}

function conversationId(sender: string): string {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) throw new Error("WHATSAPP_APP_SECRET is not configured.");
  return createHmac("sha256", secret).update(sender, "utf8").digest("hex");
}

function handoffHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function chatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const role = data.role === "assistant" || data.role === "user" ? data.role : null;
    const content = stringValue(data.content);
    return role && content ? [{ role, content }] : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function linkedWebsites(value: unknown): LinkedWebsite[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const websiteId = stringValue(data.websiteId);
    if (!websiteId) return [];
    return [{
      websiteId,
      businessName: stringValue(data.businessName) || "Untitled website",
      createdAt: stringValue(data.createdAt),
    }];
  });
}

function activeWebsiteId(stored: StoredConversation): string {
  const direct = stringValue(stored.activeWebsiteId) || stringValue(stored.handoffWebsiteId);
  if (isValidWebsiteId(direct)) return direct;
  const sites = linkedWebsites(stored.websites);
  const latest = sites.at(-1)?.websiteId ?? "";
  return isValidWebsiteId(latest) ? latest : "";
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lulaweb.co.za").replace(/\/$/, "");
}

function whatsappUser(sender: string): AuthUser {
  return {
    uid: `wa_${conversationId(sender)}`,
    displayName: "WhatsApp user",
    idToken: "",
  };
}

function previewUrl(websiteId: string): string {
  return `${appOrigin()}/api/preview/${encodeURIComponent(websiteId)}/index.html`;
}

function shouldMockWhatsAppGeneration(): boolean {
  return process.env.WHATSAPP_GENERATION_MOCK_AI !== "false";
}

function jobStageMessage(job: SiteJob): string {
  if (job.status === "complete") return job.kind === "edit" ? "Changes applied." : "Website build completed.";
  if (job.step === "openai") return job.kind === "edit" ? "Update request received. Updating the website content and design…" : "Business details collected. Writing and designing the website…";
  if (job.step === "images") return "Website content and page design completed. Creating the images…";
  if (job.step === "saving") return "Images completed. Saving and publishing the website…";
  return job.kind === "edit" ? "Website update started." : "Website build started.";
}

async function runJobWithWhatsAppProgress(
  sender: string,
  user: AuthUser,
  initialJob: SiteJob,
): Promise<SiteJob> {
  let job = initialJob;
  let lastStage = "";
  const deadline = Date.now() + 270_000;

  while (Date.now() < deadline) {
    const stage = `${job.status}:${job.step}`;
    if (stage !== lastStage) {
      await sendWhatsAppText(sender, jobStageMessage(job));
      lastStage = stage;
    }
    if (job.status === "complete" || job.status === "failed" || job.status === "cancelled") return job;
    const next = await tickJob(user, job.jobId, { allowSlow: true });
    if (!next) throw new Error("Website job could not be found.");
    job = next;
    if (job.step === "openai" && job.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  throw new Error("Website generation exceeded the WhatsApp processing window.");
}

export async function processWhatsAppConversationMessage(
  message: WhatsAppMessage,
): Promise<void> {
  const sender = stringValue(message.from);
  const messageId = stringValue(message.id);
  if (!sender || !messageId) return;

  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin is required for WhatsApp conversations.");
  }

  const db = getAdminFirestore();
  const ref = db.collection("whatsappConversations").doc(conversationId(sender));
  let claimed = false;
  let newSession = false;
  let stored: StoredConversation = {};

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    stored = (snap.data() ?? {}) as StoredConversation;
    const lastUpdated = Date.parse(stringValue(stored.updatedAt));
    const restart = /^(restart|start over|new website)$/i.test(messageText(message));
    const expired = Number.isFinite(lastUpdated) && Date.now() - lastUpdated > CONVERSATION_IDLE_TTL_MS;
    newSession = restart || expired;
    if (newSession) {
      const websites = linkedWebsites(stored.websites);
      stored = { websites };
      transaction.set(ref, {
        messages: [],
        intake: emptyWebsiteIntake(),
        processedMessageIds: [],
        processingMessageId: "",
        processingStartedAt: "",
        phase: "intake",
        handoffTokenHash: "",
        handoffExpiresAt: "",
        handoffMode: "",
        handoffWebsiteId: "",
        websites,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    const processed = stringArray(stored.processedMessageIds);
    if (processed.includes(messageId) || stored.processingMessageId === messageId) return;
    const processingStartedAt = Date.parse(stringValue(stored.processingStartedAt) || stringValue(stored.updatedAt));
    const anotherMessageIsProcessing = Boolean(stringValue(stored.processingMessageId)) &&
      Number.isFinite(processingStartedAt) && Date.now() - processingStartedAt < 5 * 60 * 1000;
    if (anotherMessageIsProcessing) return;
    transaction.set(ref, {
      processingMessageId: messageId,
      processingStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    claimed = true;
  });

  if (!claimed) return;

  if (newSession) {
    const websites = linkedWebsites(stored.websites);
    if (websites.length > 0) {
      await ref.set({ phase: "choose_action" }, { merge: true });
      await sendWhatsAppActionMenu(sender);
    } else {
      await ref.set({
        messages: [{ role: "assistant", content: BUILDER_WELCOME_MESSAGE }],
        phase: "intake",
      }, { merge: true });
      await sendWhatsAppText(sender, BUILDER_WELCOME_MESSAGE);
    }
    await finishMessage(ref, stored, messageId);
    return;
  }

  const incomingText = messageText(message);
  const selectedOption = interactiveSelection(message);
  const media = mediaReference(message);
  if (!incomingText && !selectedOption && !media) {
    await sendWhatsAppText(
      sender,
      "Please send a text message, or upload one JPG, PNG, WebP, GIF, or PDF with your business information.",
    );
    await finishMessage(ref, stored, messageId);
    return;
  }

  if (stringValue(stored.phase) === "choose_action" || stringValue(stored.phase) === "choose_site") {
    await continueSiteChoice(ref, stored, sender, messageId, incomingText, selectedOption);
    return;
  }

  if (stringValue(stored.phase) === "generating") {
    await sendWhatsAppText(
      sender,
      "I can’t chat while I’m creating your website. Please wait until the build is complete—I’ll send the next stage here automatically.",
    );
    await finishMessage(ref, stored, messageId);
    return;
  }

  if (stringValue(stored.phase) === "site_ready") {
    await updateWebsiteInWhatsApp(ref, stored, sender, messageId, incomingText);
    return;
  }

  if (stringValue(stored.phase) === "domain") {
    await continueDomainPhase(ref, stored, sender, messageId, incomingText || selectedOption);
    return;
  }

  if (stringValue(stored.phase) === "billing") {
    await continueBillingPhase(ref, stored, sender, messageId, incomingText || selectedOption);
    return;
  }

  if (stringValue(stored.phase) === "payment") {
    await sendWhatsAppText(sender, "Your secure payment link is ready above. Complete payment there, or reply “restart” to create another website.");
    await finishMessage(ref, stored, messageId);
    return;
  }

  if (stringValue(stored.phase) === "complete") {
    await startWebsiteGeneration(ref, stored, sender, messageId, coerceWebsiteIntake(stored.intake));
    return;
  }

  const priorMessages = chatMessages(stored.messages);
  if (priorMessages.length === 0) {
    await sendWhatsAppText(sender, BUILDER_WELCOME_MESSAGE);
  }
  let document;
  if (media) {
    const downloaded = await downloadWhatsAppMedia(media.id, media.filename);
    if (!isAllowedIntakeUploadType(downloaded.mediaType)) {
      await sendWhatsAppText(sender, "Please upload a JPG, PNG, WebP, GIF, or PDF.");
      await finishMessage(ref, stored, messageId);
      return;
    }
    document = downloaded;
  }
  const userContent = document
    ? `I uploaded ${document.filename} with my business information.`
    : incomingText;
  const history: ChatMessage[] = [
    ...(priorMessages.length > 0
      ? priorMessages
      : [{ role: "assistant" as const, content: BUILDER_WELCOME_MESSAGE }]),
    { role: "user" as const, content: userContent },
  ].slice(-MAX_MESSAGES);
  const currentIntake = stored.intake ? coerceWebsiteIntake(stored.intake) : emptyWebsiteIntake();

  try {
    const result = document
      ? await runIntakeFromDocument(history, document, currentIntake)
      : await runIntakeChat(history, currentIntake);
    const readyToBuild = intakeReadyToBuild(result, history);
    const assistantReply = readyToBuild ? BUILDER_GENERATING_MESSAGE : result.reply;
    const nextMessages = [
      ...history,
      { role: "assistant" as const, content: assistantReply },
    ].slice(-MAX_MESSAGES);

    await ref.set({
      messages: nextMessages,
      intake: result.intake,
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      processingMessageId: "",
      phase: readyToBuild ? "generating" : "intake",
      updatedAt: new Date().toISOString(),
      createdAt: stringValue(stored.createdAt) || new Date().toISOString(),
    }, { merge: true });
    await sendWhatsAppText(sender, assistantReply);
    if (readyToBuild) {
      await startWebsiteGeneration(ref, stored, sender, messageId, result.intake);
    }
  } catch (error) {
    await ref.set({ processingMessageId: "", updatedAt: new Date().toISOString() }, { merge: true });
    console.error("WhatsApp conversation failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      messageId,
    });
    await sendWhatsAppText(sender, "I couldn't reply just now. Please try again in a moment.");
  }
}

async function continueSiteChoice(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  incomingText: string,
  selectedOption: string,
): Promise<void> {
  const sites = linkedWebsites(stored.websites);
  const choice = (selectedOption || incomingText).trim().toLowerCase();

  if (choice === "action:new" || /^(new|create|create a new site|new website)$/i.test(choice)) {
    await ref.set({
      messages: [{ role: "assistant", content: BUILDER_WELCOME_MESSAGE }],
      intake: emptyWebsiteIntake(),
      phase: "intake",
      processingMessageId: "",
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await sendWhatsAppText(sender, BUILDER_WELCOME_MESSAGE);
    return;
  }

  if (choice === "action:update" || /^(update|edit|update a site)$/i.test(choice)) {
    if (sites.length === 1) {
      await selectWebsiteForUpdates(ref, stored, sender, messageId, sites[0]);
    } else {
      await ref.set({
        phase: "choose_site",
        processingMessageId: "",
        processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await sendWhatsAppSiteOptions(
        sender,
        sites.map((site, index) => ({ id: `site:${index}`, title: site.businessName })),
      );
    }
    return;
  }

  const siteMatch = /^site:(\d+)$/.exec(choice);
  const selectedSite = siteMatch ? sites[Number(siteMatch[1])] : undefined;
  if (selectedSite) {
    await selectWebsiteForUpdates(ref, stored, sender, messageId, selectedSite);
    return;
  }

  await ref.set({ processingMessageId: "" }, { merge: true });
  await sendWhatsAppActionMenu(sender);
}

async function selectWebsiteForUpdates(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  site: LinkedWebsite,
): Promise<void> {
  await ref.set({
    phase: "site_ready",
    activeWebsiteId: site.websiteId,
    activeBusinessName: site.businessName,
    processingMessageId: "",
    processingStartedAt: "",
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await sendWhatsAppText(
    sender,
    `What would you like to change on ${site.businessName}? Describe the change here and I’ll update it for you.`,
  );
}

async function startWebsiteGeneration(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  intake: WebsiteIntake,
): Promise<void> {
  await ref.set({
    intake,
    phase: "generating",
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    processingMessageId: "",
    processingStartedAt: "",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  try {
    const user = whatsappUser(sender);
    await assertGenerateEdits(user);
    const completed = await runWithMockAiOverride(
      shouldMockWhatsAppGeneration(),
      async () => {
        const existingJob = await findActiveJob(user, "generate");
        if (existingJob) await cancelJob(user, existingJob.jobId);
        const job = await createGenerateJob(user, {
          prompt: buildWebsiteGeneratePrompt(intake, appOrigin()),
          peopleEthnicity: intake.people_ethnicity,
          businessName: intake.business_name,
          contactEmail: intake.contact_email,
        });
        return runJobWithWhatsAppProgress(sender, user, job);
      },
    );
    if (completed.status !== "complete" || !isValidWebsiteId(completed.websiteId)) {
      throw new Error(completed.error || "Website generation failed.");
    }
    await saveLinkedWebsite(ref, completed.websiteId, intake.business_name);
    await ref.set({
      phase: "domain",
      activeWebsiteId: completed.websiteId,
      activeBusinessName: intake.business_name,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await sendWhatsAppText(
      sender,
      `Your website is ready. You can preview it here:\n${previewUrl(completed.websiteId)}\n\nWhat .co.za domain would you like? Send the name, for example ${slugifyDomainName(intake.business_name) || "mybusiness"}.co.za.`,
    );
  } catch (error) {
    await ref.set({ phase: "complete", updatedAt: new Date().toISOString() }, { merge: true });
    console.error("WhatsApp website generation failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      messageId,
    });
    await sendWhatsAppText(sender, "I couldn’t finish the website just now. Reply “try again” and I’ll continue here.");
  }
}

async function continueDomainPhase(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  requested: string,
): Promise<void> {
  const priorSuggestions = stringArray(stored.domainSuggestions);
  const numberedChoice = /^(?:option\s*)?([1-5])$/i.exec(requested.trim());
  const selectedSuggestion = numberedChoice ? priorSuggestions[Number(numberedChoice[1]) - 1] : "";
  const sld = slugifyDomainName(selectedSuggestion || requested);
  if (sld.length < 2) {
    await sendWhatsAppText(sender, "Please send a .co.za domain name with at least two letters.");
    await finishMessage(ref, stored, messageId);
    return;
  }

  try {
    const result = (await searchDomainAvailability(sld)).results[0];
    const websiteId = activeWebsiteId(stored);
    if (!websiteId) {
      await ref.set({
        phase: "choose_action",
        processingMessageId: "",
        processingStartedAt: "",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await sendWhatsAppText(sender, "I couldn’t reconnect the completed website. Please choose whether to update an existing website or create a new one.");
      await sendWhatsAppActionMenu(sender);
      return;
    }
    const isCoZaResult = result?.tld === "co.za" && result.domain.toLowerCase().endsWith(".co.za");
    if (result?.available && isCoZaResult) {
      await ref.set({
        phase: "billing",
        selectedDomain: result.domain,
        activeWebsiteId: websiteId,
        domainSuggestions: [],
        processingMessageId: "",
        processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await sendWhatsAppText(sender, `${result.domain} is available.\n\nChoose your payment option:\n1. Annual — ${formatZar(ANNUAL_PLAN_ZAR)} per year (${formatZar(ANNUAL_PLAN_MONTHLY_ZAR)} per month)\n2. Monthly — ${formatZar(MONTHLY_PLAN_ZAR)} per month\n\nReply “annual” or “monthly”.`);
      return;
    }

    const candidates = domainSuggestionCandidates(sld, stringValue(stored.activeBusinessName));
    const checks = await Promise.all(candidates.map((candidate) => searchDomainAvailability(candidate)));
    const available = checks
      .map((check) => check.results[0])
      .filter((item) => item?.available && item.tld === "co.za" && item.domain.toLowerCase().endsWith(".co.za"))
      .slice(0, 5);
    await ref.set({
      domainSuggestions: available.map((item) => item.domain),
      processingMessageId: "",
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (available.length === 0) {
      await sendWhatsAppText(sender, `${result?.domain || `${sld}.co.za`} is already taken. Send another .co.za name and I’ll check it.`);
      return;
    }
    await sendWhatsAppText(sender, `${result?.domain || `${sld}.co.za`} is already taken. Here are similar available options:\n${available.map((item, index) => `${index + 1}. ${item.domain}`).join("\n")}\n\nSend the domain you want.`);
  } catch (error) {
    await ref.set({ processingMessageId: "", updatedAt: new Date().toISOString() }, { merge: true });
    console.error("WhatsApp domain search failed", { error: error instanceof Error ? error.name : "UnknownError", messageId });
    await sendWhatsAppText(sender, "I couldn’t check that domain just now. Please try again.");
  }
}

function domainSuggestionCandidates(sld: string, businessName: string): string[] {
  const business = slugifyDomainName(businessName);
  return [...new Set([
    `${sld}-sa`, `${sld}-online`, `${sld}-services`, `get-${sld}`, `${sld}-group`,
    `${business}-sa`, `${business}-online`, `${business}-services`, `my-${sld}`, `${sld}-za`,
    `${sld}-web`, `${sld}-business`, `${sld}-company`, `${sld}-official`, `${sld}-pro`,
    `the-${sld}`, `${sld}-south-africa`, `${business}-group`, `go-${sld}`, `${sld}-hq`,
  ].map(slugifyDomainName))].filter((candidate) => candidate.length >= 2 && candidate !== sld).slice(0, 20);
}

async function continueBillingPhase(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  choice: string,
): Promise<void> {
  const normalized = choice.trim().toLowerCase();
  const frequency: BillingFrequency | null = /^(1|annual|yearly|year)$/i.test(normalized)
    ? "annual"
    : /^(2|monthly|month)$/i.test(normalized) ? "monthly" : null;
  if (!frequency) {
    await sendWhatsAppText(sender, "Please reply “annual” or “monthly” to choose your payment option.");
    await finishMessage(ref, stored, messageId);
    return;
  }

  const websiteId = activeWebsiteId(stored);
  const domain = stringValue(stored.selectedDomain);
  if (!domain.toLowerCase().endsWith(".co.za")) {
    await ref.set({
      phase: "domain",
      selectedDomain: "",
      processingMessageId: "",
      processingStartedAt: "",
      processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await sendWhatsAppText(sender, "That selection was not a valid .co.za domain. Please send the .co.za domain you want and I’ll check it again.");
    return;
  }
  if (!websiteId) {
    await ref.set({ phase: "choose_action", processingMessageId: "", processingStartedAt: "", updatedAt: new Date().toISOString() }, { merge: true });
    await sendWhatsAppText(sender, "I couldn’t reconnect the completed website. Please choose what you want to do next.");
    await sendWhatsAppActionMenu(sender);
    return;
  }
  const token = randomBytes(32).toString("base64url");
  await ref.set({
    phase: "payment",
    billingFrequency: frequency,
    handoffTokenHash: handoffHash(token),
    handoffExpiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
    handoffMode: "payment",
    handoffWebsiteId: websiteId,
    processingMessageId: "",
    processingStartedAt: "",
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await sendWhatsAppText(sender, `You chose ${frequency} billing for ${domain}. Continue securely to payment here:\n${appOrigin()}/builder?whatsapp=${encodeURIComponent(token)}&payment=1`);
}

async function updateWebsiteInWhatsApp(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  sender: string,
  messageId: string,
  instruction: string,
): Promise<void> {
  const websiteId = stringValue(stored.activeWebsiteId);
  if (!isValidWebsiteId(websiteId) || !instruction) {
    await sendWhatsAppText(sender, "Please describe the website change you want.");
    await finishMessage(ref, stored, messageId);
    return;
  }

  try {
    const user = whatsappUser(sender);
    await assertEditEdits(user);
    const job = await createEditJob(user, { websiteId, instruction });
    const completed = await runJobWithWhatsAppProgress(sender, user, job);
    if (completed.status !== "complete") throw new Error(completed.error || "Website update failed.");
    await finishMessage(ref, stored, messageId);
    await sendWhatsAppText(
      sender,
      `Your changes are live. Preview the updated website here:\n${previewUrl(websiteId)}\n\nYou can send another change whenever you’re ready.`,
    );
  } catch (error) {
    await ref.set({ processingMessageId: "", updatedAt: new Date().toISOString() }, { merge: true });
    console.error("WhatsApp website update failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      messageId,
    });
    await sendWhatsAppText(sender, "I couldn’t apply that change just now. Please try again.");
  }
}

async function finishMessage(
  ref: FirebaseFirestore.DocumentReference,
  stored: StoredConversation,
  messageId: string,
): Promise<void> {
  await ref.set({
    processedMessageIds: [...stringArray(stored.processedMessageIds), messageId].slice(-MAX_PROCESSED_IDS),
    processingMessageId: "",
    processingStartedAt: "",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function readWhatsAppHandoff(token: string): Promise<{
  messages: ChatMessage[];
  intake: WebsiteIntake;
  mode: "create" | "update" | "payment";
  websiteId?: string;
  domain?: string;
  frequency?: BillingFrequency;
} | null> {
  if (!isFirebaseAdminConfigured() || !token || token.length > 100) return null;
  const snap = await getAdminFirestore()
    .collection("whatsappConversations")
    .where("handoffTokenHash", "==", handoffHash(token))
    .limit(1)
    .get();
  const document = snap.docs[0];
  if (!document) return null;
  const data = document.data() as StoredConversation & { handoffExpiresAt?: unknown };
  const expiresAt = Date.parse(stringValue(data.handoffExpiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return {
    messages: chatMessages(data.messages),
    intake: coerceWebsiteIntake(data.intake),
    mode: stringValue(data.handoffMode) === "payment" ? "payment" : stringValue(data.handoffMode) === "update" ? "update" : "create",
    websiteId: stringValue(data.handoffWebsiteId) || undefined,
    domain: stringValue(data.selectedDomain) || undefined,
    frequency: stringValue(data.billingFrequency) === "monthly" ? "monthly" : "annual",
  };
}

export async function authorizeWhatsAppWebsiteClaim(
  token: string,
  websiteId: string,
): Promise<string | null> {
  if (!isFirebaseAdminConfigured() || !token || !isValidWebsiteId(websiteId)) return null;
  const snap = await getAdminFirestore().collection("whatsappConversations")
    .where("handoffTokenHash", "==", handoffHash(token)).limit(1).get();
  const document = snap.docs[0];
  if (!document) return null;
  const data = document.data() as StoredConversation & { handoffExpiresAt?: unknown };
  const expiresAt = Date.parse(stringValue(data.handoffExpiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (stringValue(data.handoffWebsiteId) !== websiteId) return null;
  return `wa_${document.id}`;
}

export async function linkWhatsAppWebsite(
  token: string,
  websiteId: string,
  businessName: string,
): Promise<boolean> {
  if (!isFirebaseAdminConfigured() || !token || !isValidWebsiteId(websiteId)) return false;
  const db = getAdminFirestore();
  const query = await db.collection("whatsappConversations")
    .where("handoffTokenHash", "==", handoffHash(token))
    .limit(1)
    .get();
  const document = query.docs[0];
  if (!document) return false;
  const data = document.data() as StoredConversation & { handoffExpiresAt?: unknown };
  const expiresAt = Date.parse(stringValue(data.handoffExpiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  await saveLinkedWebsite(document.ref, websiteId, businessName);
  return true;
}

async function saveLinkedWebsite(
  ref: FirebaseFirestore.DocumentReference,
  websiteId: string,
  businessName: string,
): Promise<void> {
  const db = getAdminFirestore();
  const snapshot = await ref.get();
  const sites = linkedWebsites(snapshot.get("websites"));
  const next: LinkedWebsite = {
    websiteId,
    businessName: businessName.trim() || "Untitled website",
    createdAt: new Date().toISOString(),
  };
  const linkedAt = new Date().toISOString();
  const batch = db.batch();
  batch.set(ref, {
    websites: [...sites.filter((site) => site.websiteId !== websiteId), next].slice(-10),
    updatedAt: linkedAt,
  }, { merge: true });
  batch.set(db.collection("whatsappWebsites").doc(websiteId), {
    websiteId,
    whatsappUserId: ref.id,
    businessName: next.businessName,
    linkedAt,
  }, { merge: true });
  await batch.commit();
}
