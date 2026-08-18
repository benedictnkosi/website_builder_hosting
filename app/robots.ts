import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/builder", "/deploy"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: new URL(origin).host,
  };
}
