import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export default function SeoJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/opengraph-image`,
        description: SITE_DESCRIPTION,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SUPPORT_EMAIL,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "Premium AI trading workspace with AI Trading Desk, AI Alerts, Market Intelligence, Journal, Screenshots, Execution Coach, Outcome Learning, Playbook, Reports and Learning Center.",
        offers: [
          {
            "@type": "Offer",
            name: "SkillEdge Core",
            price: "49",
            priceCurrency: "USD",
            availability: "https://schema.org/PreOrder",
            url: `${SITE_URL}/pricing`,
          },
          {
            "@type": "Offer",
            name: "SkillEdge Edge",
            price: "99",
            priceCurrency: "USD",
            availability: "https://schema.org/PreOrder",
            url: `${SITE_URL}/pricing`,
          },
          {
            "@type": "Offer",
            name: "SkillEdge Elite",
            price: "149",
            priceCurrency: "USD",
            availability: "https://schema.org/PreOrder",
            url: `${SITE_URL}/pricing`,
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}