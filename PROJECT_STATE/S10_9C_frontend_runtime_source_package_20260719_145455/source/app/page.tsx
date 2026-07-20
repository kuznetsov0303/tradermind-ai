import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "SkillEdge AI — Premium AI Trading Workspace",
  description:
    "SkillEdge AI turns market noise into a personal trading edge with AI alerts, market intelligence, journal analytics, execution review, reports, playbook and coaching.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SkillEdge AI — Premium AI Trading Workspace",
    description:
      "Market intelligence, AI alerts, journal analytics, execution review, reports, playbook and coaching in one premium workspace.",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SkillEdge AI — Premium AI Trading Workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SkillEdge AI — Premium AI Trading Workspace",
    description:
      "Turn market noise into a personal trading edge with AI alerts, journal analytics and market intelligence.",
    images: ["/twitter-image"],
  },
};

export default function Home() {
  return <Landing initialPage="home" />;
}