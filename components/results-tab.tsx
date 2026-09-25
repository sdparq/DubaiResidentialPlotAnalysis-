"use client";
import { useProject } from "@/lib/store";
import { analyze } from "@/lib/calc";
import { computeChecks, type CheckStatus } from "@/lib/calc/compliance";
import { fmt0, fmt2, fmtMoneyShort, fmtPct, fmtSqft } from "@/lib/format";
import { perM2ToPerSqft } from "@/lib/units";
import { BRAND } from "@/lib/brand";

const TAG: Record<CheckStatus, { cls: string; text: string }> = {
  ok: { cls: "tag-ok", text: "OK" },
  fail: { cls: "tag-bad", text: "Review" },
  info: { cls: "tag-info", text: "Info" },
};

export default function ResultsTab() {
  const project = useProject();
  const r = analyze(project);
  const p = r.program, k = r.parking, l = r.lifts, g = r.garbage, e = r.economic;
  const checks = computeChecks(project, r);
  const failing = checks.filter((c) => c.status === "fail").length;
  const hasEconomics = e.totalRevenue > 0;
  const cur = e.currency;

  return (
    <div className="grid gap-6">
      {/* Report header — only on paper / PDF */}
      <div className="hidden print:block border-b border-ink-300 pb-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-ink-500">{BRAND.wordmark} · {BRAND.descriptor}</div>
        <div className="text-2xl font-medium text-ink-900 mt-1">{project.name}</div>
        <div className="text-[12px] text-ink-500 mt-0.5">
          {[project.zone, project.plotNumber ? `Plot ${project.plotNumber}` : null, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="text-[12.5px] text-ink-700">
          {failing === 0 ? (
            <span className="tag-ok">All checks pass</span>
          ) : (
            <span className="tag-bad">{failing} check{failing === 1 ? "" : "s"} to review</span>
          )}
          <span className="ml-3 text-ink-500">Every figure below is recomputed live from the inputs.</span>
        </div>
        <button className="btn btn-secondary" onClick={() => window.print()} title="Print or save this summary as a PDF">
          Print / Save PDF
        </button>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Plot area" value={`${fmt0(project.plotArea)} m²`} sub={fmtSqft(project.plotArea)} />
        <Kpi label="Total GFA" value={`${fmt0(p.totalGFABuilding)} m²`} sub={`FAR ${p.far.toFixed(2)} · ${fmtSqft(p.totalGFABuilding)}`} />
        <Kpi label="Total BUA" value={`${fmt0(p.totalBUABuilding)} m²`} sub={`GFA / BUA ${fmtPct(p.totalGFABuilding / (p.totalBUABuilding || 1))}`} />
        <Kpi label="Units" value={fmt0(p.totalUnits)} sub={Object.entries(p.unitsByCategory).filter(([, n]) => n > 0).map(([c, n]) => `${n} ${c}`).join(" · ")} />
        <Kpi label="Sellable" value={`${fmt0(p.totalSellable)} m²`} sub={`incl. balconies · ${fmtPct(p.totalSellable / (p.totalGFABuilding || 1))} of GFA`} />
        <Kpi label="Population" value={fmt0(l.totalPopulation)} sub="from typology occupancy" />
      </section>

      {hasEconomics && (
        <section className="card">
          <h3 className="section-title">Economics</h3>
          <div className="section-rule" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 text-sm">
            <Figure label="GDV" value={fmtMoneyShort(e.totalRevenue, cur)} sub={`${cur} ${fmt0(perM2ToPerSqft(e.avgPricePerM2Sellable))} / sq ft avg`} />
            <Figure label="Total development cost" value={fmtMoneyShort(e.totalCost, cur)} sub={`land ${fmtPct(e.landSharePct)}`} />
            <Figure label="Profit" value={fmtMoneyShort(e.profit, cur)} tone={e.profit >= 0 ? "good" : "bad"} />
            <Figure label="Margin on GDV" value={fmtPct(e.marginOnGDV)} sub={`${fmtPct(e.marginOnCost)} on cost`} tone={e.marginOnGDV >= e.targetMarginPct ? "good" : "bad"} />
            <Figure label="Land / sq ft GFA" value={`${cur} ${fmt0(e.landCostPerSqftGFA)}`} sub={fmtMoneyShort(e.landCost, cur)} />
            <Figure
              label={`Residual land @ ${fmtPct(e.targetMarginPct, 0)}`}
              value={fmtMoneyShort(e.residualLandValue, cur)}
              sub={`${cur} ${fmt0(e.residualLandPerSqftGFA)} / sq ft GFA`}
              tone={e.residualLandValue >= e.landCost ? "good" : "bad"}
            />
          </div>
        </section>
      )}

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title">Parking</h3>
          <div className="section-rule" />
          <dl className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <Stat label="Available total" value={fmt0(k.availableTotal)} />
            <Stat label="Required total" value={fmt0(k.grandRequired)} />
            <Stat label="Available PRM" value={fmt0(k.availablePRM)} />
            <Stat label="Required PRM" value={fmt0(k.requiredPRM)} />
            <Stat label="Balance" value={(k.grandBalance >= 0 ? "+" : "") + fmt0(k.grandBalance)} good={k.grandBalance >= 0} />
            <Stat label="PRM balance" value={(k.prmBalance >= 0 ? "+" : "") + fmt0(k.prmBalance)} good={k.prmBalance >= 0} />
          </dl>
        </div>

        <div className="card">
          <h3 className="section-title">Lifts · CIBSE Guide D</h3>
          <div className="section-rule" />
          <dl className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <Stat label="Demand (5 min)" value={`${fmt0(l.demandStandard)} – ${fmt0(l.demandPremium)}`} />
            <Stat label="Round trip time" value={`${l.rttSeconds.toFixed(1)} s`} />
            <Stat label="Handling / lift" value={`${fmt0(l.capacityPerLift)} / 5 min`} />
            <Stat label="CIBSE lifts" value={fmt0(l.liftsCIBSE)} />
            <Stat label="Average interval" value={`${l.intervalAchievedS.toFixed(1)} s`} good={l.liftsRecommended > 0 ? l.intervalAchievedS <= l.targetIntervalS : undefined} />
            <Stat label="Recommended" value={fmt0(l.liftsRecommended)} good={l.liftsRecommended > 0 ? true : undefined} />
          </dl>
          <div className="text-xs text-ink-500 mt-3">Governed by: {l.governing}</div>
        </div>

        <div className="card">
          <h3 className="section-title">Waste room · Dubai Municipality</h3>
          <div className="section-rule" />
          <dl className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <Stat label="Daily waste" value={`${fmt2(g.dailyWasteKg)} kg`} />
            <Stat label={`Storage (${g.storageDays} day${g.storageDays === 1 ? "" : "s"})`} value={`${fmt2(g.storageKg)} kg`} />
            <Stat label="Volume" value={`${fmt2(g.volumeRequiredM3)} m³`} />
            <Stat label="Containers" value={`${fmt0(g.containers)} × ${g.containerCapacityM3} m³`} />
            <Stat label="Room dims" value={`${fmt2(g.roomWidthM)} × ${fmt2(g.roomDepthM)} m`} />
            <Stat label="Room area" value={`${fmt2(g.roomAreaM2)} m²`} />
          </dl>
        </div>

        <div className="card">
          <h3 className="section-title">GFA efficiency</h3>
          <div className="section-rule" />
          <div className="grid gap-2 text-sm">
            <EffRow label="Residential interior (net of shafts)" value={p.efficiency.residentialNetGFA} pct={p.efficiency.residentialNetPct} />
            <EffRow label="Circulation (lobby, corridors, lifts)" value={p.efficiency.circulationGFA} pct={p.efficiency.circulationPct} />
            <EffRow label="Services / MEP" value={p.efficiency.servicesGFA} pct={p.efficiency.servicesPct} />
            <EffRow label="Amenities (GFA)" value={p.efficiency.amenitiesGFAarea} pct={p.efficiency.amenitiesPct} />
            <div className="border-t border-ink-200 mt-2 pt-3 flex justify-between font-medium text-ink-900">
              <span>Total GFA</span>
              <span className="tabular-nums">{fmt2(p.totalGFABuilding)} m²</span>
            </div>
            <div className="text-xs text-ink-500 mt-1">Balconies (non-GFA): {fmt2(p.efficiency.balconiesNonGFA)} m² · Amenities (non-GFA, open air): {fmt2(p.efficiency.amenitiesNonGFA)} m²</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Compliance summary</h3>
        <div className="section-rule" />
        <div className="grid sm:grid-cols-2 gap-3">
          {checks.map((c) => (
            <div key={c.key} className="flex items-start gap-3 p-4 border border-ink-200 bg-bone-50">
              <span className={`${TAG[c.status].cls} shrink-0`}>{TAG[c.status].text}</span>
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink-900">{c.label}</div>
                <div className="text-xs text-ink-500 mt-0.5">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
        {!project.targetGFA && !project.maxFAR && !project.maxHeightM && (
          <p className="text-xs text-ink-500 mt-3 print:hidden">
            Add the permitted GFA, max FAR or max height in Setup → Planning constraints to check them here.
          </p>
        )}
        {project.notes && (
          <div className="mt-5 text-sm whitespace-pre-wrap p-4 bg-bone-50 border border-ink-200">
            <div className="eyebrow mb-2">Notes</div>
            {project.notes}
          </div>
        )}
      </section>

      <p className="hidden print:block text-[10px] text-ink-500">
        Pre-concept feasibility figures generated with {BRAND.productName}. Verify against current Dubai Municipality,
        Dubai Civil Defence and RTA requirements before design or submission.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}
function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-ink-900";
  return (
    <div className="grid gap-0.5 content-start">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">{label}</span>
      <span className={`text-lg font-medium tabular-nums ${cls}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-500">{sub}</span>}
    </div>
  );
}
function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className={`text-right font-medium tabular-nums ${good === true ? "text-emerald-700" : good === false ? "text-red-700" : "text-ink-900"}`}>{value}</dd>
    </>
  );
}
function EffRow({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="flex justify-between gap-2 items-center">
      <span className="text-ink-600">{label}</span>
      <span className="text-ink-900 tabular-nums whitespace-nowrap">{fmt2(value)} m² · {fmtPct(pct)}</span>
    </div>
  );
}
