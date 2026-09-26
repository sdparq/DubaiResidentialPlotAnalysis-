"use client";
import { useMemo, useState } from "react";
import { useStore, useProject } from "@/lib/store";
import { computeProgram } from "@/lib/calc/program";
import { fmt0, fmt2 } from "@/lib/format";
import { useZoneLibrary } from "@/lib/use-zone-library";
import { classForZone, TYPOLOGY_KEYS, type TypologyKey } from "@/lib/zone-classes";
import { residentialSubGFA } from "@/lib/calc/gfa";
import { balconyGfaFactor, unitGfaArea } from "@/lib/calc/balcony";
import { computeProgramAutoFill, resolveTypologyMix } from "@/lib/calc/program-autofill";
import {
  type Typology,
  type UnitCategory,
} from "@/lib/types";
import { StackedBar } from "./ui/stacked-bar";

/** Ordinal ramp (small → large units), one hue light → dark. */
const CATEGORY_RAMP: Record<UnitCategory, string> = {
  Studio: "#5fbaa4",
  "1BR": "#2a9d84",
  "2BR": "#0d7f69",
  "3BR": "#0b6c5a",
  "4BR": "#0a584a",
  Penthouse: "#0a473d",
};
const CATEGORY_LABEL: Record<UnitCategory, string> = {
  Studio: "Studio",
  "1BR": "1 Bedroom",
  "2BR": "2 Bedrooms",
  "3BR": "3 Bedrooms",
  "4BR": "4 Bedrooms",
  Penthouse: "Penthouse",
};

const CATEGORY_FOR_TYPOLOGY_KEY: Record<TypologyKey, UnitCategory | null> = {
  studio: "Studio",
  "1BR": "1BR",
  "2BR": "2BR",
  "3BR": "3BR",
  "4BR": "4BR",
  "5BR": null,
  "6BR": null,
  "7BR": null,
  penthouse: "Penthouse",
};

/** Apartments-only GFA from Setup. Delegates to the shared helper so the math
 *  stays consistent with the Setup table and the Common Areas group totals. */
function computeApartmentsGFA(project: ReturnType<typeof useProject>): number {
  return residentialSubGFA(project, "apartments");
}

export default function ProgramTab() {
  const project = useProject();
  const setCell = useStore((s) => s.setProgramCell);
  const program = computeProgram(project);
  const gfaColLabel =
    program.balconyGfaFactor > 0
      ? `GFA (int. + ${Math.round(program.balconyGfaFactor * 100)}% balc.)`
      : "Interior GFA";
  const { library } = useZoneLibrary();
  const detectedClass = useMemo(() => classForZone(project.zone, library), [project.zone, library]);
  const apartmentsGFA = useMemo(() => computeApartmentsGFA(project), [project]);

  const cellValue = (floor: number, typologyId: string) =>
    project.program.find((c) => c.floor === floor && c.typologyId === typologyId)?.count ?? 0;

  const shortName = (n: string) =>
    n
      .replace(/\bType\s+/i, "")
      .replace(/\bStudio\b/i, "Std")
      .replace(/\bPenthouse\b/i, "PH")
      .replace(/\s+/g, " ")
      .trim();

  if (project.typologies.length === 0) {
    return (
      <div className="card text-center text-ink-500 py-12">
        <div className="text-[15px] font-semibold text-ink-800">No typologies yet</div>
        <p className="text-[13px] mt-1">Add unit typologies in step 04 · Typologies to start filling the apartments matrix.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {detectedClass && (
        <AutoFillPanel
          letter={detectedClass}
          project={project}
          mix={resolveTypologyMix(project, library[detectedClass].typologyMix)}
          apartmentsGFA={apartmentsGFA}
          onApply={(cells) => {
            for (const c of [...project.program]) {
              setCell(c.floor, c.typologyId, 0);
            }
            for (const { floor, typologyId, count } of cells) {
              if (count > 0) setCell(floor, typologyId, count);
            }
          }}
        />
      )}

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Units per floor</h2>
          <p className="section-sub">Set the count of each typology on each floor — totals, parking and lifts update live.</p>
        </div>
        <div className="w-full">
          <table className="tbl table-fixed w-full" style={{ minWidth: 90 + project.typologies.length * 64 + 310 }}>
            <colgroup>
              <col style={{ width: 90 }} />
              {project.typologies.map((t) => <col key={t.id} />)}
              <col style={{ width: 70 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="!py-3">Floor</th>
                {project.typologies.map((t) => (
                  <th key={t.id} className="text-right !px-1 align-bottom" title={t.name}>
                    <span className="block leading-tight whitespace-nowrap">{shortName(t.name)}</span>
                  </th>
                ))}
                <th className="text-right !px-1">Units</th>
                <th className="text-right">Sellable</th>
                <th className="text-right">{gfaColLabel}</th>
              </tr>
            </thead>
            <tbody>
              {program.byFloor.map((f) => (
                <tr key={f.floor}>
                  <td className="font-medium text-ink-900">Floor {f.floor}</td>
                  {project.typologies.map((t) => (
                    <td key={t.id} className="!p-1">
                      <input
                        type="number"
                        min={0}
                        className="cell-input text-right !px-1.5 !py-1.5 text-sm"
                        value={cellValue(f.floor, t.id)}
                        onChange={(e) => setCell(f.floor, t.id, Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
                      />
                    </td>
                  ))}
                  <td className="text-right font-medium !px-2">{fmt0(f.units)}</td>
                  <td className="text-right">{fmt2(f.totalSellable)}</td>
                  <td className="text-right">{fmt2(f.totalGFA)}</td>
                </tr>
              ))}
              <tr className="row-total">
                <td>Total</td>
                {project.typologies.map((t) => {
                  const ts = program.byTypology.find((x) => x.typology.id === t.id);
                  return <td key={t.id} className="text-right !px-2">{fmt0(ts?.totalUnits ?? 0)}</td>;
                })}
                <td className="text-right !px-2">{fmt0(program.totalUnits)}</td>
                <td className="text-right">{fmt2(program.totalSellable)}</td>
                <td className="text-right">{fmt2(program.totalApartmentsGFA)}</td>
              </tr>
            </tbody>
          </table>
          {program.balconyGfaFactor > 0 && (
            <p className="text-[12px] text-ink-500 mt-2 leading-snug">
              GFA counts interior + {Math.round(program.balconyGfaFactor * 100)} % of each balcony
              (Typologies → Balconies in GFA): {fmt2(program.totalInteriorGFA)} m² interior +{" "}
              {fmt2(program.totalBalconyGFA)} m² of the {fmt2(program.totalBalcony)} m² of balconies.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Unit mix</h2>
          <p className="section-sub">Share of units by category, then the detail per typology.</p>
        </div>
        {program.totalUnits > 0 && (
          <div className="mb-5">
            <StackedBar
              label="Unit mix by category"
              segments={(Object.keys(CATEGORY_RAMP) as UnitCategory[]).map((cat) => {
                const units = program.byTypology
                  .filter((x) => x.typology.category === cat)
                  .reduce((sum, x) => sum + x.totalUnits, 0);
                return {
                  key: cat,
                  label: CATEGORY_LABEL[cat],
                  value: units,
                  color: CATEGORY_RAMP[cat],
                  display: `${units} · ${((units / program.totalUnits) * 100).toFixed(0)}%`,
                };
              })}
            />
          </div>
        )}
        <table className="tbl w-full" style={{ minWidth: 680 }}>
          <colgroup>
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Typology</th>
              <th className="text-right">Units</th>
              <th className="text-right">% of total</th>
              <th className="text-right">{gfaColLabel} (m²)</th>
              <th className="text-right">Total sellable (m²)</th>
            </tr>
          </thead>
          <tbody>
            {program.byTypology.map((ts) => (
              <tr key={ts.typology.id}>
                <td className="font-medium text-ink-900">{ts.typology.name} <span className="text-ink-400 text-xs ml-1">{ts.typology.category}</span></td>
                <td className="text-right">{fmt0(ts.totalUnits)}</td>
                <td className="text-right">{(ts.pctOfTotal * 100).toFixed(1)}%</td>
                <td className="text-right">{fmt2(ts.totalGFA)}</td>
                <td className="text-right">{fmt2(ts.totalSellable)}</td>
              </tr>
            ))}
            <tr className="row-total">
              <td>Total</td>
              <td className="text-right">{fmt0(program.totalUnits)}</td>
              <td className="text-right">100.0%</td>
              <td className="text-right">{fmt2(program.totalApartmentsGFA)}</td>
              <td className="text-right">{fmt2(program.totalSellable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AutoFillPanelProps {
  letter: ReturnType<typeof classForZone>;
  project: ReturnType<typeof useProject>;
  mix: Record<TypologyKey, number>;
  apartmentsGFA: number;
  onApply: (cells: { floor: number; typologyId: string; count: number }[]) => void;
}

function AutoFillPanel({ letter, project, mix, apartmentsGFA, onApply }: AutoFillPanelProps) {
  const { typologies, numFloors } = project;
  const existingProgramCount = project.program.length;

  // Mix entries whose category has no typology in the project — those units
  // would be dropped. Flag them so the user can add the missing typology.
  const droppedKeys: TypologyKey[] = [];
  for (const k of TYPOLOGY_KEYS) {
    const cat = CATEGORY_FOR_TYPOLOGY_KEY[k];
    const pct = mix[k];
    if (pct > 0.001 && (!cat || !typologies.some((t) => t.category === cat))) droppedKeys.push(k);
  }
  const droppedShare = droppedKeys.reduce((s, k) => s + mix[k], 0);

  // Single source of truth — the same helper the Typologies mix editor uses,
  // so the preview here and the silent re-fill there can never drift apart.
  const fill = useMemo(() => computeProgramAutoFill(project, mix), [project, mix]);
  const targets = fill?.perTypology ?? [];
  const totalUnits = fill?.totalUnits ?? 0;
  // Σ units × GFA per unit — interior + the balcony share the project counts
  // as GFA (Typologies → Balconies in GFA). allocatedGFA already carries it.
  const actualInteriorGFA = targets.reduce((s, x) => s + x.allocatedGFA, 0);
  const interiorGFADrift = actualInteriorGFA - apartmentsGFA;
  const bf = balconyGfaFactor(project);

  // What the matrix holds RIGHT NOW, so we can warn before Apply overwrites a
  // table that no longer matches the auto-fill (edited by hand, or filled
  // under earlier Setup / mix / typology values).
  const current = useMemo(() => computeProgram(project), [project]);
  const matrixDiverges =
    existingProgramCount > 0 &&
    !!fill &&
    totalUnits > 0 &&
    (current.totalUnits !== totalUnits || Math.abs(current.totalApartmentsGFA - actualInteriorGFA) > 1);

  function apply() {
    if (apartmentsGFA <= 0) {
      alert("Set the Residential GFA in the Setup tab first (GFA breakdown → Residential).");
      return;
    }
    if (!fill || totalUnits <= 0) {
      alert("Unit counts would all round to zero — typology interior areas are too large for the Apartments GFA target.");
      return;
    }
    if (existingProgramCount > 0) {
      const ok = confirm(
        `Replace the current matrix (${current.totalUnits} units · Σ ${Math.round(current.totalApartmentsGFA).toLocaleString("en-US")} m² GFA) with ${totalUnits} units across ${numFloors} floors (Σ GFA ≈ ${Math.round(actualInteriorGFA).toLocaleString("en-US")} m²)? This recomputes everything from the current class mix, Apartments GFA and typology areas — manual edits to the matrix are lost.`,
      );
      if (!ok) return;
    }
    onApply(fill.cells);
  }

  return (
    <div className="card bg-gradient-to-br from-brand-50 to-white border-brand-200">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="w-14 h-14 rounded-2xl bg-white ring-1 ring-brand-200 shadow-card flex flex-col items-center justify-center shrink-0">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-brand-600 leading-none">Class</span>
          <span className="text-[24px] font-semibold text-brand-700 leading-none mt-0.5">{letter}</span>
        </div>
        <div className="flex-1 min-w-[260px]">
          <div className="text-[16px] font-semibold text-ink-900 tracking-tight">Auto-fill from the unit mix</div>
          <p className="text-[13px] text-ink-600 mt-1 leading-snug">
            Distributes units across the matrix using the project&apos;s unit mix (class {letter}&apos;s
            defaults plus any per-typology override from Typologies) and
            the <strong>Apartments GFA</strong> from Setup as the target. After applying,
            <em> Σ count × GFA per unit</em> in Program should equal the Apartments GFA target
            {bf > 0
              ? ` — GFA per unit = interior + ${Math.round(bf * 100)} % of the balcony (Typologies → Balconies in GFA).`
              : " — balconies are GFA-exempt (Typologies → Balconies in GFA), so GFA per unit = interior."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="rounded-lg bg-white ring-1 ring-inset ring-brand-200 p-3">
              <div className="text-[12px] font-medium text-ink-500">Apartments GFA target</div>
              <div className="text-[18px] font-semibold text-brand-800 tracking-tight mt-0.5">
                {apartmentsGFA > 0 ? `${Math.round(apartmentsGFA).toLocaleString("en-US")} m²` : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-white ring-1 ring-inset ring-ink-200/80 p-3">
              <div className="text-[12px] font-medium text-ink-500">Estimated total units</div>
              <div className="text-[18px] font-semibold text-ink-900 tracking-tight mt-0.5">{totalUnits.toLocaleString("en-US")}</div>
            </div>
            <div className="rounded-lg bg-white ring-1 ring-inset ring-ink-200/80 p-3">
              <div className="text-[12px] font-medium text-ink-500">After rounding · Σ GFA{bf > 0 ? ` (int. + ${Math.round(bf * 100)}% balc.)` : ""}</div>
              <div className="text-[18px] font-semibold text-ink-900 tracking-tight mt-0.5">
                {Math.round(actualInteriorGFA).toLocaleString("en-US")} m²
              </div>
              {Math.abs(interiorGFADrift) > 1 && (
                <div className={`text-[11.5px] ${Math.abs(interiorGFADrift) > apartmentsGFA * 0.02 ? "text-amber-700" : "text-ink-500"}`}>
                  {interiorGFADrift >= 0 ? "+" : ""}{Math.round(interiorGFADrift).toLocaleString("en-US")} m² vs target
                </div>
              )}
            </div>
            <div className="flex items-end">
              <button
                className="btn btn-primary w-full"
                onClick={apply}
                disabled={apartmentsGFA <= 0 || typologies.length === 0 || totalUnits <= 0}
              >Apply to {numFloors} floors</button>
            </div>
          </div>

          {apartmentsGFA <= 0 && (
            <p className="text-[12px] text-amber-800 mt-3 leading-snug">
              No Apartments GFA detected. Set <strong>Residential</strong> in Setup&apos;s GFA breakdown
              (and the Apartments share of the residential sub-breakdown) to enable auto-fill.
            </p>
          )}

          {droppedKeys.length > 0 && apartmentsGFA > 0 && (
            <p className="text-[12px] text-amber-800 mt-3 leading-snug">
              {(droppedShare * 100).toFixed(1)}% of the class mix has no matching typology in the
              project — those units are dropped (categories: {droppedKeys.join(", ")}).
              Add a typology of that category in the Typologies tab to capture them.
            </p>
          )}

          {matrixDiverges && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 mt-3 text-[12.5px] leading-snug">
              The matrix below currently holds <strong>{current.totalUnits} units</strong> (Σ{" "}
              {Math.round(current.totalApartmentsGFA).toLocaleString("en-US")} m² GFA) — different
              from the <strong>{totalUnits} units</strong> this auto-fill would produce. It was
              either edited by hand or filled when Setup / unit mix / typology areas had other
              values. <strong>Apply replaces it entirely</strong> with the recomputed distribution.
            </div>
          )}

          {targets.length > 0 && totalUnits > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-ink-600 mb-2">Per typology · target units</div>
              <table className="w-full text-[12.5px] tabular-nums">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-[0.05em] text-ink-500">
                    <th className="text-left py-1 font-medium">Typology</th>
                    <th className="text-right py-1 font-medium">Mix %</th>
                    <th className="text-right py-1 font-medium">{bf > 0 ? "GFA / unit" : "Interior / unit"}</th>
                    <th className="text-right py-1 font-medium">Allocated GFA</th>
                    <th className="text-right py-1 font-medium">Units</th>
                    <th className="text-right py-1 font-medium">Units / floor</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((x) => {
                    // Effective share straight from the auto-fill — includes any
                    // per-typology override set in Typologies → Unit mix.
                    const sharePct = x.unitSharePct / 100;
                    return (
                      <tr key={x.typology.id} className="border-t border-brand-200/60">
                        <td className="py-1 text-ink-900">{x.typology.name}</td>
                        <td className="py-1 text-right text-ink-700">{(sharePct * 100).toFixed(1)}%</td>
                        <td className="py-1 text-right text-ink-700">{unitGfaArea(project, x.typology).toFixed(1)} m²</td>
                        <td className="py-1 text-right text-ink-700">{Math.round(x.allocatedGFA).toLocaleString("en-US")} m²</td>
                        <td className="py-1 text-right text-ink-900 font-medium">{x.units}</td>
                        <td className="py-1 text-right text-ink-700">
                          {numFloors > 0 ? (x.units / numFloors).toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
