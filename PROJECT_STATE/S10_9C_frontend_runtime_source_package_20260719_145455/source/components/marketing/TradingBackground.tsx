"use client";

type TradingBackgroundProps = {
  variant?: "home" | "product" | "pricing" | "team" | "default";
  className?: string;
};

export default function TradingBackground({
  variant = "default",
  className = "",
}: TradingBackgroundProps) {
  const overlayByVariant: Record<string, string> = {
    home: "from-[#06111c]/88 via-[#071827]/74 to-[#031019]/92",
    product: "from-[#06111c]/90 via-[#082031]/78 to-[#031019]/94",
    pricing: "from-[#07111d]/92 via-[#0a1b28]/80 to-[#030b12]/95",
    team: "from-[#06111c]/90 via-[#0a1f2e]/76 to-[#031019]/94",
    default: "from-[#06111c]/90 via-[#071827]/78 to-[#031019]/94",
  };

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06111c] ${className}`}
    >
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-[0.42]"
        src="/marketing/trading-desk-loop.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />

      <div
        className={`absolute inset-0 bg-gradient-to-br ${
          overlayByVariant[variant] ?? overlayByVariant.default
        }`}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.20),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(14,165,233,0.14),transparent_34%),radial-gradient(circle_at_50%_92%,rgba(20,184,166,0.16),transparent_38%)]" />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.16]" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,10,18,0.25)_54%,rgba(3,10,18,0.82)_100%)]" />
    </div>
  );
}