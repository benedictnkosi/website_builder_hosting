"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AddressModal from "@/components/AddressModal";
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
  type ChatMessage,
  type IntakeChatResult,
  type WebsiteIntake,
} from "@/lib/intake";
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
import { notifyTokensChanged, openTokenTopup } from "@/lib/token-events";
import { formatZar, TOKEN_TOPUP_ZAR } from "@/lib/pricing";

type GenerationStatus = "idle" | "chatting" | "generating" | "success" | "error";
type ChatPhase = "intake" | "edit";

const WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business.";

const READY_MESSAGE =
  "Your website is ready. Preview it, describe any changes, and subscribe when you want to deploy it live.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
            : "Chat about your business. We'll design the site and show a live preview on this side."}
        </p>
      </div>
    </div>
  );
}

export default function WebsiteBuilder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatPhase, setChatPhase] = useState<ChatPhase>("intake");
  const [pendingIntake, setPendingIntake] = useState<WebsiteIntake | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [, setFiles] = useState<WebsiteFile[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDeployCard, setShowDeployCard] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribedDomain, setSubscribedDomain] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [progressBarKey, setProgressBarKey] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const runEpochRef = useRef(0);
  const intakeStartedRef = useRef(false);

  const isBusy =
    status === "chatting" ||
    status === "generating" ||
    isEditing ||
    showAddressModal;
  const previewUrl = websiteId ? `/api/preview/${websiteId}/index.html` : null;
  const tokenShortage = Boolean(error?.toLowerCase().includes("token"));
  const suggestedDomainName = slugifyDomainName(
    businessName || extractBusinessName(businessDescription),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, isEditing, checkoutNotice]);

  useEffect(() => {
    if (showPaywall && websiteId) {
      trackPaywallView(websiteId);
    }
  }, [showPaywall, websiteId]);

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
    const deadline = Date.now() + (poll ? 90_000 : 0);

    while (!isStaleRun(epoch)) {
      try {
        const response = await authFetch(
          `/api/subscription?websiteId=${encodeURIComponent(id)}`,
        );
        const data = (await response.json()) as {
          success?: boolean;
          paid?: boolean;
          subscription?: { domain?: string };
        };

        if (response.ok && data.paid) {
          if (isStaleRun(epoch)) return;
          setIsSubscribed(true);
          setSubscribedDomain(data.subscription?.domain ?? null);
          setShowPaywall(false);
          setCheckoutNotice(null);
          if (poll && data.subscription?.domain) {
            trackPurchase(data.subscription.domain);
            notifyTokensChanged();
            addAssistantMessage(
              `You're subscribed. Another 20,000 tokens were added to your balance. Describe a change, or deploy ${data.subscription.domain}.`,
            );
          }
          return;
        }
      } catch {
        // Keep polling or fall through.
      }

      if (!poll || Date.now() >= deadline) {
        if (poll && !isStaleRun(epoch)) {
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
    const resumeKind = session?.jobKind === "edit" || nextWebsiteId ? "edit" : "generate";

    if (session?.businessName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved builder session once on mount
      setBusinessName(session.businessName);
    }
    if (session?.businessDescription) {
      setBusinessDescription(session.businessDescription);
    }

    if (resumeJobId && !urlWebsiteId) {
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
            addAssistantMessage(READY_MESSAGE);
            notifyTokensChanged();
          } else if (job.kind === "edit") {
            setIframeKey((key) => key + 1);
            trackEditSuccess();
            saveBuilderSession({
              websiteId: job.websiteId || nextWebsiteId,
              businessName: session?.businessName ?? "",
              businessDescription: session?.businessDescription ?? "",
            });
            addAssistantMessage("Changes applied.");
            notifyTokensChanged();
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
      setCheckoutNotice(
        "Payment was cancelled. Subscribe when you're ready to deploy.",
      );
      setShowPaywall(true);
      trackCheckoutCancel();
    } else if (checkout === "return") {
      setCheckoutNotice("Confirming your PayFast subscription...");
    }

    void refreshSubscription(nextWebsiteId, checkout === "return");
    void authFetch("/api/sites/claim", {
      method: "POST",
      body: JSON.stringify({
        websiteId: nextWebsiteId,
        businessName: session?.businessName ?? "",
      }),
    }).catch(() => {
      // Keep the builder usable even if claiming fails.
    });
    // Restore once from the return URL / saved session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildGeneratePrompt(intake: WebsiteIntake): string {
    const promptParts = [compileBusinessDescription(intake)];

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

  async function runGeneration(intake: WebsiteIntake) {
    const epoch = runEpochRef.current;
    const description = compileBusinessDescription(intake);
    const name = intake.business_name.trim() || extractBusinessName(description);

    setBusinessDescription(description);
    setBusinessName(name);
    setStatus("generating");
    setError(null);
    setWebsiteId(null);
    setFiles([]);
    trackGenerateStart();

    try {
      const response = await authFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: buildGeneratePrompt(intake),
          peopleEthnicity: intake.people_ethnicity || undefined,
          businessName: name,
          contactEmail: intake.contact_email || undefined,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
        tokenTopup?: boolean;
      };

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.jobId) {
        const message = data.error || "Website generation failed.";
        setStatus("error");
        setError(message);
        clearJobView();
        trackGenerateFail();
        if (data.tokenTopup) {
          openTokenTopup();
          addAssistantMessage(
            "You've used your building tokens. Buy more tokens to generate this website.",
          );
        } else {
          addAssistantMessage(
            "Something went wrong while generating your website. Please try again.",
          );
        }
        return;
      }

      saveBuilderSession({
        websiteId: "",
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
      setPendingIntake(null);
      setShowAddressModal(false);
      setIsSubscribed(false);
      setSubscribedDomain(null);
      clearJobView();
      trackGenerateSuccess(nextWebsiteId);
      saveBuilderSession({
        websiteId: nextWebsiteId,
        businessName: name,
        businessDescription: description,
      });
      addAssistantMessage(READY_MESSAGE);
      notifyTokensChanged();
    } catch (error) {
      if (isStaleRun(epoch)) return;
      if (error instanceof Error && error.message === "cancelled") return;
      setStatus("error");
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

  async function continueIntake(history: ChatMessage[]) {
    const epoch = runEpochRef.current;
    setStatus("chatting");
    setError(null);

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: history }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        tokenTopup?: boolean;
      } & Partial<IntakeChatResult>;

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.reply || !data.intake) {
        if (data.tokenTopup) {
          openTokenTopup();
          throw new Error(data.error || "You don't have enough tokens to continue.");
        }
        throw new Error(data.error || "Chat request failed.");
      }

      addAssistantMessage(data.reply);
      notifyTokensChanged();

      if (data.complete) {
        setPendingIntake(data.intake);
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
      addAssistantMessage(
        message.includes("tokens")
          ? "You've used your building tokens. Buy more tokens to keep chatting."
          : "I couldn't reply just now. Please try again.",
      );
    }
  }

  async function applyEdit(instruction: string) {
    if (!instruction.trim() || !websiteId || isEditing) return;

    const epoch = runEpochRef.current;
    setIsEditing(true);
    setError(null);
    trackEditStart();

    try {
      const response = await authFetch("/api/edit", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          instruction: instruction.trim(),
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
        tokenTopup?: boolean;
      };

      if (isStaleRun(epoch)) return;

      if (!response.ok || !data.success || !data.jobId) {
        if (data.tokenTopup || response.status === 402) {
          openTokenTopup();
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

      setIframeKey((key) => key + 1);
      trackEditSuccess();
      clearJobView();
      saveBuilderSession({
        websiteId,
        businessName,
        businessDescription,
      });
      addAssistantMessage("Changes applied.");
      notifyTokensChanged();
    } catch (error) {
      if (isStaleRun(epoch)) return;
      if (error instanceof Error && error.message === "cancelled") return;
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Could not apply changes. Please try again.",
      );
      clearJobView();
      addAssistantMessage("Could not apply changes. Please try again.");
    } finally {
      if (!isStaleRun(epoch)) {
        setIsEditing(false);
      }
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = chatInput.trim();
    if (isBusy) return;

    if (!text) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setChatInput("");
    setError(null);

    if (chatPhase === "edit") {
      await applyEdit(text);
      return;
    }

    if (!intakeStartedRef.current) {
      intakeStartedRef.current = true;
      trackIntakeStart();
    }

    await continueIntake(nextMessages);
  }

  function openDeployCard() {
    if (!websiteId) return;
    if (!isSubscribed) {
      setShowPaywall(true);
      return;
    }
    setShowDeployCard(true);
  }

  function handleSubscribed(domain: string) {
    setIsSubscribed(true);
    setSubscribedDomain(domain);
    setShowPaywall(false);
    setCheckoutNotice(null);
    trackPurchase(domain);
    notifyTokensChanged();
    addAssistantMessage(
      `You're subscribed. Another 20,000 tokens were added to your balance. Describe a change, or deploy ${domain}.`,
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
    setShowAddressModal(false);
    setBusinessDescription("");
    setBusinessName("");
    setStatus("idle");
    setError(null);
    setWebsiteId(null);
    setFiles([]);
    setIsEditing(false);
    setIframeKey((key) => key + 1);
    setProgressBarKey((key) => key + 1);
    setShowDeployCard(false);
    setShowPaywall(false);
    setIsSubscribed(false);
    setSubscribedDomain(null);
    setCheckoutNotice(null);
    clearJobView();
    clearBuilderSession();
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)]">
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
            onClose={() => setShowDeployCard(false)}
          />
        ) : null}
        <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <div className="ml-2 min-w-0 flex-1 rounded-full bg-white px-3 py-1 text-center text-[11px] text-stone-400 ring-1 ring-stone-200">
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

        <div className="grid min-h-0 flex-1 lg:grid-cols-[20.5rem_minmax(0,1fr)] xl:grid-cols-[22.5rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-1 flex-col bg-[#f6f4ef] lg:border-r lg:border-stone-100">
            <div className="px-4 pb-1 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
                Chat
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "assistant"
                      ? "rounded-tl-md bg-white text-stone-700 shadow-sm ring-1 ring-stone-200/80"
                      : "ml-auto rounded-tr-md bg-teal-800 text-white"
                  }`}
                >
                  {message.content}
                </div>
              ))}
              {status === "chatting" ? (
                <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  ...
                </div>
              ) : null}
              {checkoutNotice ? (
                <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-600 shadow-sm ring-1 ring-stone-200/80">
                  {checkoutNotice}
                </div>
              ) : null}
              {isEditing ? (
                <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  Applying your changes...
                </div>
              ) : null}
              {previewUrl && chatPhase === "edit" ? (
                <div className="flex max-w-[92%] gap-2">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 lg:hidden"
                  >
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={openDeployCard}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    🚀 Publish Website
                  </button>
                </div>
              ) : null}
              {tokenShortage ? (
                <button
                  type="button"
                  onClick={() => openTokenTopup()}
                  className="inline-flex max-w-[92%] items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Buy tokens · {formatZar(TOKEN_TOPUP_ZAR)}
                </button>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-stone-200/80 bg-[#f6f4ef] p-3">
              <form onSubmit={handleChatSubmit} className="flex flex-col gap-2">
                <div className="relative flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={
                      chatPhase === "edit" ? "Describe a change..." : "Message..."
                    }
                    disabled={isBusy}
                    className="w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100"
                  />
                  <button
                    type="submit"
                    disabled={isBusy || !chatInput.trim()}
                    className="shrink-0 rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    Send
                  </button>
                </div>
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
                  <p className="text-xs text-red-700">{error}</p>
                  {tokenShortage ? (
                    <button
                      type="button"
                      onClick={() => openTokenTopup()}
                      className="self-start rounded-full bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-700"
                    >
                      Buy tokens
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
