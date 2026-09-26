"use client";
import { useId } from "react";
import { BRAND } from "@/lib/brand";

/** Logo mark: a massing block standing on its plot, in the brand accent.
 *  White-label: replace this SVG (and app/icon.svg) with the client's mark. */
export function BrandMark({ className = "w-8 h-8" }: { className?: string }) {
  // Unique per instance: a gradient referenced across SVGs breaks when the
  // defining one sits in a hidden (display:none) container.
  const gid = `brand-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label={`${BRAND.wordmark} logo`} role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a9d84" />
          <stop offset="1" stopColor="#0a584a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      {/* plot outline */}
      <path d="M16 15.6 L27 21.1 L16 26.6 L5 21.1 Z" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.1" strokeLinejoin="round" />
      {/* tower */}
      <path d="M16 4.6 L22 7.6 L16 10.6 L10 7.6 Z" fill="#ffffff" />
      <path d="M10 7.6 L16 10.6 L16 24.1 L10 21.1 Z" fill="#ffffff" fillOpacity="0.78" />
      <path d="M16 10.6 L22 7.6 L22 21.1 L16 24.1 Z" fill="#ffffff" fillOpacity="0.5" />
    </svg>
  );
}

export function BrandLockup({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandMark className="w-8 h-8 shrink-0" />
      <div className="leading-none min-w-0">
        <div className={`wordmark text-[14px] ${dark ? "text-white" : "text-ink-900"}`}>{BRAND.wordmark}</div>
        <div className={`text-[11px] mt-1 truncate ${dark ? "text-white/50" : "text-ink-500"}`}>
          {BRAND.descriptor} · {BRAND.market}
        </div>
      </div>
    </div>
  );
}
