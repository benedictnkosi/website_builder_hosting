import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import AuthGuard from "@/components/AuthGuard";
import WebsiteBuilderEntry from "@/components/WebsiteBuilderEntry";

export default function BuilderPage() {
  return (
    <AuthGuard>
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
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
    </AuthGuard>
  );
}
