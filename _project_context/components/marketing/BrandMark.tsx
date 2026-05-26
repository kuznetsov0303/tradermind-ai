type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

function BrandMark({ size = "md", className = "" }: BrandMarkProps) {
  const sizeClasses = {
    sm: "h-9 w-9 rounded-xl",
    md: "h-12 w-12 rounded-2xl",
    lg: "h-16 w-16 rounded-[1.35rem]",
  };

  const textClasses = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  };

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-cyan-300/30 bg-[#08111f] shadow-[0_0_34px_rgba(34,211,238,0.18)] ${sizeClasses[size]} ${className}`}
      aria-label="SkillEdge AI logo"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.34),transparent_34%),radial-gradient(circle_at_78%_82%,rgba(99,102,241,0.28),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_48%)]" />
      <div className="absolute inset-[1px] rounded-[inherit] border border-white/10" />
      <div className="absolute left-[-18%] top-1/2 h-px w-[140%] -rotate-45 bg-gradient-to-r from-transparent via-cyan-100/55 to-transparent" />
      <div className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.95)]" />
      <div className="absolute bottom-1.5 left-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />

      <span
        className={`relative flex items-baseline gap-[1px] font-black tracking-[-0.11em] text-white ${textClasses[size]}`}
      >
        <span>S</span>
        <span className="text-cyan-100">E</span>
        <span className="ml-[2px] text-[0.62em] tracking-[-0.04em] text-white/55">
          AI
        </span>
      </span>
    </div>
  );
}

export { BrandMark };
export default BrandMark;