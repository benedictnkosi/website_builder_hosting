import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";
import AdminGuard from "@/components/AdminGuard";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminPage() {
  return (
    <AdminGuard>
      <main className="flex min-h-dvh flex-col">
        <AppHeader />
        <AdminDashboard />
      </main>
    </AdminGuard>
  );
}
