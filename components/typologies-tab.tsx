"use client";
import { useStore, useProject } from "@/lib/store";
import type { Typology, UnitCategory } from "@/lib/types";
import { DUBAI_STANDARDS } from "@/lib/standards/dubai";
import { fmt0 } from "@/lib/format";
import { m2ToSqft } from "@/lib/units";
import NumInput from "./num-input";

const CATEGORIES: UnitCategory[] = ["Studio", "1BR", "2BR", "3BR", "4BR", "Penthouse"];

const DEFAULT_PARKING = DUBAI_STANDARDS.parking.ratiosByCategory;
const DEFAULT_OCCUPANCY: Record<UnitCategory, number> = {
  Studio: 1.5, "1BR": 2, "2BR": 3, "3BR": 5, "4BR": 6, Penthouse: 6,
};

export default function TypologiesTab() {
  const project = useProject();
  const upsert = useStore((s) => s.upsertTypology);
  const remove = useStore((s) => s.removeTypology);

  function addNew() {
    upsert({
      id: `t-${Date.now()}`,
      name: "New Typology",
      category: "Studio",
      internalArea: 0,
      balconyArea: 0,
      occupancy: DEFAULT_OCCUPANCY.Studio,
      parkingPerUnit: DEFAULT_PARKING.Studio,
    });
  }

  function update(t: Typology, patch: Partial<Typology>) {
    upsert({ ...t, ...patch });
  }

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2 className="section-title">Typologies</h2>
            <p className="section-sub">
              Define each unit type used in the project. Areas in m². Occupancy and parking ratios drive the lift and
              parking calculations — changing the category loads its default ratios.
            </p>
          </div>
          <button className="btn btn-primary" onClick={addNew}>+ Add typology</button>
        </div>
        {project.typologies.length === 0 ? (
          <div className="text-sm text-ink-500 italic py-10 text-center">No typologies yet — add one to start.</div>
        ) : (
          <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "820px" }}>
            <table className="tbl w-full table-fixed">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th className="text-right">Interior (m²)</th>
                  <th className="text-right">Balcony (m²)</th>
                  <th className="text-right">Sellable</th>
                  <th className="text-right">Occupancy</th>
                  <th className="text-right">Parking / unit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {project.typologies.map((t) => {
                  const total = t.internalArea + t.balconyArea;
                  return (
                    <tr key={t.id}>
                      <td className="cell-edit">
                        <input className="cell-input" value={t.name} onChange={(e) => update(t, { name: e.target.value })} aria-label="Typology name" />
                      </td>
                      <td className="cell-edit">
                        <select
                          className="cell-input"
                          value={t.category}
                          aria-label="Category"
                          onChange={(e) => {
                            const cat = e.target.value as UnitCategory;
                            update(t, { category: cat, occupancy: DEFAULT_OCCUPANCY[cat], parkingPerUnit: DEFAULT_PARKING[cat] });
                          }}
                        >
                          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="cell-edit">
                        <NumInput className="cell-input text-right" value={t.internalArea} min={0} step={0.5} onChange={(v) => update(t, { internalArea: v })} aria-label="Interior area" />
                      </td>
                      <td className="cell-edit">
                        <NumInput className="cell-input text-right" value={t.balconyArea} min={0} step={0.5} onChange={(v) => update(t, { balconyArea: v })} aria-label="Balcony area" />
                      </td>
                      <td className="text-right leading-tight">
                        {total.toFixed(2)} m²
                        <span className="block text-[11px] text-ink-500">{fmt0(m2ToSqft(total))} sq ft</span>
                      </td>
                      <td className="cell-edit">
                        <NumInput className="cell-input text-right" value={t.occupancy} min={0} step={0.5} onChange={(v) => update(t, { occupancy: v })} aria-label="Occupancy" />
                      </td>
                      <td className="cell-edit">
                        <NumInput className="cell-input text-right" value={t.parkingPerUnit} min={0} step={0.5} onChange={(v) => update(t, { parkingPerUnit: v })} aria-label="Parking per unit" />
                      </td>
                      <td className="text-right">
                        <button className="btn btn-danger btn-xs" onClick={() => { if (confirm(`Delete ${t.name}? Its units are removed from the program.`)) remove(t.id); }}>Delete</button>
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
  );
}
