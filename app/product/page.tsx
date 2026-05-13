import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "Product — SkillEdge AI",
  description:
    "Explore SkillEdge AI: a premium trading workspace with journal analytics, screenshots, chart review, market intelligence, AI scanner, AI alerts, reports, learning blocks and execution coaching.",
  alternates: {
    canonical: "/product",
  },
  openGraph: {
    title: "Product — SkillEdge AI",
    description:
      "Discover the SkillEdge AI trading workspace: journal, reports, chart analysis, market intelligence, AI scanner, alerts, playbooks and execution review.",
    url: "/product",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SkillEdge AI Product",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Product — SkillEdge AI",
    description:
      "Market intelligence, journal analytics, AI scanner, alerts and execution review in one premium trading workspace.",
    images: ["/twitter-image"],
  },
};

export default function ProductRoute() {
  return <Landing initialPage="product" />;
}