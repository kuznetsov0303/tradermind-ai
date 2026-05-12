type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

function BrandMark({
  size = "md",
  className = "",
}: BrandMarkProps) {
  const sizeClasses = {
    sm: "h-9 w-9 rounded-xl",
    md: "h-12 w-12 rounded-2xl",
    lg: "h-16 w-16 rounded-[1.35rem]",
  };

  const textClasses = {
    sm: "text-[11px]",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-cyan-300/25 bg-[#08111f] shadow-[0_0_34px_rgba(34,211,238,0.16)] ${sizeClasses[size]} ${className}`}
      aria-label="SkillEdge AI logo"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.28),transparent_34%),radial-gradient(circle_at_75%_80%,rgba(99,102,241,0.24),transparent_36%)]" />
      <div className="absolute inset-[1px] rounded-[inherit] border border-white/10" />
      <div className="absolute left-1/2 top-[-20%] h-[140%] w-px -rotate-45 bg-gradient-to-b from-transparent via-cyan-200/55 to-transparent" />
      <div className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />

      <span
        className={`relative font-semibold tracking-[-0.08em] text-white ${textClasses[size]}`}
      >
        SE
      </span>
    </div>
  );
}

export { BrandMark };
export default BrandMark;