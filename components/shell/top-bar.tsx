"use client";
import { FileDown, Menu } from "lucide-react";
import ProjectSwitcher from "../project-switcher";
import CloudStatus from "../cloud-status";
import { BrandMark } from "./brand-mark";

export default function TopBar({ onMenu, onExport }: { onMenu: () => void; onExport: () => void }) {
  return (
    <div className="h-14 sm:h-16 px-3 sm:px-6 flex items-center gap-2 sm:gap-3 min-w-0">
      <button
        onClick={onMenu}
        className="lg:hidden p-2 -ml-1 rounded-lg text-ink-600 hover:bg-bone-100 transition-colors shrink-0"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>
      <BrandMark className="lg:hidden w-7 h-7 shrink-0 hidden min-[380px]:block" />
      <div className="min-w-0 flex-1">
        <ProjectSwitcher />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <CloudStatus />
        <button
          onClick={onExport}
          className="btn btn-primary !px-2.5 sm:!px-3.5"
          title="Preview and export the feasibility report as a PDF"
        >
          <FileDown className="w-4 h-4" />
          <span className="hidden sm:inline">Export report</span>
        </button>
      </div>
    </div>
  );
}
