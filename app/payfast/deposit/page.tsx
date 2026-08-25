"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { submitPayfastForm } from "@/lib/payfast-browser";

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function DepositCheckoutInner() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const waFromQuery = normalizePhone(searchParams.get("wa") || "");

  const [phone, setPhone] = useState(waFromQuery);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (waFromQuery) setPhone(waFromQuery);
  }, [waFromQuery]);

  useEffect(() => {
    if (status === "return" || status === "cancel") return;
    if (!waFromQuery || started) return;
    setStarted(true);
    void startCheckout(waFromQuery);
    // Auto-start once when wa is present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waFromQuery, status]);

  async function startCheckout(waPhone: string) {
    const digits = normalizePhone(waPhone);
    if (digits.length < 10) {
      setError("Enter a valid WhatsApp number so we can match your payment.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/payfast/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        processUrl?: string;
        fields?: Record<string, string>;
      } | null;

      if (!response.ok || !data?.success || !data.processUrl || !data.fields) {
        setError(data?.error || "Could not start payment. Please try again.");
        setLoading(false);
        setStarted(false);
        return;
      }

      submitPayfastForm(data.processUrl, data.fields);
    } catch {
      setError("Could not reach the payment service. Please try again.");
      setLoading(false);
      setStarted(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStarted(true);
    void startCheckout(phone);
  }

  if (status === "return") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-stone-800">
        <h1 className="text-2xl font-semibold tracking-tight">Payment received</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Thank you. If your PayFast payment completed, reply on WhatsApp to confirm and a
          Lulaweb team member will take over to start your website.
        </p>
      </main>
    );
  }

  if (status === "cancel") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-stone-800">
        <h1 className="text-2xl font-semibold tracking-tight">Payment cancelled</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          No problem. You can return to WhatsApp anytime when you are ready to start with the
          R100 deposit.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-stone-800">
      <h1 className="text-2xl font-semibold tracking-tight">R100 website deposit</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        Pay the refundable R100 deposit securely with PayFast. We use your WhatsApp number to
        match the payment to your chat.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium text-stone-700">
          WhatsApp number
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="27821234567"
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none ring-teal-800/30 focus:ring-2"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Redirecting to PayFast…" : "Pay R100 securely"}
        </button>
      </form>
    </main>
  );
}

export default function PayfastDepositPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6 text-sm text-stone-600">
          Loading checkout…
        </main>
      }
    >
      <DepositCheckoutInner />
    </Suspense>
  );
}
