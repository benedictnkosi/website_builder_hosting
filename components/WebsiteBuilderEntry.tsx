"use client";

import { useSearchParams } from "next/navigation";
import WebsiteBuilder from "@/components/WebsiteBuilder";

export default function WebsiteBuilderEntry() {
  const searchParams = useSearchParams();
  const instanceKey =
    searchParams.get("new") === "1"
      ? "new"
      : searchParams.get("websiteId")?.trim() || "session";

  return <WebsiteBuilder key={instanceKey} />;
}
