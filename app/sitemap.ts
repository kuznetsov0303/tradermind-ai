import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/product",
    "/pricing",
    "/about",
    "/legal/privacy-policy",
    "/legal/terms",
    "/legal/disclaimer",
    "/legal/eula",
    "/legal/billing",
    "/legal/cookies",
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority:
      route === ""
        ? 1
        : route === "/pricing"
          ? 0.95
          : route === "/product"
            ? 0.9
            : route === "/about"
              ? 0.7
              : 0.45,
  }));
}