"use client";
import { useStore, useProject } from "@/lib/store";
import { computeLifts } from "@/lib/calc/lifts";
import type { LiftsConfig } from "@/lib/types";
import { fmt0, fmt2, fmtPct } from "@/lib/format";
import NumInput from "./num-input";

export default function LiftsTab() {
  const project = useProject();
  const patch = useStore((s) => s.patch);
  const r = computeLifts(project);
  const cfg = project.lifts;
  const set = (p: Partial<LiftsConfig>) => patch({ lifts: { ...cfg, ...p } });
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`;

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Lift configuration · CIBSE Guide D</h2>
          <p className="section-sub">
            Cabin, speed and operating parameters for the up-peak round-trip-time (RTT) calculation. Lifts are sized on
            handling capacity and on the average interval, then checked against the rule of thumb and a minimum count.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Cabin rated load (kg)" hint={`${r.ratedPersons} persons rated`}>
            <select className="cell-input" value={cfg.cabinKg} onChange={(e) => set({ cabinKg: parseInt(e.target.value, 10) as LiftsConfig["cabinKg"] })}>
              <option value={1000}>1000 kg</option>
              <option value={1275}>1275 kg</option>
              <option value={1600}>1600 kg</option>
            </select>
          </Field>
          <Field label="Rated speed (m/s)">
            <NumInput value={cfg.speed} min={0.1} max={10} step={0.25} onChange={(v) => set({ speed: v })} />
          </Field>
          <Field label="Time per stop t_s (s)" hint="Doors + acceleration losses">
            <NumInput value={cfg.timePerStop} min={0} max={30} step={0.5} onChange={(v) => set({ timePerStop: v })} />
          </Field>
          <Field label="Passenger transfer t_p (s)" hint="Per passenger in or out">
            <NumInput value={cfg.passengerTransferS ?? 1.2} min={0} max={5} step={0.1} onChange={(v) => set({ passengerTransferS: v })} />
          </Field>
          <Field label="Standard handling (5 min)" hint="Share of the population">
            <NumInput value={cfg.handlingPctStandard * 100} min={0} max={50} step={0.5} suffix="%" onChange={(v) => set({ handlingPctStandard: v / 100 })} />
          </Field>
          <Field label="Premium handling (5 min)" hint="Share of the population">
            <NumInput value={cfg.handlingPctPremium * 100} min={0} max={50} step={0.5} suffix="%" onChange={(v) => set({ handlingPctPremium: v / 100 })} />
          </Field>
          <Field label="Target average interval (s)">
            <NumInput value={cfg.targetIntervalS ?? 60} min={10} max={300} step={5} onChange={(v) => set({ targetIntervalS: v })} />
          </Field>
          <Field label="Rule of thumb · units per lift">
            <NumInput value={cfg.unitsPerLiftRule} integer min={1} step={5} onChange={(v) => set({ unitsPerLiftRule: v })} />
          </Field>
          <Field label="Minimum lifts" hint="Authority / client requirement">
            <NumInput value={cfg.dcdMinLifts} integer min={0} max={50} onChange={(v) => set({ dcdMinLifts: v })} />
          </Field>
          <Field label="…applies from (units)">
            <NumInput value={cfg.dcdMinUnitsThreshold} integer min={0} step={10} onChange={(v) => set({ dcdMinUnitsThreshold: v })} />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="mb-5"><h2 className="section-title">Population by floor</h2></div>
        <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "420px" }}>
          <table className="tbl w-full table-fixed">
            <colgroup>
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead><tr><th>Floor</th><th className="text-right">Units</th><th className="text-right">Population</th></tr></thead>
            <tbody>
              {r.byFloor.map((f) => (
                <tr key={f.floor}><td className="font-medium text-ink-900">Floor {f.floor}</td><td className="text-right">{fmt0(f.units)}</td><td className="text-right">{fmt2(f.population)}</td></tr>
              ))}
              <tr className="row-total"><td>TOTAL</td><td className="text-right">{fmt0(r.totalUnits)}</td><td className="text-right">{fmt2(r.totalPopulation)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Round trip time</h2>
          <p className="section-sub">RTT = 2·H·t_v + (S + 1)·t_s + 2·P·t_p — up-peak, all floors served from the ground-floor lobby.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Passengers / trip · P" value={fmt0(r.personsPerTrip)} sub={`80% of ${r.ratedPersons} rated · ${cfg.cabinKg} kg`} />
          <Kpi label="Floors served · N" value={fmt0(r.floorsServed)} sub={`${fmt2(r.totalTravelHeight)} m travel`} />
          <Kpi label="Probable stops · S" value={r.probableStops.toFixed(2)} sub="N·[1 − (1 − 1/N)^P]" />
          <Kpi label="Highest reversal · H" value={r.highestReversalFloor.toFixed(2)} sub="N − Σ(i/N)^P" />
          <Kpi label="Floor transit · t_v" value={`${r.interfloorTimeS.toFixed(2)} s`} sub={`${project.floorHeight} m ÷ ${cfg.speed} m/s`} />
          <Kpi label="RTT" value={`${r.rttSeconds.toFixed(1)} s`} sub={`${r.tripsPer5Min.toFixed(2)} trips / 5 min`} />
          <Kpi label="Handling / lift" value={fmt0(r.capacityPerLift)} sub="persons / 5 min = 300·P / RTT" />
          <Kpi label="Demand" value={`${fmt0(r.demandStandard)} – ${fmt0(r.demandPremium)}`} sub={`${pct(cfg.handlingPctStandard)} – ${pct(cfg.handlingPctPremium)} of ${fmt0(r.totalPopulation)} people`} />
        </div>
      </div>

      <div className="card">
        <div className="mb-5"><h2 className="section-title">Lifts required</h2></div>
        <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "560px" }}>
          <table className="tbl w-full table-fixed">
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: "42%" }} />
            </colgroup>
            <thead><tr><th>Criterion</th><th className="text-right">Lifts</th><th>Basis</th></tr></thead>
            <tbody>
              <tr><td>CIBSE handling · {pct(cfg.handlingPctStandard)}</td><td className="text-right">{fmt0(r.liftsCIBSEStandard)}</td><td className="text-ink-500 text-xs">ceil({fmt0(r.demandStandard)} ÷ {fmt0(r.capacityPerLift)})</td></tr>
              <tr><td>CIBSE handling · {pct(cfg.handlingPctPremium)}</td><td className="text-right">{fmt0(r.liftsCIBSEPremium)}</td><td className="text-ink-500 text-xs">ceil({fmt0(r.demandPremium)} ÷ {fmt0(r.capacityPerLift)})</td></tr>
              <tr><td>CIBSE interval ≤ {r.targetIntervalS} s</td><td className="text-right">{fmt0(r.liftsForInterval)}</td><td className="text-ink-500 text-xs">ceil({r.rttSeconds.toFixed(1)} ÷ {r.targetIntervalS})</td></tr>
              <tr><td>Rule of thumb (1 per {cfg.unitsPerLiftRule} units)</td><td className="text-right">{fmt0(r.ruleOfThumbLifts)}</td><td className="text-ink-500 text-xs">{fmt0(r.totalUnits)} units</td></tr>
              <tr><td>Minimum (≥ {cfg.dcdMinUnitsThreshold} units)</td><td className="text-right">{fmt0(r.dcdMinLifts)}</td><td className="text-ink-500 text-xs">Configured requirement</td></tr>
              <tr className="row-total">
                <td>RECOMMENDED</td>
                <td className="text-right text-2xl text-brand-700 font-semibold">{fmt0(r.liftsRecommended)}</td>
                <td className="text-ink-700 text-xs uppercase tracking-wider">{r.governing}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {r.liftsRecommended > 0 && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi
              label="Average interval"
              value={`${r.intervalAchievedS.toFixed(1)} s`}
              sub={`target ≤ ${r.targetIntervalS} s`}
              tone={r.intervalAchievedS <= r.targetIntervalS ? "good" : "bad"}
            />
            <Kpi label="Handling capacity" value={fmtPct(r.handlingAchievedPct)} sub="of the population in 5 min" />
            <Kpi label="Lift lobby" value={`${r.liftsRecommended} × ${cfg.cabinKg} kg`} sub={`${cfg.speed} m/s`} />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 content-start">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-500 -mt-1">{hint}</span>}
    </label>
  );
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${cls}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}
