"use client";
import { CircleAlert, CircleCheck } from "lucide-react";
import { M2_TO_SQFT, type ProjectMetrics } from "@/lib/metrics";
import type { StepId } from "@/lib/workflow";

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

type Tone = "ok" | "warn" | "bad" | null;

interface Kpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  step: StepId;
  tone?: Tone;
  /** 0..1 fill of a thin meter under the tile. */
  meter?: number;
}

function buildKpis(m: ProjectMetrics): Kpi[] {
  const gfaTone: Tone =
    m.gfaOfTarget === null ? null : m.gfaOfTarget > 1.005 ? "bad" : m.gfaOfTarget >= 0.95 ? "ok" : "warn";
  const parkingTone: Tone =
    m.parkingRequired <= 0 ? null : m.parkingProvided >= m.parkingRequired ? "ok" : "bad";
  return [
    {
      key: "plot",
      label: "Plot area",
      value: m.plotArea > 0 ? n0(m.plotArea) : "—",
      unit: m.plotArea > 0 ? "m²" : undefined,
      sub: m.plotArea > 0 ? `${n0(m.plotArea * M2_TO_SQFT)} sqft` : "Set in Plot / Setup",
      step: "plot",
    },
    {
      key: "gfa",
      label: "GFA",
      value: m.totalGFA > 0 ? n0(m.totalGFA) : "—",
      unit: m.totalGFA > 0 ? "m²" : undefined,
      sub:
        m.gfaOfTarget !== null
          ? `${Math.round(m.gfaOfTarget * 100)}% of ${n0(m.targetGFA)} target`
          : m.totalGFA > 0
            ? "No target set"
            : "Split GFA in Setup",
      step: "setup",
      tone: gfaTone,
      meter: m.gfaOfTarget !== null ? Math.min(1, m.gfaOfTarget) : undefined,
    },
    {
      key: "far",
      label: "FAR",
      value: m.far !== null ? m.far.toFixed(2) : "—",
      sub: "GFA ÷ plot area",
      step: "setup",
    },
    {
      key: "units",
      label: "Units",
      value: m.units > 0 ? n0(m.units) : "—",
      sub: m.avgUnitM2 !== null ? `avg ${n0(m.avgUnitM2)} m² sellable` : "Fill in Apartments",
      step: "program",
    },
    {
      key: "gsa",
      label: "Sellable (GSA)",
      value: m.gsa > 0 ? n0(m.gsa) : "—",
      unit: m.gsa > 0 ? "m²" : undefined,
      sub: m.gsa > 0 ? `${n0(m.gsa * M2_TO_SQFT)} sqft` : "—",
      step: "summary",
    },
    {
      key: "eff",
      label: "Efficiency",
      value: m.efficiency !== null ? `${(m.efficiency * 100).toFixed(1)}%` : "—",
      sub: "GSA ÷ BUA",
      step: "summary",
      meter: m.efficiency !== null ? Math.min(1, m.efficiency) : undefined,
    },
    {
      key: "height",
      label: "Height",
      value: m.heightCode,
      sub: `${m.heightM.toFixed(1)} m · ${m.floorsAboveGround} floors`,
      step: "setup",
    },
    {
      key: "parking",
      label: "Parking",
      value: m.parkingRequired > 0 || m.parkingProvided > 0 ? `${n0(m.parkingProvided)} / ${n0(m.parkingRequired)}` : "—",
      sub:
        m.parkingRequired <= 0
          ? "Provided / required"
          : m.parkingProvided >= m.parkingRequired
            ? `+${n0(m.parkingProvided - m.parkingRequired)} spare`
            : `${n0(m.parkingRequired - m.parkingProvided)} short`,
      step: "parking",
      tone: parkingTone,
    },
    {
      key: "lifts",
      label: "Lifts",
      value: m.lifts !== null ? String(m.lifts) : m.liftsOutOfChart ? "VT study" : "—",
      sub: m.liftsOutOfChart ? "Outside DBC chart" : "DBC D.8.8",
      step: "lifts",
      tone: m.liftsOutOfChart ? "warn" : null,
    },
  ];
}

export default function KpiStrip({
  metrics,
  onNavigate,
}: {
  metrics: ProjectMetrics;
  onNavigate: (step: StepId) => void;
}) {
  const kpis = buildKpis(metrics);
  return (
    <div className="flex overflow-x-auto no-scrollbar snap-x" role="list" aria-label="Scheme headline figures">
      {kpis.map((k) => (
        <button
          key={k.key}
          role="listitem"
          onClick={() => onNavigate(k.step)}
          className="group relative snap-start shrink-0 min-w-[124px] flex-1 text-left px-4 py-2.5 border-r border-ink-100 last:border-r-0 hover:bg-bone-50 transition-colors"
          title={`Open ${k.label}`}
        >
          <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500 font-medium whitespace-nowrap">
            {k.label}
            {k.tone === "ok" && <CircleCheck className="w-3.5 h-3.5 text-emerald-600" aria-label="on target" />}
            {(k.tone === "warn" || k.tone === "bad") && (
              <CircleAlert
                className={`w-3.5 h-3.5 ${k.tone === "bad" ? "text-red-600" : "text-amber-600"}`}
                aria-label={k.tone === "bad" ? "problem" : "check"}
              />
            )}
          </div>
          <div className="mt-0.5 text-[16px] leading-tight font-semibold text-ink-900 whitespace-nowrap tracking-tight">
            {k.value}
            {k.unit && <span className="ml-1 text-[11.5px] font-medium text-ink-500">{k.unit}</span>}
          </div>
          <div
            className={`mt-0.5 text-[11px] whitespace-nowrap truncate ${
              k.tone === "bad" ? "text-red-700" : k.tone === "warn" ? "text-amber-700" : "text-ink-500"
            }`}
          >
            {k.sub}
          </div>
          {k.meter !== undefined && (
            <div className="absolute left-4 right-4 bottom-1.5 h-[3px] rounded-full bg-brand-100 overflow-hidden" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  k.tone === "bad" ? "bg-red-500" : k.tone === "warn" ? "bg-amber-500" : "bg-brand-500"
                }`}
                style={{ width: `${Math.max(0, k.meter) * 100}%` }}
              />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
