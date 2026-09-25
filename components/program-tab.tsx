"use client";
import { useStore, useProject } from "@/lib/store";
import { computeProgram } from "@/lib/calc/program";
import { fmt0, fmt2 } from "@/lib/format";
import NumInput from "./num-input";

export default function ProgramTab() {
  const project = useProject();
  const setCell = useStore((s) => s.setProgramCell);
  const copyFloor = useStore((s) => s.copyProgramFloor);
  const program = computeProgram(project);

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
      <div className="card text-center text-ink-500 italic py-10">
        Add typologies first (tab 02) to start filling the program.
      </div>
    );
  }

  const floorsAbove = (floor: number) =>
    Array.from({ length: project.numFloors - floor }, (_, i) => floor + 1 + i);

  const minWidth = 90 + project.typologies.length * 64 + 70 + 110 + 130 + 64;

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Program — units per floor</h2>
          <p className="section-sub">
            Set the count of each typology on each floor. Use <strong>⇡</strong> to repeat a typical floor on every floor
            above it, <strong>×</strong> to clear a floor. Subtotals update live.
          </p>
        </div>
        <div className="tbl-scroll" style={{ ["--tbl-min" as string]: `${minWidth}px` }}>
          <table className="tbl table-fixed w-full">
            <colgroup>
              <col style={{ width: 90 }} />
              {project.typologies.map((t) => <col key={t.id} />)}
              <col style={{ width: 70 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="!py-3">Floor</th>
                {project.typologies.map((t) => (
                  <th key={t.id} className="text-right !px-1 align-bottom" title={t.name}>
                    <span className="block leading-tight truncate">{shortName(t.name)}</span>
                  </th>
                ))}
                <th className="text-right !px-1">Units</th>
                <th className="text-right">Sellable</th>
                <th className="text-right">Interior GFA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {program.byFloor.map((f) => (
                <tr key={f.floor}>
                  <td className="font-medium text-ink-900">Floor {f.floor}</td>
                  {project.typologies.map((t) => (
                    <td key={t.id} className="!p-1">
                      <NumInput
                        className="cell-input text-right !px-1.5 !py-1.5 text-sm"
                        value={cellValue(f.floor, t.id)}
                        integer
                        min={0}
                        onChange={(v) => setCell(f.floor, t.id, v)}
                        aria-label={`${t.name} on floor ${f.floor}`}
                      />
                    </td>
                  ))}
                  <td className="text-right font-medium !px-2">{fmt0(f.units)}</td>
                  <td className="text-right">{fmt2(f.totalSellable)}</td>
                  <td className="text-right">{fmt2(f.totalInteriorGFA)}</td>
                  <td className="!px-1 text-right whitespace-nowrap">
                    <button
                      className="px-1.5 py-1 text-[13px] leading-none text-ink-500 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-30 disabled:hover:bg-transparent"
                      title={`Copy floor ${f.floor} to every floor above`}
                      aria-label={`Copy floor ${f.floor} to every floor above`}
                      disabled={f.floor >= project.numFloors}
                      onClick={() => {
                        const targets = floorsAbove(f.floor);
                        if (confirm(`Copy floor ${f.floor} to floors ${targets[0]}–${targets[targets.length - 1]}? Their current units are replaced.`)) {
                          copyFloor(f.floor, targets);
                        }
                      }}
                    >⇡</button>
                    <button
                      className="px-1.5 py-1 text-[13px] leading-none text-ink-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                      title={`Clear floor ${f.floor}`}
                      aria-label={`Clear floor ${f.floor}`}
                      disabled={f.units === 0}
                      onClick={() => {
                        for (const t of project.typologies) if (cellValue(f.floor, t.id) > 0) setCell(f.floor, t.id, 0);
                      }}
                    >×</button>
                  </td>
                </tr>
              ))}
              <tr className="row-total">
                <td>TOTAL</td>
                {project.typologies.map((t) => {
                  const ts = program.byTypology.find((x) => x.typology.id === t.id);
                  return <td key={t.id} className="text-right !px-2">{fmt0(ts?.totalUnits ?? 0)}</td>;
                })}
                <td className="text-right !px-2">{fmt0(program.totalUnits)}</td>
                <td className="text-right">{fmt2(program.totalSellable)}</td>
                <td className="text-right">{fmt2(program.totalInteriorGFA)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Mix by typology</h2>
        </div>
        <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "600px" }}>
          <table className="tbl w-full">
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
                <th className="text-right">Total interior (m²)</th>
                <th className="text-right">Total sellable (m²)</th>
              </tr>
            </thead>
            <tbody>
              {program.byTypology.map((ts) => (
                <tr key={ts.typology.id}>
                  <td className="font-medium text-ink-900">{ts.typology.name} <span className="text-ink-400 text-xs ml-1">{ts.typology.category}</span></td>
                  <td className="text-right">{fmt0(ts.totalUnits)}</td>
                  <td className="text-right">{(ts.pctOfTotal * 100).toFixed(1)}%</td>
                  <td className="text-right">{fmt2(ts.totalInteriorGFA)}</td>
                  <td className="text-right">{fmt2(ts.totalSellable)}</td>
                </tr>
              ))}
              <tr className="row-total">
                <td>TOTAL</td>
                <td className="text-right">{fmt0(program.totalUnits)}</td>
                <td className="text-right">{program.totalUnits > 0 ? "100.0%" : "—"}</td>
                <td className="text-right">{fmt2(program.totalInteriorGFA)}</td>
                <td className="text-right">{fmt2(program.totalSellable)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
