"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DeployWorkspace from "@/components/DeployWorkspace";
import PaywallCard from "@/components/PaywallCard";
import GenerationProgressBar from "@/components/GenerationProgressBar";
import {
  clearBuilderSession,
  loadBuilderSession,
  saveBuilderSession,
} from "@/lib/builder-session";
import { extractBusinessName, slugifyDomainName } from "@/lib/domain-name";
import { extractEmail, isValidEmail } from "@/lib/email";
import {
  PEOPLE_ETHNICITY_OPTIONS,
  getPeopleEthnicityOption,
  type PeopleEthnicityId,
} from "@/lib/people-ethnicity";
import type { GenerateWebsiteResponse, WebsiteFile } from "@/lib/types";

type AddressSuggestion = {
  description: string;
  place_id: string;
};

type GenerationStatus = "idle" | "validating" | "generating" | "success" | "error";
type ChatStep =
  | "description"
  | "whatsapp"
  | "contact"
  | "contactEmail"
  | "address"
  | "ethnicity"
  | "edit";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const WELCOME_MESSAGE =
  "Hi! I'm here to help build your website. Tell me about your business — your business name, the services you offer, and your phone number and if we can use this number for whatsapp";

const WHATSAPP_QUESTION =
  "Would you like a WhatsApp button on your website so customers can message you directly?";

const ADDRESS_QUESTION =
  "Would you like to add your business address? If you provide one, we'll add a Google Map to your website. Start typing your address below, or click Skip.";

const ETHNICITY_QUESTION =
  "If the website photos include people, who should they look like? This helps the images feel like your customers and team.";

const CONTACT_QUESTION =
  "Would you like a Contact Us form on your website so customers can send you messages?";

const CONTACT_EMAIL_QUESTION =
  "What email address should we send contact form submissions to?";

const READY_MESSAGE =
  "Your website is ready. Preview it for free. Subscribe to describe changes or deploy it live.";

function isNegative(text: string): boolean {
  return /\b(no|nah|nope|skip|don't|not)\b/i.test(text);
}

function isSkipLikeInput(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return ["s", "sk", "ski", "skip", "n", "no", "na", "nah", "nope"].includes(
    trimmed,
  );
}

function shouldUseAddressAutocomplete(text: string): boolean {
  return text.trim().length >= 3 && !isSkipLikeInput(text);
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
            : "Describe your business in the chat. We'll design the site and show a live preview on this side."}
        </p>
      </div>
    </div>
  );
}

export default function WebsiteBuilder() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatStep, setChatStep] = useState<ChatStep>("description");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [useWhatsApp, setUseWhatsApp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [useContactForm, setUseContactForm] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [peopleEthnicity, setPeopleEthnicity] = useState<PeopleEthnicityId | "">(
    "",
  );
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [files, setFiles] = useState<WebsiteFile[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDeployCard, setShowDeployCard] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribedDomain, setSubscribedDomain] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  const isBusy = status === "validating" || status === "generating" || isEditing;
  const previewUrl = websiteId ? `/api/preview/${websiteId}/index.html` : null;
  const editLocked = chatStep === "edit" && !isSubscribed;
  const suggestedDomainName = slugifyDomainName(
    businessName || extractBusinessName(businessDescription),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, isEditing, checkoutNotice]);

  useEffect(() => {
    const urlWebsiteId = searchParams.get("websiteId")?.trim() ?? "";
    const checkout = searchParams.get("checkout");
    const session = loadBuilderSession();
    const nextWebsiteId = urlWebsiteId || session?.websiteId || "";

    if (!nextWebsiteId) {
      return;
    }

    if (session?.websiteId === nextWebsiteId) {
      setWebsiteId(session.websiteId);
      setBusinessName(session.businessName);
      setBusinessDescription(session.businessDescription);
      setChatStep("edit");
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
      setChatStep("edit");
      setStatus("success");
    }

    if (checkout === "cancel") {
      setCheckoutNotice(
        "Payment was cancelled. Subscribe when you're ready to edit or deploy.",
      );
      setShowPaywall(true);
    } else if (checkout === "return") {
      setCheckoutNotice("Confirming your PayFast subscription...");
    }

    void refreshSubscription(nextWebsiteId, checkout === "return");
    // Restore once from the return URL / saved session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chatStep !== "address" || !shouldUseAddressAutocomplete(chatInput)) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(chatInput.trim())}`,
        );
        const data = (await response.json()) as {
          predictions?: AddressSuggestion[];
        };

        if (response.ok && data.predictions) {
          setAddressSuggestions(data.predictions);
          setShowAddressSuggestions(data.predictions.length > 0);
        } else {
          setAddressSuggestions([]);
          setShowAddressSuggestions(false);
        }
      } catch {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [chatInput, chatStep]);

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    setChatInput(suggestion.description);

    try {
      const response = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.place_id)}`,
      );
      const data = (await response.json()) as { formatted_address?: string };

      if (response.ok && data.formatted_address) {
        setChatInput(data.formatted_address);
      }
    } catch {
      // Keep the autocomplete description if details lookup fails.
    }
  }

  function addAssistantMessage(content: string) {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }

  async function refreshSubscription(id: string, poll = false) {
    const deadline = Date.now() + (poll ? 25_000 : 0);

    while (true) {
      try {
        const response = await fetch(
          `/api/subscription?websiteId=${encodeURIComponent(id)}`,
        );
        const data = (await response.json()) as {
          success?: boolean;
          paid?: boolean;
          subscription?: { domain?: string };
        };

        if (response.ok && data.paid) {
          setIsSubscribed(true);
          setSubscribedDomain(data.subscription?.domain ?? null);
          setShowPaywall(false);
          setCheckoutNotice(null);
          if (poll && data.subscription?.domain) {
            addAssistantMessage(
              `You're subscribed. Describe a change, or deploy ${data.subscription.domain}.`,
            );
          }
          return;
        }
      } catch {
        // Keep polling or fall through.
      }

      if (!poll || Date.now() >= deadline) {
        if (poll) {
          setCheckoutNotice(
            "Waiting for PayFast to confirm payment. This can take a few seconds.",
          );
          setShowPaywall(true);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function validateDescription(description: string) {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: description }),
    });

    const data = (await response.json()) as {
      success: boolean;
      valid?: boolean;
      message?: string;
      business_name?: string;
      whatsapp_preference?: "yes" | "no" | "unknown";
      whatsapp_number?: string;
      error?: string;
    };

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Validation failed.");
    }

    return data;
  }

  async function runGeneration(ethnicityId: PeopleEthnicityId | "" = peopleEthnicity) {
    if (!businessDescription.trim() || isBusy) return;

    setStatus("generating");
    setError(null);
    setWebsiteId(null);
    setFiles([]);

    const promptParts = [businessDescription.trim()];

    if (address.trim()) {
      promptParts.push(
        `Business address: ${address.trim()}\nInclude an embedded Google Map on the website showing this location.`,
      );
    }

    if (useWhatsApp) {
      const number = whatsappNumber.trim();
      if (number) {
        promptParts.push(
          `Add a WhatsApp contact button or link on the website using this WhatsApp number: ${number}. The business phone number for calls may be different — show both correctly if they differ.`,
        );
      } else {
        promptParts.push(
          "Add a WhatsApp contact button or link on the website so customers can message the business via WhatsApp. Use the phone number from the description for the WhatsApp link.",
        );
      }
    }

    if (useContactForm && contactEmail.trim()) {
      const contactEndpoint = `${window.location.origin}/api/contact`;
      promptParts.push(
        `Include a Contact Us form with name, email, and message fields (phone optional).
When the form is submitted, send a fetch POST with JSON to this contact API endpoint: ${contactEndpoint}
JSON body fields: to, name, email, phone, message, businessName.
Set "to" to "${contactEmail.trim()}".
Show success and error messages on the page without a full reload.
Do not include API keys, Resend secrets, or any server-side code in the website files.
Do not use mailto: as the primary submit method.`,
      );
    }

    const ethnicity = getPeopleEthnicityOption(ethnicityId);
    if (ethnicity) {
      promptParts.push(
        `People in website photos: ${ethnicity.prompt}. If an image includes people, they should be ${ethnicity.prompt}. Include this in every image prompt that depicts people.`,
      );
    }

    const fullPrompt = promptParts.join("\n\n");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          peopleEthnicity: ethnicityId || undefined,
        }),
      });

      const data = (await response.json()) as GenerateWebsiteResponse;

      if (!response.ok || !data.success) {
        const message =
          "error" in data && data.error ? data.error : "Website generation failed.";
        setStatus("error");
        setError(message);
        addAssistantMessage(
          "Something went wrong while generating your website. Please try again.",
        );
        return;
      }

      setWebsiteId(data.websiteId);
      setFiles(data.files);
      setStatus("success");
      setChatStep("edit");
      setIsSubscribed(false);
      setSubscribedDomain(null);
      saveBuilderSession({
        websiteId: data.websiteId,
        businessName,
        businessDescription,
      });
      addAssistantMessage(READY_MESSAGE);
    } catch {
      setStatus("error");
      setError("Could not reach the generate API. Please try again.");
      addAssistantMessage(
        "Could not reach the server. Please try again in a moment.",
      );
    }
  }

  function askEthnicity() {
    setChatStep("ethnicity");
    addAssistantMessage(ETHNICITY_QUESTION);
  }

  async function completeAddressStep(text: string) {
    if (!isSkipLikeInput(text) && !isNegative(text)) {
      setAddress(text);
    }
    askEthnicity();
  }

  async function handleEthnicityChoice(id: PeopleEthnicityId) {
    if (isBusy || chatStep !== "ethnicity") return;

    const option = getPeopleEthnicityOption(id);
    if (!option) return;

    setPeopleEthnicity(id);
    setMessages((prev) => [...prev, { role: "user", content: option.label }]);
    addAssistantMessage("Got it. Building your website and images...");
    await runGeneration(id);
  }

  function askAddress() {
    setChatStep("address");
    addAssistantMessage(ADDRESS_QUESTION);
  }

  function askContactForm() {
    setChatStep("contact");
    addAssistantMessage(CONTACT_QUESTION);
  }

  function proceedAfterDescriptionValid(
    result: {
      whatsapp_preference?: "yes" | "no" | "unknown";
      whatsapp_number?: string;
    },
  ) {
    const preference = result.whatsapp_preference ?? "unknown";
    const extractedNumber = result.whatsapp_number?.trim() ?? "";

    if (preference === "yes") {
      setUseWhatsApp(true);
      if (extractedNumber) {
        setWhatsappNumber(extractedNumber);
      }
      if (extractedNumber) {
        addAssistantMessage(
          `Got it — we'll add WhatsApp using ${extractedNumber}.`,
        );
      }
      askContactForm();
      return;
    }

    if (preference === "no") {
      setUseWhatsApp(false);
      setWhatsappNumber("");
      askContactForm();
      return;
    }

    setChatStep("whatsapp");
    addAssistantMessage(WHATSAPP_QUESTION);
  }

  async function handleWhatsAppChoice(wantsWhatsApp: boolean) {
    if (isBusy || chatStep !== "whatsapp") return;

    setUseWhatsApp(wantsWhatsApp);
    if (!wantsWhatsApp) {
      setWhatsappNumber("");
    }
    setMessages((prev) => [
      ...prev,
      { role: "user", content: wantsWhatsApp ? "Yes" : "No" },
    ]);
    askContactForm();
  }

  function handleContactChoice(wantsContactForm: boolean) {
    if (isBusy || chatStep !== "contact") return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: wantsContactForm ? "Yes" : "No" },
    ]);

    if (!wantsContactForm) {
      setUseContactForm(false);
      setContactEmail("");
      askAddress();
      return;
    }

    setUseContactForm(true);
    const extracted = extractEmail(businessDescription);
    if (extracted) {
      setContactEmail(extracted);
      addAssistantMessage(`We'll send form submissions to ${extracted}.`);
      askAddress();
      return;
    }

    setChatStep("contactEmail");
    addAssistantMessage(CONTACT_EMAIL_QUESTION);
  }

  function completeContactEmailStep(text: string) {
    if (isSkipLikeInput(text) || isNegative(text)) {
      setUseContactForm(false);
      setContactEmail("");
      askAddress();
      return;
    }

    const parsed = extractEmail(text) || (isValidEmail(text) ? text.trim() : "");
    if (!parsed) {
      addAssistantMessage("Please enter a valid email address, or click Skip.");
      return;
    }

    setUseContactForm(true);
    setContactEmail(parsed);
    addAssistantMessage(`Got it — submissions will go to ${parsed}.`);
    askAddress();
  }

  async function handleSkipContactEmail() {
    if (isBusy || chatStep !== "contactEmail") return;

    setMessages((prev) => [...prev, { role: "user", content: "Skip contact form" }]);
    setChatInput("");
    setUseContactForm(false);
    setContactEmail("");
    askAddress();
  }

  async function handleSkipAddress() {
    if (isBusy || chatStep !== "address") return;

    setMessages((prev) => [...prev, { role: "user", content: "Skip address" }]);
    setChatInput("");
    setError(null);
    await completeAddressStep("skip");
  }

  async function applyEdit(instruction: string) {
    if (!instruction.trim() || !websiteId || isEditing) return;

    setIsEditing(true);
    setError(null);

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          instruction: instruction.trim(),
        }),
      });

      const data = (await response.json()) as {
        success: boolean;
        updatedFiles?: WebsiteFile[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        if (response.status === 402) {
          setIsSubscribed(false);
          setShowPaywall(true);
        }
        setError(data.error || "Failed to apply changes.");
        addAssistantMessage(data.error || "I couldn't apply that change. Please try again.");
        return;
      }

      if (data.updatedFiles) {
        setFiles((prev) => {
          const updated = [...prev];
          for (const updatedFile of data.updatedFiles!) {
            const idx = updated.findIndex((file) => file.path === updatedFile.path);
            if (idx >= 0) {
              updated[idx] = updatedFile;
            } else {
              updated.push(updatedFile);
            }
          }
          return updated;
        });
      }

      setIframeKey((key) => key + 1);
      addAssistantMessage("Changes applied. Open the preview to see them.");
    } catch {
      setError("Could not apply changes. Please try again.");
      addAssistantMessage("Could not apply changes. Please try again.");
    } finally {
      setIsEditing(false);
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = chatInput.trim();
    if (isBusy) return;

    if (chatStep === "edit" && !isSubscribed) {
      setShowPaywall(true);
      return;
    }

    if (!text) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setChatInput("");
    setError(null);

    if (chatStep === "edit") {
      await applyEdit(text);
      return;
    }

    if (chatStep === "description") {
      const updatedDescription = businessDescription
        ? `${businessDescription}\n${text}`
        : text;
      setBusinessDescription(updatedDescription);
      setStatus("validating");

      try {
        const result = await validateDescription(updatedDescription);

        if (!result.valid) {
          setStatus("idle");
          addAssistantMessage(
            result.message ||
              "Please provide your business name, the services you offer, and your phone number.",
          );
          return;
        }

        setStatus("idle");
        const extractedName = result.business_name?.trim();
        setBusinessName(
          extractedName || extractBusinessName(updatedDescription),
        );
        proceedAfterDescriptionValid(result);
      } catch {
        setStatus("error");
        setError("Could not validate your description. Please try again.");
        addAssistantMessage("I couldn't check your details right now. Please try again.");
      }
      return;
    }

    if (chatStep === "contactEmail") {
      completeContactEmailStep(text);
      return;
    }

    if (chatStep === "address") {
      await completeAddressStep(text);
    }
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
    addAssistantMessage(
      `You're subscribed. Describe a change, or deploy ${domain}.`,
    );
  }

  function handleStartOver() {
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setChatInput("");
    setChatStep("description");
    setBusinessDescription("");
    setBusinessName("");
    setAddress("");
    setUseWhatsApp(false);
    setWhatsappNumber("");
    setUseContactForm(false);
    setContactEmail("");
    setPeopleEthnicity("");
    setStatus("idle");
    setError(null);
    setWebsiteId(null);
    setFiles([]);
    setShowDeployCard(false);
    setShowPaywall(false);
    setIsSubscribed(false);
    setSubscribedDomain(null);
    setCheckoutNotice(null);
    clearBuilderSession();
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)]">
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
              {status === "validating" ? (
                <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  Checking your details...
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
              {previewUrl && chatStep === "edit" ? (
                <div className="flex max-w-[92%] gap-2">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                  >
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={openDeployCard}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Deploy
                  </button>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-stone-200/80 bg-[#f6f4ef] p-3">
              {chatStep === "ethnicity" ? (
                <div className="flex flex-wrap gap-2">
                  {PEOPLE_ETHNICITY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleEthnicityChoice(option.id)}
                      disabled={isBusy}
                      className="inline-flex min-w-[46%] flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : chatStep === "whatsapp" || chatStep === "contact" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      chatStep === "whatsapp"
                        ? handleWhatsAppChoice(true)
                        : handleContactChoice(true)
                    }
                    disabled={isBusy}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      chatStep === "whatsapp"
                        ? handleWhatsAppChoice(false)
                        : handleContactChoice(false)
                    }
                    disabled={isBusy}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              ) : (
                <form onSubmit={handleChatSubmit} className="flex flex-col gap-2">
                  <div className="relative flex gap-2">
                    <input
                      type={chatStep === "contactEmail" ? "email" : "text"}
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onFocus={() => {
                        if (editLocked) {
                          setShowPaywall(true);
                          return;
                        }
                        if (addressSuggestions.length > 0) {
                          setShowAddressSuggestions(true);
                        }
                      }}
                      onClick={() => {
                        if (editLocked) {
                          setShowPaywall(true);
                        }
                      }}
                      readOnly={editLocked}
                      placeholder={
                        chatStep === "address"
                          ? "Start typing your address..."
                          : chatStep === "contactEmail"
                            ? "Enter your email address..."
                            : chatStep === "edit"
                              ? "Describe a change..."
                              : "Describe your business..."
                      }
                      disabled={isBusy}
                      className={`w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100 ${
                        editLocked ? "cursor-pointer" : ""
                      }`}
                    />
                    {chatStep === "address" || chatStep === "contactEmail" ? (
                      <button
                        type="button"
                        onClick={
                          chatStep === "contactEmail"
                            ? handleSkipContactEmail
                            : handleSkipAddress
                        }
                        disabled={isBusy}
                        className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        Skip
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={isBusy || (!editLocked && !chatInput.trim())}
                      className="shrink-0 rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                    >
                      Send
                    </button>
                    {chatStep === "address" &&
                    showAddressSuggestions &&
                    addressSuggestions.length > 0 ? (
                      <ul className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
                        {addressSuggestions.map((suggestion) => (
                          <li key={suggestion.place_id}>
                            <button
                              type="button"
                              onClick={() => selectAddressSuggestion(suggestion)}
                              className="w-full px-4 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-50"
                            >
                              {suggestion.description}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <GenerationProgressBar
                    active={status === "generating" || isEditing}
                    durationMs={status === "generating" ? 120_000 : 60_000}
                    label={
                      isEditing
                        ? "Applying your changes..."
                        : "Building your website and images..."
                    }
                    completeLabel={isEditing ? "Changes applied!" : "Website ready!"}
                  />
                </form>
              )}
              {error ? (
                <p className="mt-2 text-xs text-red-700">{error}</p>
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
                sandbox="allow-scripts allow-same-origin allow-forms"
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
