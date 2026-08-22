import type { Metadata } from "next";
import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import WebsiteBuilderEntry from "@/components/WebsiteBuilderEntry";

export const metadata: Metadata = {
  title: "Website builder",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function BuilderPage() {
  return (
    <main className="flex h-dvh min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-hidden">
      <AppHeader />
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-stone-500">Loading your workspace...</p>
          </div>
        }
      >
        <WebsiteBuilderEntry />
      </Suspense>
    </main>
  );
}
