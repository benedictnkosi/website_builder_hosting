import AppHeader from "@/components/AppHeader";
import AuthGuard from "@/components/AuthGuard";
import UserDashboard from "@/components/UserDashboard";

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
