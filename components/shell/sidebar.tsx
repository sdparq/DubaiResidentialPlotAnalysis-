"use client";
import {
  ArrowUpDown,
  Box,
  Building,
  ChartColumn,
  ChartPie,
  Check,
  LandPlot,
  LayoutGrid,
  Library,
  Lock,
  LockOpen,
  SlidersHorizontal,
  SquareParking,
  type LucideIcon,
} from "lucide-react";
import { STEPS, STEP_GROUPS, type StepId, type StepStatus } from "@/lib/workflow";
import { BRAND } from "@/lib/brand";
import { BrandLockup } from "./brand-mark";

export const STEP_ICONS: Record<StepId, LucideIcon> = {
  plot: LandPlot,
  setup: SlidersHorizontal,
  common: ChartPie,
  typologies: LayoutGrid,
  program: Building,
  parking: SquareParking,
  lifts: ArrowUpDown,
  massing: Box,
  summary: ChartColumn,
};

export type NavTarget = StepId | "zones";

export default function Sidebar({
  active,
  statuses,
  onSelect,
  libraryUnlocked,
  onOpenLibrary,
  onLockLibrary,
}: {
  active: NavTarget;
  statuses: Record<StepId, StepStatus>;
  onSelect: (id: NavTarget) => void;
  libraryUnlocked: boolean;
  onOpenLibrary: () => void;
  onLockLibrary: () => void;
}) {
  const doneCount = STEPS.filter((s) => statuses[s.id] === "done").length;
  const trackable = STEPS.filter((s) => statuses[s.id] !== null).length;

  return (
    <div className="h-full flex flex-col bg-ink-900 text-white">
      <div className="h-16 px-5 flex items-center border-b border-white/[0.06] shrink-0">
        <BrandLockup />
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4" aria-label="Feasibility steps">
        {STEP_GROUPS.map((group) => {
          const steps = STEPS.filter((s) => s.group === group);
          return (
            <div key={group} className="mb-4 last:mb-0">
              <div className="px-3 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                {group}
              </div>
              <ul className="grid gap-0.5">
                {steps.map((s) => {
                  const Icon = STEP_ICONS[s.id];
                  const isActive = active === s.id;
                  const status = statuses[s.id];
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => onSelect(s.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative w-full flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-lg text-[13.5px] transition-colors ${
                          isActive
                            ? "bg-white/[0.09] text-white font-medium"
                            : "text-white/65 hover:text-white hover:bg-white/[0.045]"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-300" aria-hidden />
                        )}
                        <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-brand-200" : "text-white/55"}`} strokeWidth={1.75} />
                        <span className="flex-1 text-left truncate">{s.label}</span>
                        <StatusBadge status={status} num={s.num} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3 grid gap-3">
        {trackable > 0 && (
          <div className="px-3">
            <div className="flex items-center justify-between text-[11.5px] text-white/55 mb-1.5">
              <span>Study progress</span>
              <span className="text-white/80 font-medium">
                {doneCount}/{trackable}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={trackable}
              aria-valuenow={doneCount}
              aria-label="Steps with data"
            >
              <div
                className="h-full rounded-full bg-brand-400 transition-[width] duration-500"
                style={{ width: `${(doneCount / trackable) * 100}%` }}
              />
            </div>
          </div>
        )}
        {libraryUnlocked ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSelect("zones")}
              className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
                active === "zones" ? "bg-white/[0.09] text-white font-medium" : "text-white/65 hover:text-white hover:bg-white/[0.045]"
              }`}
            >
              <Library className="w-[18px] h-[18px] text-white/55" strokeWidth={1.75} />
              <span className="flex-1 text-left">Class library</span>
            </button>
            <button
              onClick={onLockLibrary}
              className="p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Lock the Class Library again"
              aria-label="Lock the Class Library"
            >
              <LockOpen className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] text-white/50 hover:text-white hover:bg-white/[0.045] transition-colors"
            title="Admin: market class library"
          >
            <Lock className="w-[18px] h-[18px]" strokeWidth={1.75} />
            <span className="flex-1 text-left">Class library</span>
            <span className="text-[10.5px] uppercase tracking-[0.1em] text-white/35">Admin</span>
          </button>
        )}
        <p className="px-3 text-[10.5px] leading-snug text-white/30">
          {BRAND.wordmark} · feasibility-level figures. Verify against DM, DCD, RTA and DBC before submission.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status, num }: { status: StepStatus; num: string }) {
  if (status === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-brand-500/25 text-brand-200 flex items-center justify-center shrink-0" title="Has data">
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "attention") {
    return (
      <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 text-[11px] font-bold" title="Needs a look">
        !
      </span>
    );
  }
  return <span className="w-5 text-center text-[10.5px] tabular-nums text-white/30 shrink-0">{num}</span>;
}
