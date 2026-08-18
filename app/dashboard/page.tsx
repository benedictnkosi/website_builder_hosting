import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import AuthGuard from "@/components/AuthGuard";
import UserDashboard from "@/components/UserDashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function DashboardPage() {
  return (
    <AuthGuard>
      <main className="flex min-h-dvh flex-col">
        <AppHeader />
        <UserDashboard />
      </main>
    </AuthGuard>
  );
}
