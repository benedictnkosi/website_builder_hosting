"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { identifyAnalyticsUser, trackPageView } from "@/lib/analytics";

export default function AnalyticsTracker() {
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    identifyAnalyticsUser(user?.uid ?? null);
  }, [user?.uid]);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
