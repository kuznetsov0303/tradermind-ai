import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "About Us — SkillEdge AI",
  description:
    "Learn why SkillEdge AI is being built as a premium trading workspace focused on process, discipline, market intelligence, execution review, AI signals and trader development.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Us — SkillEdge AI",
    description:
      "SkillEdge AI is built for traders who want structure, discipline, review, market intelligence and measurable improvement — not hype or profit promises.",
    url: "/about",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "About SkillEdge AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Us — SkillEdge AI",
    description:
      "The philosophy behind SkillEdge AI: process over prediction, structure over chaos, discipline over hype.",
    images: ["/twitter-image"],
  },
};

export default function AboutRoute() {
  return <Landing initialPage="team" />;
}