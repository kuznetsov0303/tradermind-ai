import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "Team — SkillEdge AI",
  description:
    "Learn why SkillEdge AI is being built as a serious AI trading system focused on process, discipline, market intelligence, AI alerts and trader development.",
  alternates: {
    canonical: "/team",
  },
  openGraph: {
    title: "Team — SkillEdge AI",
    description:
      "SkillEdge AI is built for traders who want process, discipline, review and measurable improvement — not hype.",
    url: "/team",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SkillEdge AI Team",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Team — SkillEdge AI",
    description:
      "The philosophy behind SkillEdge AI: process over prediction, structure over chaos, discipline over hype.",
    images: ["/twitter-image"],
  },
};

export default function TeamRoute() {
  return <Landing initialPage="team" />;
}