import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "Pricing — SkillEdge AI",
  description:
    "Choose your SkillEdge AI plan: Core for structure, Edge for market intelligence and AI scanner, or Elite for the full AI trading desk and alert workflow.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing — SkillEdge AI",
    description:
      "Choose Core, Edge or Elite and unlock the level of AI trading intelligence that matches your process.",
    url: "/pricing",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SkillEdge AI Pricing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — SkillEdge AI",
    description:
      "Core for structure, Edge for active market review, Elite for the full AI trading desk and signal workflow.",
    images: ["/twitter-image"],
  },
};

export default function PricingRoute() {
  return <Landing initialPage="pricing" />;
}