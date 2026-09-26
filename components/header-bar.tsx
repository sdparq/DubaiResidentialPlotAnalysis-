"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import ProjectSwitcher from "./project-switcher";
import CloudStatus from "./cloud-status";
import { BRAND } from "@/lib/brand";

const ReportOverlay = dynamic(() => import("./report"), { ssr: false });

export default function HeaderBar() {
  const [report, setReport] = useState(false);
  return (
    <header className="bg-ink-900 text-bone-100 relative z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-x-6 gap-y-3 flex-wrap min-w-0">
        <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1 basis-[280px]">
          <div className="flex items-center gap-3 shrink-0">
            <svg viewBox="0 0 100 100" className="w-9 h-9" fill="none" strokeLinejoin="miter" aria-label={`${BRAND.wordmark} logo`}>
              {/* plot boundary + building footprint after setbacks */}
              <rect x="8" y="8" width="84" height="84" stroke="#7d9670" strokeWidth={9} />
              <rect x="32" y="32" width="36" height="36" stroke="#f6f4ee" strokeWidth={9} />
            </svg>
            <div className="leading-tight hidden min-[420px]:block">
              <div className="wordmark text-bone-100 text-[16px]">{BRAND.wordmark}</div>
              <div className="eyebrow text-bone-200/60 text-[9px] mt-0.5">{BRAND.descriptor} · {BRAND.market}</div>
            </div>
          </div>
          <div className="hidden sm:block w-px h-10 bg-bone-100/20 shrink-0" />
          <ProjectSwitcher />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setReport(true)}
            className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.10em] border border-bone-100/25 text-bone-100 hover:border-bone-100/60 hover:bg-ink-800 transition-colors"
            title="Preview and export the full feasibility report as a PDF"
          >
            ⬇ Report PDF
          </button>
          <CloudStatus />
        </div>
      </div>
      {report && <ReportOverlay onClose={() => setReport(false)} />}
    </header>
  );
}
