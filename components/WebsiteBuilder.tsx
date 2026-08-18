"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GenerationProgressBar from "@/components/GenerationProgressBar";
import HoldToValidateButton from "@/components/HoldToValidateButton";
import type { GenerateWebsiteResponse, WebsiteFile } from "@/lib/types";

type AddressSuggestion = {
  description: string;
  place_id: string;
};

type View = "builder" | "preview";
type GenerationStatus = "idle" | "validating" | "generating" | "success" | "error";
type DeployStatus = "idle" | "deploying" | "success" | "error";
type ChatStep = "description" | "whatsapp" | "address";

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

function isAffirmative(text: string): boolean {
  return /\b(yes|yeah|yep|sure|ok|okay|please|definitely|absolutely)\b/i.test(text);
}

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

export default function WebsiteBuilder() {
  const [view, setView] = useState<View>("builder");
  const [humanVerified, setHumanVerified] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStep, setChatStep] = useState<ChatStep>("description");
  const [businessDescription, setBusinessDescription] = useState("");
  const [address, setAddress] = useState("");
  const [useWhatsApp, setUseWhatsApp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [files, setFiles] = useState<WebsiteFile[]>([]);
  const [editInstruction, setEditInstruction] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [domain, setDomain] = useState("");
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedDomain, setDeployedDomain] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isBusy = status === "validating" || status === "generating";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

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

  function handleHumanVerified() {
    setHumanVerified(true);
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
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
      whatsapp_preference?: "yes" | "no" | "unknown";
      whatsapp_number?: string;
      error?: string;
    };

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Validation failed.");
    }

    return data;
  }

  async function runGeneration() {
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

    const fullPrompt = promptParts.join("\n\n");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
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
      setDeployStatus("idle");
      setDeployError(null);
      setDeployedDomain(null);
      setDeployedUrl(null);
      setView("preview");
    } catch {
      setStatus("error");
      setError("Could not reach the generate API. Please try again.");
      addAssistantMessage(
        "Could not reach the server. Please try again in a moment.",
      );
    }
  }

  async function completeAddressStep(text: string) {
    if (!isSkipLikeInput(text) && !isNegative(text)) {
      setAddress(text);
    }
    addAssistantMessage("Thanks! Generating your website now.");
    await runGeneration();
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
      setChatStep("address");
      if (extractedNumber) {
        addAssistantMessage(
          `Got it — we'll add WhatsApp using ${extractedNumber}.`,
        );
      }
      addAssistantMessage(ADDRESS_QUESTION);
      return;
    }

    if (preference === "no") {
      setUseWhatsApp(false);
      setWhatsappNumber("");
      setChatStep("address");
      addAssistantMessage(ADDRESS_QUESTION);
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
    setChatStep("address");
    addAssistantMessage(ADDRESS_QUESTION);
  }

  async function handleSkipAddress() {
    if (isBusy || chatStep !== "address") return;

    setMessages((prev) => [...prev, { role: "user", content: "Skip address" }]);
    setChatInput("");
    setError(null);
    await completeAddressStep("skip");
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = chatInput.trim();
    if (!text || isBusy || !humanVerified) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setChatInput("");
    setError(null);

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
        proceedAfterDescriptionValid(result);
      } catch {
        setStatus("error");
        setError("Could not validate your description. Please try again.");
        addAssistantMessage("I couldn't check your details right now. Please try again.");
      }
      return;
    }

    if (chatStep === "address") {
      await completeAddressStep(text);
    }
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editInstruction.trim() || !websiteId || isEditing) return;

    setIsEditing(true);
    setError(null);

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          instruction: editInstruction.trim(),
        }),
      });

      const data = (await response.json()) as {
        success: boolean;
        updatedFiles?: WebsiteFile[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || "Failed to apply changes.");
        setIsEditing(false);
        return;
      }

      if (data.updatedFiles) {
        setFiles((prev) => {
          const updated = [...prev];
          for (const uf of data.updatedFiles!) {
            const idx = updated.findIndex((f) => f.path === uf.path);
            if (idx >= 0) {
              updated[idx] = uf;
            } else {
              updated.push(uf);
            }
          }
          return updated;
        });
      }

      setEditInstruction("");
      setIframeKey((k) => k + 1);
    } catch {
      setError("Could not apply changes. Please try again.");
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDeploy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedDomain = domain.trim();
    if (!websiteId || deployStatus === "deploying") return;

    setDeployStatus("deploying");
    setDeployError(null);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          domain: trimmedDomain,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        domain?: string | null;
        url?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setDeployStatus("error");
        setDeployError(data.error || "Deployment failed.");
        return;
      }

      setDeployStatus("success");
      setDeployedDomain(data.domain || trimmedDomain || null);
      setDeployedUrl(data.url || null);
    } catch {
      setDeployStatus("error");
      setDeployError("Could not reach the deploy API. Please try again.");
    }
  }

  function handleStartOver() {
    setView("builder");
    setHumanVerified(false);
    setMessages([]);
    setChatInput("");
    setChatStep("description");
    setBusinessDescription("");
    setAddress("");
    setUseWhatsApp(false);
    setWhatsappNumber("");
    setStatus("idle");
    setError(null);
    setWebsiteId(null);
    setFiles([]);
    setDomain("");
    setDeployStatus("idle");
    setDeployError(null);
    setDeployedDomain(null);
    setDeployedUrl(null);
  }

  if (view === "preview" && websiteId) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-stone-900">Website Preview</h1>
          <div className="flex items-center gap-3">
            <a
              href={`/api/preview/${websiteId}/index.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              Open in new tab &rarr;
            </a>
            <button
              onClick={handleStartOver}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              Start over
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <iframe
            key={iframeKey}
            src={`/api/preview/${websiteId}/index.html`}
            title="Website preview"
            className="h-[600px] w-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-stone-900">Deploy website</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">
            Enter a domain to deploy to the server, or leave it blank to get the local preview URL.
          </p>
          <form onSubmit={handleDeploy} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="thandoplumbing.co.za (optional)"
                disabled={deployStatus === "deploying"}
                className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100"
              />
              <button
                type="submit"
                disabled={deployStatus === "deploying"}
                className="inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {deployStatus === "deploying" ? "Deploying..." : "Deploy website"}
              </button>
            </div>
            {deployStatus === "success" && deployedUrl ? (
              <p className="text-sm text-teal-800">
                Website available at{" "}
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  {deployedUrl}
                </a>
                {deployedDomain ? ` (${deployedDomain})` : ""}.
              </p>
            ) : null}
            {deployError ? (
              <p className="text-sm text-red-700">{deployError}</p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm text-stone-600">
            Want to make changes? Describe what you&apos;d like to update:
          </p>
          <form onSubmit={handleEdit} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                placeholder="e.g. Fix phone number, it's 084 292 3200"
                disabled={isEditing}
                className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100"
              />
              <button
                type="submit"
                disabled={isEditing || !editInstruction.trim()}
                className="inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {isEditing ? "Updating..." : "Update"}
              </button>
            </div>
            <GenerationProgressBar
              active={isEditing}
              durationMs={60_000}
              label="Applying your changes..."
              completeLabel="Changes applied!"
            />
          </form>
          {error ? (
            <p className="mt-3 text-sm text-red-700">{error}</p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
          Proof of concept
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          AI Website Builder
        </h1>
        <p className="mt-3 text-lg text-stone-600">
          Chat with us to describe your business and we&apos;ll build your website.
        </p>
      </header>

      {!humanVerified ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-stone-600">
            Before we start, confirm you&apos;re human so we can protect our AI credits.
          </p>
          <HoldToValidateButton
            label="Hold to confirm you're human"
            onValidated={handleHumanVerified}
          />
        </section>
      ) : (
        <section className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex min-h-[420px] max-h-[520px] flex-col gap-4 overflow-y-auto p-5">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "assistant"
                    ? "bg-stone-100 text-stone-800"
                    : "ml-auto bg-teal-800 text-white"
                }`}
              >
                {message.content}
              </div>
            ))}
            {status === "validating" ? (
              <div className="max-w-[85%] rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
                Checking your details...
              </div>
            ) : null}
            {status === "generating" ? (
              <div className="max-w-[85%] rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
                Building your website and images...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {chatStep === "whatsapp" ? (
            <div className="flex gap-3 border-t border-stone-200 p-4">
              <button
                type="button"
                onClick={() => handleWhatsAppChoice(true)}
                disabled={isBusy}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => handleWhatsAppChoice(false)}
                disabled={isBusy}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                No
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleChatSubmit}
              className="flex flex-col gap-3 border-t border-stone-200 p-4"
            >
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onFocus={() => {
                      if (addressSuggestions.length > 0) {
                        setShowAddressSuggestions(true);
                      }
                    }}
                    placeholder={
                      chatStep === "address"
                        ? "Start typing your address..."
                        : "Describe your business..."
                    }
                    disabled={isBusy}
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:bg-stone-100"
                  />
                  {chatStep === "address" &&
                  showAddressSuggestions &&
                  addressSuggestions.length > 0 ? (
                    <ul
                      className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg"
                    >
                      {addressSuggestions.map((suggestion) => (
                        <li key={suggestion.place_id}>
                          <button
                            type="button"
                            onClick={() => selectAddressSuggestion(suggestion)}
                            className="w-full px-4 py-3 text-left text-sm text-stone-800 hover:bg-stone-50"
                          >
                            {suggestion.description}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {chatStep === "address" ? (
                  <button
                    type="button"
                    onClick={handleSkipAddress}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Skip
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={isBusy || !chatInput.trim()}
                  className="inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  Send
                </button>
              </div>
              <GenerationProgressBar
                active={status === "generating"}
                durationMs={120_000}
                label="Building your website and images..."
                completeLabel="Website ready!"
              />
            </form>
          )}
        </section>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}
