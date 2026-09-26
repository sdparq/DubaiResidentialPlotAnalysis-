"use client";

export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Formatted value for the legend and tooltip, e.g. "36,480 m² · 95%". */
  display: string;
}

/**
 * Part-to-whole bar: one row of segments separated by 2px surface gaps, with a
 * legend underneath that carries every value (so colour never works alone).
 */
export function StackedBar({ segments, label, height = 12 }: { segments: StackedSegment[]; label: string; height?: number }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  return (
    <figure className="grid gap-2.5" aria-label={label}>
      <div className="flex w-full gap-[2px]" style={{ height }} role="img" aria-label={shown.map((s) => `${s.label} ${s.display}`).join(", ")}>
        {shown.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label} — ${s.display}`}
            className={`${i === 0 ? "rounded-l-full" : ""} ${i === shown.length - 1 ? "rounded-r-full" : ""} min-w-[3px] transition-[flex-grow] duration-500`}
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
          />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1.5">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-[12.5px] text-ink-700">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden />
            <span className="font-medium text-ink-900">{s.label}</span>
            <span className="text-ink-500 tabular-nums">{s.display}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
