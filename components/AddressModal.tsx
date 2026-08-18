"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type AddressSuggestion = {
  description: string;
  place_id: string;
};

type AddressModalProps = {
  businessName: string;
  onSkip: () => void;
  onSubmit: (address: string) => void;
  onBack?: () => void;
};

export default function AddressModal({
  businessName,
  onSkip,
  onSubmit,
  onBack,
}: AddressModalProps) {
  const { authFetch } = useAuth();
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = address.trim();
    if (trimmed.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale suggestions when the query is too short
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await authFetch(
          `/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`,
        );
        const data = (await response.json()) as {
          predictions?: AddressSuggestion[];
        };

        if (response.ok && data.predictions) {
          setSuggestions(data.predictions);
          setShowSuggestions(data.predictions.length > 0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [address, authFetch]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    setAddress(suggestion.description);

    try {
      const response = await authFetch(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.place_id)}`,
      );
      const data = (await response.json()) as { formatted_address?: string };

      if (response.ok && data.formatted_address) {
        setAddress(data.formatted_address);
      }
    } catch {
      // Keep the autocomplete description if details lookup fails.
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      onSkip();
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-stone-900/35 p-3 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-labelledby="address-modal-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
          Optional
        </p>
        <h2
          id="address-modal-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-stone-900"
        >
          Add a business address?
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          {businessName
            ? `If you add an address for ${businessName}, we'll put a Google Map on the website.`
            : "If you add an address, we'll put a Google Map on the website."}{" "}
          You can skip this or go back to change the details.
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              placeholder="Start typing an address..."
              autoComplete="off"
              aria-label="Business address"
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
            />
            {showSuggestions && suggestions.length > 0 ? (
              <ul className="absolute left-0 right-0 z-10 mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.place_id}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                      className="w-full px-4 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-50"
                    >
                      {suggestion.description}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100"
              >
                Back to chat
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              Skip
            </button>
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              Continue
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
