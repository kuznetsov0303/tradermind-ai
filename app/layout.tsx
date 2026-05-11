import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SupportWidget from "@/components/SupportWidget";
import SeoJsonLd from "@/components/marketing/SeoJsonLd";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "SkillEdge AI — Premium AI Trading Workspace",
  description:
    "SkillEdge AI is a premium trading workspace with market intelligence, AI alerts, journal analytics, execution review, reports, playbook and coaching.",
  applicationName: SITE_NAME,
  keywords: [
    "SkillEdge AI",
    "AI trading journal",
    "AI trading alerts",
    "trading journal",
    "market intelligence",
    "AI trading coach",
    "trade review",
    "execution coach",
    "trading reports",
    "AI Trading Desk",
  ],
  authors: [{ name: "SkillEdge AI" }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "SkillEdge AI — Premium AI Trading Workspace",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
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
      "Turn market noise into a personal trading edge with AI alerts, journal analytics, execution review and market intelligence.",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
  <SeoJsonLd />
  {children}
  <SupportWidget />
</body>
    </html>
  );
}