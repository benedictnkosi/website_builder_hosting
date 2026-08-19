"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { trackSupportSubmit } from "@/lib/analytics";

type SupportFormProps = {
  heading?: string;
  description?: string;
};

export default function SupportForm({
  heading = "Need help?",
  description = "Billing, domains, or something on your site — send a message and we will get back to you.",
}: SupportFormProps) {
  const { user, getIdToken } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once the signed-in profile is available
    setName((current) => current || user.displayName || "");
    setEmail((current) => current || user.email || "");
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);

    try {
      const token = await getIdToken();
      const headers = new Headers({ "Content-Type": "application/json" });
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch("/api/support", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, email, message, company }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.error || "Could not send the message. Please try again.");
        return;
      }

      trackSupportSubmit();
      setSent(true);
      setMessage("");
    } catch {
      setError("Could not send the message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

  return (
    <section
      id="support"
      className="scroll-mt-24 rounded-[1.6rem] border border-stone-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(28,25,23,0.08)] sm:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
            Support
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {description}
          </p>
        </div>

        {sent ? (
          <div className="rounded-[1.4rem] border border-teal-200 bg-teal-50 px-5 py-8 text-center sm:px-8">
            <p className="text-lg font-semibold text-teal-950">Message sent</p>
            <p className="mt-2 text-sm leading-relaxed text-teal-900">
              Thanks {name.trim() || "there"}. We will reply to {email.trim()} as
              soon as we can.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-stone-500"
                htmlFor="support-name"
              >
                Name
              </label>
              <input
                id="support-name"
                type="text"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                maxLength={120}
                className={inputClass}
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-stone-500"
                htmlFor="support-email"
              >
                Email
              </label>
              <input
                id="support-email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email we can reply to"
                autoComplete="email"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-stone-500"
                htmlFor="support-message"
              >
                Message
              </label>
              <textarea
                id="support-message"
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="How can we help?"
                required
                rows={5}
                maxLength={5000}
                className={`${inputClass} min-h-[8.5rem] resize-y`}
              />
            </div>
            <div className="hidden" aria-hidden="true">
              <label htmlFor="support-company">Company</label>
              <input
                id="support-company"
                type="text"
                name="company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            {error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-stone-500">
                We usually reply within one business day.
              </p>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center justify-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {sending ? "Sending..." : "Send message"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
