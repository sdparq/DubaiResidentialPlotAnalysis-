"use client";
import { useEffect, useState } from "react";

interface Props {
  value: number | undefined;
  onChange: (v: number) => void;
  /** Called when the field is left empty (only when provided — otherwise the last value is restored). */
  onClear?: () => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  suffix?: string;
  placeholder?: string;
  className?: string;
  title?: string;
  "aria-label"?: string;
}

const fmt = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "" : String(Number(v.toFixed(6))));

function parse(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric input that keeps what the user types (e.g. "12.", "-", "0,5") instead of snapping back to
 * the last parsed value on every keystroke. Accepts a comma as decimal separator, only pushes values
 * that are within range while typing, clamps on blur and supports ↑ / ↓ stepping.
 */
export default function NumInput({
  value,
  onChange,
  onClear,
  step = 1,
  min,
  max,
  integer,
  suffix,
  placeholder,
  className = "cell-input",
  title,
  "aria-label": ariaLabel,
}: Props) {
  const [text, setText] = useState(fmt(value));
  const normalize = (n: number) => (integer ? Math.round(n) : n);
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, normalize(n)));

  // Follow outside changes (reset buttons, other inputs bound to the same field).
  useEffect(() => {
    const p = parse(text);
    const shown = p === null ? null : normalize(p);
    const differs = value === undefined ? onClear !== undefined && text.trim() !== "" : shown !== value;
    if (differs) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (n: number) => {
    if (n !== value) onChange(n);
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        className={`${className} ${suffix ? "pr-9" : ""}`}
        value={text}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = parse(raw);
          if (n !== null && inRange(normalize(n))) emit(normalize(n));
        }}
        onBlur={() => {
          if (text.trim() === "") {
            if (onClear) onClear();
            else setText(fmt(value));
            return;
          }
          const n = parse(text);
          if (n === null) {
            setText(fmt(value));
            return;
          }
          const v = clamp(n);
          emit(v);
          setText(fmt(v));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const base = parse(text) ?? value ?? 0;
          const v = clamp(Number((base + (e.key === "ArrowUp" ? step : -step)).toFixed(6)));
          emit(v);
          setText(fmt(v));
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{suffix}</span>
      )}
    </div>
  );
}
