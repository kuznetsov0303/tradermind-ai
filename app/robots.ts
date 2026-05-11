import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/product",
          "/pricing",
          "/team",
          "/legal/privacy-policy",
          "/legal/terms",
          "/legal/disclaimer",
          "/legal/eula",
          "/legal/billing",
          "/legal/cookies",
        ],
        disallow: ["/dashboard", "/admin", "/api", "/login", "/register"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}