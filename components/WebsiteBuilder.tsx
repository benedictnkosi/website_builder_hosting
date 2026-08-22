"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AddressModal from "@/components/AddressModal";
import BulkEditTipModal, {
  hasSeenBulkEditTip,
  markBulkEditTipSeen,
} from "@/components/BulkEditTipModal";
import { useAuth } from "@/components/AuthProvider";
import DeployWorkspace from "@/components/DeployWorkspace";
import PaywallCard from "@/components/PaywallCard";
import GenerationProgressBar from "@/components/GenerationProgressBar";
import {
  clearBuilderSession,
  loadBuilderSession,
  saveBuilderSession,
} from "@/lib/builder-session";
import { extractBusinessName, slugifyDomainName } from "@/lib/domain-name";
import {
  compileBusinessDescription,
  hasEnoughIntakeToGenerate,
  lastUserMessageIsConfirmation,
  type ChatMessage,
  type IntakeChatResult,
  type WebsiteIntake,
} from "@/lib/intake";
import { fileToEditImageUpload, fileToIntakeUpload, EDIT_IMAGE_UPLOAD_ACCEPT, INTAKE_UPLOAD_ACCEPT, type IntakeUpload } from "@/lib/intake-upload";
import { getPeopleEthnicityOption } from "@/lib/people-ethnicity";
import type { SiteJobView, WebsiteFile } from "@/lib/types";
import {
  trackAddressChoice,
  trackCheckoutCancel,
  trackEditStart,
  trackEditSuccess,
  trackGenerateFail,
  trackGenerateStart,
  trackGenerateSuccess,
  trackIntakeComplete,
  trackIntakeStart,
  trackPaywallView,
  trackPurchase,
} from "@/lib/analytics";
import { notifyEditsChanged, openEditTopup, EDITS_CHANGED_EVENT } from "@/lib/edit-events";
import {
  consumeLocalEdits,
  ensureLocalCredits,
  getOrCreateGuestId,
  rememberGuestWebsite,
} from "@/lib/guest-session";
import {
  EDIT_EDITS_COST,
  EDIT_TOPUP_ZAR,
  GENERATE_EDITS_COST,
  SUBSCRIPTION_EDITS_GRANT,
  formatEdits,
  formatZar,
} from "@/lib/pricing";

type GenerationStatus = "idle" | "chatting" | "generating" | "success" | "error";
type ChatPhase = "intake" | "edit";

const WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business, or upload one flyer, business card, or PDF if you have one.\n\nI'll need this information:\n• Business name\n• About us\n• List of services\n• Contact number\n• WhatsApp number, if WhatsApp is required\n• Email address, if a contact form is required\n• Trading hours, if you have them";

const READY_MESSAGE =
  "Your website is ready. Preview it, describe any changes, or attach one photo to replace an image. Subscribe when you want to deploy it live.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={index} className="font-semibold text-stone-800">
          {bold[1]}
        </strong>
      );
    }
    return part;
  });
}

function ChatBubbleBody({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  function flushList() {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`list-${blocks.length}`} className="mt-2 list-disc space-y-1 pl-4 marker:text-stone-400">
        {items.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    blocks.push(
      <p key={`p-${blocks.length}`} className={blocks.length > 0 ? "mt-2" : undefined}>
        {renderInlineMarkdown(line)}
      </p>,
    );
  }
  flushList();

  return <div>{blocks}</div>;
}

function PaperclipIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.44 11.05l-8.49 8.49a5.25 5.25 0 01-7.42-7.43l8.48-8.48a3.5 3.5 0 014.95 4.95l-8.48 8.49a1.75 1.75 0 01-2.47-2.48l7.78-7.78"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span className="relative flex h-5 w-5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-200 opacity-70" />
      <svg
        className="relative h-5 w-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
    </span>
  );
}

function PayfastConfirmingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-2xl bg-teal-800 px-4 py-3 text-white shadow-lg ring-2 ring-teal-950/30"
    >
      <SpinnerIcon />
      <div>
        <p className="text-sm font-semibold">Confirming your PayFast subscription</p>
        <p className="mt-0.5 text-xs font-medium text-teal-100">
          Stay on this page. This can take a few seconds.
        </p>
      </div>
    </div>
  );
}

function EmptyPreview({ generating }: { generating: boolean }) {
  return (
    <div className="relative flex h-full min-h-[22rem] items-center justify-center overflow-hidden bg-[#f7f3ea] p-6 sm:p-8">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-700/10" />
      <div className="absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-amber-200/45" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-800">
          Preview
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
          {generating ? "Building your website" : "Your website will appear here"}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          {generating
            ? "We're writing the pages and generating images. The live preview will show up here when it's ready."
            : "Chat about your business, or upload a flyer if you have one. We'll design the site and show a live preview on this side."}
        </p>
      </div>
    </div>
  );
}

export default function WebsiteBuilder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading, authFetch } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatPhase, setChatPhase] = useState<ChatPhase>("intake");
  const [pendingIntake, setPendingIntake] = useState<WebsiteIntake | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showBulkEditTip, setShowBulkEditTip] = useState(false);
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [, setFiles] = useState<WebsiteFile[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [readingDocument, setReadingDocument] = useState(false);
  const [flyerUploaded, setFlyerUploaded] = useState(false);
  const [pendingEditImage, setPendingEditImage] = useState<IntakeUpload | null>(null);
  const [showDeployCard, setShowDeployCard] = useState(false);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribedDomain, setSubscribedDomain] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [checkoutConfirming, setCheckoutConfirming] = useState(false);
  const [progressBarKey, setProgressBarKey] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [chatLocked, setChatLocked] = useState(false);
  const [editsRemaining, setEditsRemaining] = useState<number | null>(null);
  const runEpochRef = useRef(0);
  const intakeStartedRef = useRef(false);
  const latestIntakeRef = useRef<WebsiteIntake | null>(null);

  const isBusy =
    status === "chatting" ||
    status === "generating" ||
    isEditing ||
    showAddressModal ||
    showBulkEditTip ||
    checkoutConfirming;
  const outOfEdits = editsRemaining !== null && editsRemaining < 1;
  const chatDisabled = isBusy || chatLocked || outOfEdits;
  const previewUrl = websiteId ? `/api/preview/${websiteId}/index.html` : null;
  const startedIntakeByChat = messages.some(
    (message) =>
      message.role === "user" &&
      !/^I uploaded .+ with my business information\.$/.test(message.content),
  );
  const showFlyerUpload = chatPhase === "intake" && !startedIntakeByChat;
  const showEditImageUpload = chatPhase === "edit";
  const showUploadButton = showFlyerUpload || showEditImageUpload;
  const editShortage = Boolean(
    error?.toLowerCase().includes("edit") || error?.toLowerCase().includes("top up"),
  );
  const suggestedDomainName = slugifyDomainName(
    businessName || extractBusinessName(businessDescription),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, isEditing, checkoutNotice, checkoutConfirming]);

  useEffect(() => {
    if (chatDisabled || showPaywall || showDeployCard) return;
    chatInputRef.current?.focus();
  }, [chatDisabled, messages, showPaywall, showDeployCard]);

  useEffect(() => {
    async function loadEdits() {
      if (loading) return;
      if (!user) {
        setEditsRemaining(ensureLocalCredits());
        return;
      }
      try {
        const response = await authFetch("/api/edits");
        const data = (await response.json()) as {
          success?: boolean;
          editsRemaining?: number;
        };
        if (response.ok && data.success && typeof data.editsRemaining === "number") {
          setEditsRemaining(data.editsRemaining);
        }
      } catch {
        // Keep the last known balance if the refresh fails.
      }
    }

    function onEditsChanged() {
      void loadEdits();
      setChatLocked((locked) => {
        if (!locked || status === "generating") return locked;
        return false;
      });
    }
    window.addEventListener(EDITS_CHANGED_EVENT, onEditsChanged);
    void loadEdits();
    return () => window.removeEventListener(EDITS_CHANGED_EVENT, onEditsChanged);
  }, [authFetch, loading, status, user]);

  function addAssistantMessage(content: string) {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }

  function isStaleRun(epoch: number) {
    return epoch !== runEpochRef.current;
  }

  function applyJobView(job: SiteJobView) {
    setActiveJobId(job.jobId);
    setJobProgress(job.progress);
    setJobMessage(job.message);
  }

  function clearJobView() {
    setActiveJobId(null);
    setJobProgress(null);
    setJobMessage(null);
  }

  const waitForJob = useCallback(
    async (jobId: string, epoch: number): Promise<SiteJobView> => {
      while (!isStaleRun(epoch)) {
        const response = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
        const data = (await response.json()) as {
          success?: boolean;
          job?: SiteJobView;
          error?: string;
        };

        if (isStaleRun(epoch)) {
          throw new Error("cancelled");
        }

        if (!response.ok || !data.success || !data.job) {
          throw new Error(data.error || "Could not check job status.");
        }

        applyJobView(data.job);

        if (data.job.status === "complete") {
          return data.job;
        }
        if (data.job.status === "failed") {
          throw new Error(data.job.error || data.job.message || "The job failed.");
        }
        if (data.job.status === "cancelled") {
          throw new Error("cancelled");
        }

        await sleep(1500);
      }

      throw new Error("cancelled");
    },
    [authFetch],
  );

  async function refreshSubscription(id: string, poll = false) {
    const epoch = runEpochRef.current;
    if (poll) {
      try {
        await authFetch("/api/checkout/confirm", {
          method: "POST",
          body: JSON.stringify({ websiteId: id }),
        });
      } catch {
        // Fall through to PayFast notify polling.
      }
    }
    const deadline = Date.now() + (poll ? 90_000 : 0);

    while (!isStaleRun(epoch)) {
      try {
        const response = await authFetch(
          `/api/subscription?websiteId=${encodeURIComponent(id)}`,
        );
        const data = (await response.json()) as {
          success?: boolean;
          paid?: boolean;
          subscription?: { domain?: string; amountZar?: number };
        };

        if (response.ok && data.paid) {
          if (isStaleRun(epoch)) return;
          setIsSubscribed(true);
          setSubscribedDomain(data.subscription?.domain ?? null);
          setShowPaywall(false);
          setCheckoutNotice(null);
          setCheckoutConfirming(false);
          if (poll && data.subscription?.domain) {
            trackPurchase(data.subscription.domain, data.subscription.amountZar);
            notifyEditsChanged();
            addAssistantMessage(
              `You're subscribed. Another ${formatEdits(SUBSCRIPTION_EDITS_GRANT)} were added. Describe a change, or deploy ${data.subscription.domain}.`,
            );
            setAutoDeploy(true);
            setShowDeployCard(true);
          }
          return;
        }
      } catch {
        // Keep polling or fall through.
      }

      if (!poll || Date.now() >= deadline) {
        if (poll && !isStaleRun(epoch)) {
          setCheckoutConfirming(false);
          setCheckoutNotice(
            "PayFast is still confirming payment. This page unlocks when it completes — you can also check Sites.",
          );
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      clearBuilderSession();
      router.replace("/builder");
      return;
    }

    const urlWebsiteId = searchParams.get("websiteId")?.trim() ?? "";
    const checkout = searchParams.get("checkout");
    const session = loadBuilderSession();
    const nextWebsiteId = urlWebsiteId || session?.websiteId || "";
    const resumeJobId = session?.jobId ?? "";
    const resumeKind =
      session?.jobKind === "generate"
        ? "generate"
        : session?.jobKind === "edit" || nextWebsiteId
          ? "edit"
          : "generate";

    if (session?.businessName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved builder session once on mount
      setBusinessName(session.businessName);
    }
    if (session?.businessDescription) {
      setBusinessDescription(session.businessDescription);
    }

    const shouldResumeJob =
      Boolean(resumeJobId) &&
      (!urlWebsiteId || !session?.websiteId || session.websiteId === urlWebsiteId);

    if (shouldResumeJob) {
      setActiveJobId(resumeJobId);
      if (resumeKind === "edit") {
        setWebsiteId(nextWebsiteId || session?.websiteId || "");
        setChatPhase("edit");
        setStatus("success");
        setIsEditing(true);
        setMessages([
          { role: "assistant", content: WELCOME_MESSAGE },
          ...(session?.businessDescription
            ? [{ role: "user" as const, content: session.businessDescription }]
            : []),
          { role: "assistant", content: READY_MESSAGE },
        ]);
      } else {
        setStatus("generating");
        setChatPhase("intake");
        if (nextWebsiteId) {
          setWebsiteId(nextWebsiteId);
        }
      }

      const epoch = runEpochRef.current;
      void waitForJob(resumeJobId, epoch)
        .then((job) => {
          if (isStaleRun(epoch)) return;
          if (job.kind === "generate" && job.websiteId) {
            setWebsiteId(job.websiteId);
            setStatus("success");
            setChatPhase("edit");
            trackGenerateSuccess(job.websiteId);
            saveBuilderSession({
              websiteId: job.websiteId,
              businessName: session?.businessName ?? "",
              businessDescription: session?.businessDescription ?? "",
            });
            consumeLocalEdits(GENERATE_EDITS_COST, `generate:${job.jobId}`);
            rememberGuestWebsite(job.websiteId);
            addAssistantMessage(READY_MESSAGE);
            notifyEditsChanged();
          } else if (job.kind === "edit") {
            setIframeKey((key) => key + 1);
            trackEditSuccess();
            saveBuilderSession({
              websiteId: job.websiteId || nextWebsiteId,
              businessName: session?.businessName ?? "",
              businessDescription: session?.businessDescription ?? "",
            });
            consumeLocalEdits(EDIT_EDITS_COST, `edit:${job.jobId}`);
            if (job.websiteId || nextWebsiteId) {
              rememberGuestWebsite(job.websiteId || nextWebsiteId);
            }
            addAssistantMessage("Changes applied.");
            notifyEditsChanged();
          }
          clearJobView();
          setIsEditing(false);
        })
        .catch((error: unknown) => {
          if (isStaleRun(epoch)) return;
          if (error instanceof Error && error.message === "cancelled") return;
          setIsEditing(false);
          setStatus(resumeKind === "generate" ? "error" : "success");
          setError(error instanceof Error ? error.message : "The previous job failed.");
          clearJobView();
        });
    } else if (!nextWebsiteId) {
      return;
    } else if (session?.websiteId === nextWebsiteId) {
      setWebsiteId(session.websiteId);
      setBusinessName(session.businessName);
      setBusinessDescription(session.businessDescription);
      setChatPhase("edit");
      setStatus("success");
      setMessages([
        { role: "assistant", content: WELCOME_MESSAGE },
        ...(session.businessDescription
          ? [{ role: "user" as const, content: session.businessDescription }]
          : []),
        { role: "assistant", content: READY_MESSAGE },
      ]);
    } else {
      setWebsiteId(nextWebsiteId);
      setChatPhase("edit");
      setStatus("success");
    }

    if (!nextWebsiteId) {
      return;
    }

    if (checkout === "cancel") {
      setCheckoutConfirming(false);
      setCheckoutNotice(
        "Payment was cancelled. Subscribe when you're ready to deploy.",
      );
      setShowPaywall(true);
      trackCheckoutCancel();
    } else if (checkout === "return") {
      setCheckoutConfirming(true);
      setCheckoutNotice("Confirming your PayFast subscription...");
    }

    void refreshSubscription(nextWebsiteId, checkout === "return");
    // Restore once from the return URL / saved session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = searchParams.get("whatsapp")?.trim() ?? "";
    if (!token) return;

    let cancelled = false;
    void fetch(`/api/whatsapp/handoff?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          success?: boolean;
          messages?: ChatMessage[];
          intake?: WebsiteIntake;
          addressResolved?: boolean;
          error?: string;
        };
        if (!response.ok || !data.success || !data.intake) {
          throw new Error(data.error || "Could not continue the WhatsApp conversation.");
        }
        if (cancelled) return;
        const restoredMessages = Array.isArray(data.messages) ? data.messages : [];
        setMessages(restoredMessages.length > 0 ? restoredMessages : messages);
        latestIntakeRef.current = data.intake;
        setPendingIntake(data.intake);
        setBusinessName(data.intake.business_name);
        setBusinessDescription(compileBusinessDescription(data.intake));
        if (data.addressResolved) {
          void runGeneration(data.intake);
        } else {
          setShowAddressModal(true);
          setStatus("idle");
        }
        router.replace("/builder");
      })
      .catch((handoffError: unknown) => {
        if (cancelled) return;
        setError(handoffError instanceof Error ? handoffError.message : "Could not continue the WhatsApp conversation.");
      });

    return () => {
      cancelled = true;
    };
    // The token is intentionally consumed only once on initial navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !websiteId) return;
    void authFetch("/api/sites/claim", {
      method: "POST",
      body: JSON.stringify({
        websiteId,
        businessName,
        guestId: getOrCreateGuestId(),
      }),
    }).catch(() => {
      // Keep the builder usable even if claiming fails.
    });
  }, [authFetch, businessName, user, websiteId]);

  function buildGeneratePrompt(intake: WebsiteIntake): string {
    const promptParts = [compileBusinessDescription(intake)];

    if (intake.about.trim()) {
      promptParts.push(
        `About the business:\n${intake.about.trim()}
Include an About section with id="about" using this information. Do not invent extra history, years in business, credentials, or awards.`,
      );
    }

    if (intake.address.trim()) {
      promptParts.push(
        `Business address: ${intake.address.trim()}\nInclude an embedded Google Map on the website showing this location.`,
      );
    }

    if (intake.use_whatsapp === "yes") {
      const number = intake.whatsapp_number.trim() || intake.phone.trim();
      if (number) {
        promptParts.push(
          `Add a WhatsApp contact button or link on the website using this WhatsApp number: ${number}. The business phone number for calls may be different — show both correctly if they differ.`,
        );
      }
    }

    if (intake.use_contact_form === "yes" && intake.contact_email.trim()) {
      const contactEndpoint = `${window.location.origin}/api/contact`;
      promptParts.push(
        `Include a Contact Us form with name, email, and message fields (phone optional).
When the form is submitted, send a fetch POST with JSON to this contact API endpoint: ${contactEndpoint}
JSON body fields: websiteId, name, email, phone, message, businessName.
Set websiteId to "__WEBSITE_ID__". Do not send a recipient "to" address.
Show success and error messages on the page without a full reload.
Do not include API keys, Resend secrets, or any server-side code in the website files.
Do not use mailto: as the primary submit method.`,
      );
    }

    if (intake.use_trading_hours === "yes" && intake.trading_hours.trim()) {
      promptParts.push(
        `Trading hours:\n${intake.trading_hours.trim()}
Include a trading hours section with id="hours" using exactly these hours. Link it in the nav. Do not invent extra days, times, or public-holiday notes they did not provide.`,
      );
    } else {
      promptParts.push(
        `The business did not provide trading hours. Do not add a trading hours, opening hours, or hours of business section, and do not invent hours.`,
      );
    }

    const ethnicity = getPeopleEthnicityOption(intake.people_ethnicity);
    if (ethnicity) {
      promptParts.push(
        `People in website photos: ${ethnicity.prompt}. If an image includes people, they should be ${ethnicity.prompt}. Include this in every image prompt that depicts people.`,
      );
    }

    if (intake.design_preference.trim()) {
      promptParts.push(
        `Design preference: ${intake.design_preference.trim()}
Follow this closely in layout, colours, typography, and overall mood. If an instruction conflicts with keeping the site professional and usable, keep it usable and still honour the preference as far as possible.`,
      );
    }

    if (intake.extra_details.trim()) {
      promptParts.push(
        `Additional details from the customer:\n${intake.extra_details.trim()}
Use these details on the website where they fit. Do not invent extras beyond what they provided.`,
      );
    }

    return promptParts.join("\n\n");
  }

  async function runGeneration(
    intake: WebsiteIntake,
  ) {
    const epoch = runEpochRef.current;
    const description = compileBusinessDescription(intake);
    const name = intake.business_name.trim() || extractBusinessName(description);

    setBusinessDescription(description);
    setBusinessName(name);
    setStatus("generating");
    setError(null);
    setFiles([]);
    trackGenerateStart();

    if (!user && ensureLocalCredits() < GENERATE_EDITS_COST) {
      const message = `Generating a new site requires 2 Edits. You currently have ${ensureLocalCredits()}. Please top up.`;
      setStatus("error");
      setError(message);
      setChatLocked(false);
      openEditTopup();
      addAssistantMessage(message);
      return;
    }

    try {
      const response = await authFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: buildGeneratePrompt(intake),
          peopleEthnicity: intake.people_ethnicity || undefined,
          businessName: name,
          contactEmail: intake.contact_email || undefined,
          websiteId: websiteId || undefined,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
        editTopup?: boolean;
      };

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.jobId) {
        const message = data.error || "Website generation failed.";
        setStatus("error");
        setError(message);
        setChatLocked(false);
        clearJobView();
        trackGenerateFail();
        if (data.editTopup) {
          openEditTopup();
          addAssistantMessage(message);
        } else {
          addAssistantMessage(
            "Something went wrong while generating your website. Please try again.",
          );
        }
        return;
      }

      saveBuilderSession({
        websiteId: websiteId || "",
        businessName: name,
        businessDescription: description,
        jobId: data.jobId,
        jobKind: "generate",
      });

      const job = await waitForJob(data.jobId, epoch);
      if (isStaleRun(epoch)) return;

      const nextWebsiteId = job.websiteId;
      if (!nextWebsiteId) {
        throw new Error("Generation finished without a website id.");
      }

      setWebsiteId(nextWebsiteId);
      setFiles([]);
      setStatus("success");
      setChatPhase("edit");
      setChatLocked(false);
      setPendingIntake(null);
      setShowAddressModal(false);
      setIframeKey((key) => key + 1);
      clearJobView();
      trackGenerateSuccess(nextWebsiteId);
      saveBuilderSession({
        websiteId: nextWebsiteId,
        businessName: name,
        businessDescription: description,
      });
      if (!user) {
        consumeLocalEdits(GENERATE_EDITS_COST, `generate:${job.jobId}`);
        rememberGuestWebsite(nextWebsiteId);
      }
      addAssistantMessage(READY_MESSAGE);
      notifyEditsChanged();
      void refreshSubscription(nextWebsiteId);
    } catch (error) {
      if (isStaleRun(epoch)) return;
      if (error instanceof Error && error.message === "cancelled") return;
      setStatus("error");
      setChatLocked(false);
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Could not reach the generate API. Please try again.",
      );
      clearJobView();
      trackGenerateFail();
      addAssistantMessage(
        "Could not reach the server. Please try again in a moment.",
      );
    }
  }

  async function continueIntake(history: ChatMessage[], document?: IntakeUpload) {
    const epoch = runEpochRef.current;
    setStatus("chatting");
    setReadingDocument(Boolean(document));
    setError(null);

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: history,
          intake: latestIntakeRef.current ?? undefined,
          document,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        editTopup?: boolean;
      } & Partial<IntakeChatResult>;

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.reply || !data.intake) {
        if (data.editTopup || response.status === 402) {
          setChatLocked(true);
          setStatus("error");
          setError(data.error || "You need Edits to keep building. Please top up.");
          addAssistantMessage(data.error || "You need Edits to keep building. Please top up.");
          openEditTopup();
          return;
        }
        throw new Error(data.error || "Chat request failed.");
      }

      latestIntakeRef.current = data.intake;
      setPendingIntake(data.intake);
      if (document || data.intake.flyer_uploaded) {
        setFlyerUploaded(true);
      }
      addAssistantMessage(data.reply);
      notifyEditsChanged();

      const readyToBuild =
        data.complete ||
        (hasEnoughIntakeToGenerate(data.intake) &&
          (Boolean(data.intake.user_confirmed) || lastUserMessageIsConfirmation(history)));

      if (readyToBuild) {
        setShowAddressModal(true);
        setStatus("idle");
        trackIntakeComplete();
        return;
      }

      setStatus("idle");
    } catch (error) {
      if (isStaleRun(epoch)) return;
      setStatus("error");
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Could not continue the conversation. Please try again.";
      setError(message);
      addAssistantMessage("I couldn't reply just now. Please try again.");
    } finally {
      if (!isStaleRun(epoch)) {
        setReadingDocument(false);
      }
    }
  }

  async function applyEdit(instruction: string, image?: IntakeUpload | null) {
    if ((!instruction.trim() && !image) || !websiteId || isEditing) return;

    const epoch = runEpochRef.current;
    setIsEditing(true);
    setError(null);
    trackEditStart();

    if (!user && ensureLocalCredits() < EDIT_EDITS_COST) {
      const message = `Updating your site requires 1 Edit. Please top up for ${formatZar(EDIT_TOPUP_ZAR)}.`;
      setError(message);
      openEditTopup();
      addAssistantMessage(message);
      return;
    }

    try {
      const response = await authFetch("/api/edit", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          instruction: instruction.trim(),
          image: image ?? undefined,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
        editTopup?: boolean;
      };

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.jobId) {
        if (data.editTopup || response.status === 402) {
          openEditTopup();
        }
        setError(data.error || "Failed to apply changes.");
        clearJobView();
        addAssistantMessage(data.error || "I couldn't apply that change. Please try again.");
        return;
      }

      saveBuilderSession({
        websiteId,
        businessName,
        businessDescription,
        jobId: data.jobId,
        jobKind: "edit",
      });

      await waitForJob(data.jobId, epoch);
      if (isStaleRun(epoch)) return;

      setPendingEditImage(null);
      setIframeKey((key) => key + 1);
      trackEditSuccess();
      clearJobView();
      saveBuilderSession({
        websiteId,
        businessName,
        businessDescription,
      });
      if (!user) {
        consumeLocalEdits(EDIT_EDITS_COST, `edit:${data.jobId}`);
        rememberGuestWebsite(websiteId);
      }
      addAssistantMessage("Changes applied.");
      notifyEditsChanged();
    } catch (error) {
      if (isStaleRun(epoch)) return;
      if (error instanceof Error && error.message === "cancelled") return;
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Could not apply changes. Please try again.";
      setError(message);
      clearJobView();
      addAssistantMessage(message);
    } finally {
      if (!isStaleRun(epoch)) {
        setIsEditing(false);
      }
    }
  }

  function editMessageContent(text: string, image?: IntakeUpload | null): string {
    if (!image) return text;
    if (text) return `${text}\n\n[Photo attached: ${image.filename}]`;
    return `Replace a website photo with my uploaded image (${image.filename}).`;
  }

  function submitEdit(text: string) {
    const image = pendingEditImage;
    const content = editMessageContent(text, image);
    if (!content) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setChatInput("");
    setError(null);
    void applyEdit(text, image);
  }

  function handleBulkEditAddMore() {
    markBulkEditTipSeen();
    setShowBulkEditTip(false);
  }

  function handleBulkEditSend() {
    markBulkEditTipSeen();
    setShowBulkEditTip(false);
    const text = chatInput.trim();
    if (!text && !pendingEditImage) return;
    submitEdit(text);
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = chatInput.trim();
    if (chatDisabled) return;

    if (chatPhase === "edit") {
      if (!text && !pendingEditImage) return;
      if (!hasSeenBulkEditTip()) {
        setShowBulkEditTip(true);
        return;
      }
      submitEdit(text);
      return;
    }

    if (!text) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setChatInput("");
    setError(null);

    if (!intakeStartedRef.current) {
      intakeStartedRef.current = true;
      trackIntakeStart();
    }

    await continueIntake(nextMessages);
  }

  async function handleIntakeUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || chatDisabled || chatPhase !== "intake" || flyerUploaded || startedIntakeByChat) return;

    try {
      const document = await fileToIntakeUpload(file);
      const nextMessages: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content: `I uploaded ${document.filename} with my business information.`,
        },
      ];
      setMessages(nextMessages);
      setError(null);

      if (!intakeStartedRef.current) {
        intakeStartedRef.current = true;
        trackIntakeStart();
      }

      await continueIntake(nextMessages, document);
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Could not read that file.",
      );
    }
  }

  async function handleEditImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || chatDisabled || chatPhase !== "edit") return;

    try {
      const image = await fileToEditImageUpload(file);
      setPendingEditImage(image);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Could not read that photo.",
      );
    }
  }

  function openDeployCard() {
    if (!websiteId || checkoutConfirming) return;
    if (!isSubscribed) {
      setShowPaywall(true);
      return;
    }
    setShowDeployCard(true);
  }

  function handleSubscribed(domain: string, amountZar?: number) {
    setIsSubscribed(true);
    setSubscribedDomain(domain);
    setShowPaywall(false);
    setCheckoutNotice(null);
    setCheckoutConfirming(false);
    trackPurchase(domain, amountZar);
    notifyEditsChanged();
    addAssistantMessage(
      `You're subscribed. Another ${formatEdits(SUBSCRIPTION_EDITS_GRANT)} were added. Describe a change, or deploy ${domain}.`,
    );
  }

  function handleAddressChoice(address: string) {
    if (!pendingIntake || status === "generating") return;

    setShowAddressModal(false);
    trackAddressChoice(Boolean(address.trim()));
    void runGeneration({ ...pendingIntake, address });
  }

  function handleStartOver() {
    const jobId = activeJobId;
    const existingWebsiteId = websiteId;
    runEpochRef.current += 1;
    intakeStartedRef.current = false;
    if (jobId) {
      void authFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setChatInput("");
    setChatPhase("intake");
    setPendingIntake(null);
    latestIntakeRef.current = null;
    setChatLocked(false);
    setShowAddressModal(false);
    setBusinessDescription("");
    setBusinessName("");
    setStatus("idle");
    setReadingDocument(false);
    setFlyerUploaded(false);
    setPendingEditImage(null);
    setError(null);
    setFiles([]);
    setIsEditing(false);
    setProgressBarKey((key) => key + 1);
    setShowDeployCard(false);
    setShowPaywall(false);
    setCheckoutNotice(null);
    setCheckoutConfirming(false);
    clearJobView();
    if (existingWebsiteId) {
      saveBuilderSession({
        websiteId: existingWebsiteId,
        businessName: "",
        businessDescription: "",
      });
    } else {
      clearBuilderSession();
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[90rem] flex-1 flex-col overflow-x-hidden px-4 pb-4 pt-3 sm:px-5 sm:pb-4">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)] sm:rounded-[1.6rem]">
        {showAddressModal && pendingIntake ? (
          <AddressModal
            businessName={pendingIntake.business_name}
            onSkip={() => handleAddressChoice("")}
            onSubmit={handleAddressChoice}
            onBack={() => {
              setShowAddressModal(false);
              setStatus("idle");
              addAssistantMessage(
                "No problem. Tell me what to change, or say you're ready to generate.",
              );
            }}
          />
        ) : null}
        {showBulkEditTip ? (
          <BulkEditTipModal
            onAddMore={handleBulkEditAddMore}
            onSend={handleBulkEditSend}
          />
        ) : null}
        {showPaywall && websiteId ? (
          <PaywallCard
            websiteId={websiteId}
            suggestedName={suggestedDomainName}
            onClose={() => setShowPaywall(false)}
            onSubscribed={handleSubscribed}
          />
        ) : null}
        {showDeployCard && websiteId && isSubscribed ? (
          <DeployWorkspace
            websiteId={websiteId}
            suggestedName={suggestedDomainName}
            subscribedDomain={subscribedDomain ?? undefined}
            autoDeploy={autoDeploy}
            onClose={() => { setShowDeployCard(false); setAutoDeploy(false); }}
          />
        ) : null}
        <div className="flex min-w-0 items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2.5 sm:px-5 sm:py-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300" />
          <div className="ml-1 min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1 text-center text-[11px] text-stone-400 ring-1 ring-stone-200">
            yoursite.co.za
          </div>
          <button
            type="button"
            onClick={handleStartOver}
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
          >
            Reset
          </button>
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[20.5rem_minmax(0,1fr)] xl:grid-cols-[22.5rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f6f4ef] lg:border-r lg:border-stone-100">
            <div className="px-5 pb-1 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
                Chat
              </p>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-5 py-3">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[min(92%,100%)] break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "assistant"
                      ? "rounded-tl-md bg-white text-stone-700 shadow-sm ring-1 ring-stone-200/80"
                      : "ml-auto whitespace-pre-line rounded-tr-md bg-teal-800 text-white"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <ChatBubbleBody content={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              ))}
              {status === "chatting" ? (
                <div className="max-w-[min(92%,100%)] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  {readingDocument ? "Reading your document..." : "..."}
                </div>
              ) : null}
              {isEditing ? (
                <div className="max-w-[min(92%,100%)] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  Applying your changes...
                </div>
              ) : null}
              {previewUrl && chatPhase === "edit" ? (
                <div className="flex w-full min-w-0 gap-2">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full bg-teal-800 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 sm:px-4 lg:hidden"
                  >
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={openDeployCard}
                    disabled={checkoutConfirming}
                    className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-3 py-2.5 text-center text-sm font-semibold leading-tight text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 sm:px-4"
                  >
                    🚀 Publish Website
                  </button>
                </div>
              ) : null}
              {checkoutConfirming ? (
                <PayfastConfirmingBanner />
              ) : checkoutNotice ? (
                <div className="rounded-2xl bg-amber-100 px-3.5 py-2.5 text-sm font-medium text-amber-950 ring-1 ring-amber-300">
                  {checkoutNotice}
                </div>
              ) : null}
              {editShortage ? (
                <button
                  type="button"
                  onClick={() => openEditTopup()}
                  className="inline-flex max-w-[92%] items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Buy 1 Edit for {formatZar(EDIT_TOPUP_ZAR)}
                </button>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="min-w-0 border-t border-stone-200/80 bg-[#f6f4ef] px-5 py-3">
              <form onSubmit={handleChatSubmit} className="flex min-w-0 flex-col gap-2">
                {showUploadButton ? (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={showEditImageUpload ? EDIT_IMAGE_UPLOAD_ACCEPT : INTAKE_UPLOAD_ACCEPT}
                    multiple={false}
                    className="sr-only"
                    tabIndex={-1}
                    disabled={
                      chatDisabled || (showFlyerUpload && flyerUploaded)
                    }
                    onChange={
                      showEditImageUpload ? handleEditImageUpload : handleIntakeUpload
                    }
                  />
                ) : null}
                {pendingEditImage ? (
                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-2.5 py-2">
                    <img
                      src={`data:${pendingEditImage.mediaType};base64,${pendingEditImage.data}`}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-stone-800">
                        {pendingEditImage.filename}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        One photo at a time. Say which image to replace.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingEditImage(null)}
                      disabled={chatDisabled}
                      className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:text-stone-300"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
                <div className="relative flex min-w-0 items-center gap-2">
                  {showUploadButton ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={chatDisabled || (showFlyerUpload && flyerUploaded)}
                      aria-label={
                        showEditImageUpload
                          ? pendingEditImage
                            ? "Replace the attached photo"
                            : "Attach a photo to replace on the website"
                          : flyerUploaded
                            ? "A flyer or PDF has already been uploaded for this website"
                            : "Upload a flyer, business card, or PDF"
                      }
                      title={
                        showEditImageUpload
                          ? "Replace one website photo with your own (one image at a time)"
                          : flyerUploaded
                            ? "You can upload one flyer or PDF per website"
                            : "Upload a flyer, business card, or PDF"
                      }
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 ${
                        showEditImageUpload && pendingEditImage
                          ? "border-teal-700 text-teal-800 ring-2 ring-teal-700/20"
                          : "border-stone-300 text-stone-600 hover:text-teal-800"
                      }`}
                    >
                      <PaperclipIcon />
                    </button>
                  ) : null}
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    maxLength={500}
                    placeholder={
                      outOfEdits
                        ? "Buy Edits to continue"
                        : chatLocked
                          ? "Edits have been used up"
                          : chatPhase === "edit"
                            ? pendingEditImage
                              ? "Which photo should this replace?"
                              : "Describe a change, or attach a photo..."
                            : showFlyerUpload
                              ? "Message, or upload a flyer..."
                              : "Message..."
                    }
                    disabled={chatDisabled}
                    className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100 sm:px-4"
                  />
                  <button
                    type="submit"
                    disabled={
                      chatDisabled ||
                      (!chatInput.trim() && !(showEditImageUpload && pendingEditImage))
                    }
                    className="shrink-0 rounded-full bg-teal-800 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:px-4"
                  >
                    Send
                  </button>
                </div>
                <p className="px-1 text-[11px] leading-relaxed text-stone-500">
                  Making a change uses 1 Edit (2 Edits for full site generation).
                </p>
                {outOfEdits ? (
                  <button
                    type="button"
                    onClick={() => openEditTopup()}
                    className="inline-flex items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                  >
                    Buy 1 Edit for {formatZar(EDIT_TOPUP_ZAR)}
                  </button>
                ) : null}
                <GenerationProgressBar
                  key={progressBarKey}
                  active={status === "generating" || isEditing}
                  progress={jobProgress}
                  label={
                    jobMessage ||
                    (isEditing
                      ? "Applying your changes..."
                      : "Building your website and images...")
                  }
                  completeLabel={isEditing ? "Changes applied!" : "Website ready!"}
                />
              </form>
              {error ? (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="break-words text-xs text-red-700">{error}</p>
                  {editShortage ? (
                    <button
                      type="button"
                      onClick={() => openEditTopup()}
                      className="self-start rounded-full bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-700"
                    >
                      Buy 1 Edit for {formatZar(EDIT_TOPUP_ZAR)}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>

          <section className="relative hidden min-h-0 overflow-hidden bg-[#f7f3ea] lg:block">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-700/10" />
            <div className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-amber-200/40" />
            {previewUrl ? (
              <iframe
                key={iframeKey}
                src={previewUrl}
                title="Website preview"
                className="relative h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms"
              />
            ) : (
              <EmptyPreview generating={status === "generating"} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
