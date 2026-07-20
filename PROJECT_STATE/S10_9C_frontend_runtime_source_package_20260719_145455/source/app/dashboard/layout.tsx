import SiteFooter from "@/components/marketing/SiteFooter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SiteFooter language="ru" className="mt-0" />
    </>
  );
}

