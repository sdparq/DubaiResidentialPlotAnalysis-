import { CircleAlert, CircleCheck } from "lucide-react";

export type StatTone = "ok" | "warn" | "bad" | null | undefined;

/**
 * Headline figure: sentence-case label, a semibold value with proportional
 * figures, and an optional sub-line. Status tones carry an icon as well as a
 * colour, so they never rely on colour alone.
 */
export function StatTile({
  label,
  value,
  sub,
  tone,
  emphasis = false,
  className = "",
  children,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  emphasis?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const ring =
    tone === "bad"
      ? "ring-red-200 bg-red-50/40"
      : tone === "warn"
        ? "ring-amber-200 bg-amber-50/40"
        : emphasis
          ? "ring-brand-200 bg-brand-50/50"
          : "ring-ink-200/80 bg-white";
  return (
    <div className={`rounded-lg ring-1 ring-inset p-3.5 min-w-0 ${ring} ${className}`}>
      <div className="text-[12px] font-medium text-ink-500 flex items-center gap-1.5">
        <span className="truncate">{label}</span>
        {tone === "ok" && <CircleCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="OK" />}
        {(tone === "warn" || tone === "bad") && (
          <CircleAlert className={`w-3.5 h-3.5 shrink-0 ${tone === "bad" ? "text-red-600" : "text-amber-600"}`} aria-label="Check" />
        )}
      </div>
      {value !== undefined && (
        <div className="mt-1 text-[20px] font-semibold text-ink-900 tracking-tight leading-tight break-words">{value}</div>
      )}
      {children}
      {sub && <div className="mt-1 text-[11.5px] text-ink-500 leading-snug">{sub}</div>}
    </div>
  );
}
