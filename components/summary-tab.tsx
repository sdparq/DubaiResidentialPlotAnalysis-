"use client";
import { useMemo } from "react";
import { useProject } from "@/lib/store";
import { computeAreas } from "@/lib/calc/areas";
import { computeProgram } from "@/lib/calc/program";
import { type GfaUseCategory } from "@/lib/types";
import { StatTile } from "./ui/stat-tile";

const M2_TO_SQFT = 10.7639;
function fmtSqft(m2: number): string {
  if (!Number.isFinite(m2) || m2 === 0) return "—";
  return `${Math.round(m2 * M2_TO_SQFT).toLocaleString("en-US")} sqft`;
}
function fmtM2(m2: number): string {
  if (!Number.isFinite(m2) || m2 === 0) return "—";
  return `${Math.round(m2).toLocaleString("en-US")} m²`;
}
function fmt0(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Hospitality is NOT listed here: it rolls into the Residential GFA target
// (see residentialGFATarget) and would double-count as a separate use.
const OTHER_USES: { key: GfaUseCategory; label: string }[] = [
  { key: "retail", label: "Retail" },
  { key: "commercial", label: "Commercial / Office" },
];

export default function SummaryTab() {
  const project = useProject();

  const a = useMemo(() => computeAreas(project), [project]);
  const program = useMemo(() => computeProgram(project), [project]);

  const target = a.targetGFA;
  const residentialGfaTotal = a.residentialGFA;
  const hospitalityM2 = a.hospitalityGFA;
  const retailM2 = a.retailGFA;
  const totalGFA = a.totalGFA;
  const aptPct = a.apartmentsPct;
  const aptInteriorBUA = a.apartmentsInterior;
  const balconyShare = a.balconyShare;
  const balconiesBUA = a.balconies;
  const gsaTotal = a.gsaTotal;
  const constructionBUA = a.constructionBUA;

  function useFormula(key: GfaUseCategory): string {
    const item = project.gfaBreakdown?.[key];
    if (!item) return "";
    return item.mode === "absolute"
      ? "entered in Setup (absolute m²)"
      : `${item.value}% × Target GFA ${fmt0(target)} m²`;
  }
  const otherUses = OTHER_USES.map((u) => ({
    ...u,
    gfa: u.key === "retail" ? a.retailGFA : a.commercialGFA,
    formula: useFormula(u.key),
  })).filter((u) => u.gfa > 0);

  const gfaOverTarget = target > 0 && totalGFA > target + 1;

  // ── Efficiency ratios ───────────────────────────────────────────────────
  const ratios = [
    {
      label: "GSA / GFA",
      num: gsaTotal,
      den: totalGFA,
      numLabel: "GSA",
      denLabel: "GFA",
      hint: "Sellable share of the gross floor area — how much of the FAR-counted area you can sell.",
    },
    {
      label: "GFA / BUA",
      num: totalGFA,
      den: constructionBUA,
      numLabel: "GFA",
      denLabel: "BUA",
      hint: "FAR-counted share of everything you build — the rest (basements, services, balconies...) costs money but consumes no GFA.",
    },
    {
      label: "GSA / BUA",
      num: gsaTotal,
      den: constructionBUA,
      numLabel: "GSA",
      denLabel: "BUA",
      hint: "Sellable share of everything you build — the headline construction efficiency of the scheme.",
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="section-title">Areas summary</h2>
            <p className="section-sub">
              Live-computed from Setup → GFA breakdown, Distribution, the Apartments matrix and
              Parking. Every headline number shows how it is built below.
            </p>
          </div>
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Target GFA" value={target > 0 ? fmtM2(target) : "—"} sub={fmtSqft(target)} />
          <Stat
            label="Σ GFA total"
            value={fmtM2(totalGFA)}
            sub={fmtSqft(totalGFA)}
            good={target > 0 && Math.abs(totalGFA - target) < 1}
            bad={gfaOverTarget}
          />
          <Stat
            label="Σ BUA total (construction)"
            value={fmtM2(constructionBUA)}
            sub={fmtSqft(constructionBUA)}
          />
          <Stat
            label="GSA total (sellable)"
            value={fmtM2(gsaTotal)}
            sub={fmtSqft(gsaTotal)}
          />
        </div>

        <AreaBars
          rows={[
            { key: "bua", label: "BUA · built", value: constructionBUA },
            { key: "gfa", label: "GFA · FAR-counted", value: totalGFA },
            { key: "gsa", label: "GSA · sellable", value: gsaTotal },
          ]}
        />

        {/* Warnings */}
        {gfaOverTarget && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 mb-4 leading-snug">
            Σ GFA = {fmtM2(totalGFA)} exceeds the Target GFA of {fmtM2(target)} by{" "}
            <strong>{fmtM2(totalGFA - target)}</strong>. Reduce a use allocation or rebalance
            in <em>Setup → GFA breakdown</em>.
          </p>
        )}

        {/* GFA derivation */}
        <DerivBlock title="GFA total — how it's built">
          <DerivRow
            label={hospitalityM2 > 0 ? "Residential GFA (incl. Hospitality)" : "Residential GFA"}
            formula={
              (project.gfaBreakdown?.residential
                ? project.gfaBreakdown.residential.mode === "absolute"
                  ? "entered in Setup (absolute m²)"
                  : `${project.gfaBreakdown.residential.value}% × Target GFA ${fmt0(target)} m²`
                : "not set in Setup") +
              (hospitalityM2 > 0
                ? ` + Hospitality ${fmt0(hospitalityM2)} m² (treated as residential)`
                : "")
            }
            m2={residentialGfaTotal}
          />
          {otherUses.map((u) => (
            <DerivRow key={u.key} label={`${u.label} GFA`} formula={u.formula} m2={u.gfa} />
          ))}
          <DerivRow
            label="Σ GFA total"
            formula={
              target > 0
                ? `vs Target GFA ${fmt0(target)} m² (${totalGFA > target + 1 ? "+" : ""}${fmt0(totalGFA - target)} m²)`
                : "no Target GFA set"
            }
            m2={totalGFA}
            total
          />
        </DerivBlock>

        {/* GSA derivation */}
        <DerivBlock title="GSA total (sellable) — how it's built">
          <DerivRow
            label="Apartments interior"
            formula={
              a.usesMatrix
                ? `Σ of the ${fmt0(a.matrixUnits)} units placed in the Apartments matrix`
                : `Residential GFA ${fmt0(residentialGfaTotal)} m² × ${aptPct.toFixed(1)}% apartments (matrix empty)`
            }
            m2={aptInteriorBUA}
          />
          <DerivRow
            label="Balconies"
            formula={
              a.usesMatrix
                ? `Σ of the placed units' balconies — ${(balconyShare * 100).toFixed(1)}% of interior`
                : "0 — fill the Apartments matrix to measure the balconies"
            }
            m2={balconiesBUA}
          />
          {retailM2 > 0 && (
            <DerivRow
              label="Retail (sellable)"
              formula="Retail GFA from Setup — leasable/sellable stock"
              m2={retailM2}
            />
          )}
          <DerivRow
            label="GSA total"
            formula={retailM2 > 0 ? "apartments interior + balconies + retail" : "apartments interior + balconies"}
            m2={gsaTotal}
            total
          />
          {a.balconyGfaFactor > 0 && a.usesMatrix && (
            <p className="text-[12px] text-ink-500 px-3 py-2 leading-snug border-t border-ink-100">
              Balconies in GFA: {Math.round(a.balconyGfaFactor * 100)} % (Typologies). The apartments
              consume {fmt0(a.apartmentsGFA)} m² of GFA = {fmt0(a.apartmentsInterior)} m² interior +{" "}
              {fmt0(a.balconiesGFA)} m² of balconies; the sellable figures above take the whole balcony.
            </p>
          )}
          {a.usesMatrix && a.apartmentsQuota <= 0 && (
            <p className="text-[12px] text-amber-800 bg-amber-50/60 px-3 py-2 leading-snug border-t border-ink-100">
              The matrix holds {fmt0(a.matrixUnits)} units ({fmt0(a.apartmentsGFA)} m² of GFA) but there is no
              Apartments GFA target yet — set Target GFA and the Residential use in <em>Setup → GFA breakdown</em>{" "}
              to check the matrix against it.
            </p>
          )}
          {a.usesMatrix && a.apartmentsQuota > 0 && Math.abs(a.apartmentsDrift) > Math.max(1, a.apartmentsQuota * 0.01) && (
            <p className="text-[12px] text-amber-800 bg-amber-50/60 px-3 py-2 leading-snug border-t border-ink-100">
              The matrix consumes {fmt0(a.apartmentsGFA)} m² of GFA
              {a.balconyGfaFactor > 0 ? ` (interior + ${Math.round(a.balconyGfaFactor * 100)} % of balconies)` : " (interior)"} against the{" "}
              {fmt0(a.apartmentsQuota)} m² Apartments GFA target from Distribution —{" "}
              <strong>
                {a.apartmentsDrift > 0 ? "+" : ""}{fmt0(a.apartmentsDrift)} m² (
                {((a.apartmentsDrift / a.apartmentsQuota) * 100).toFixed(1)}%)
              </strong>
              . These figures follow the matrix (what you actually have). Run{" "}
              <em>Apartments → Apply to N floors</em> to realign it with the target.
            </p>
          )}
          {a.usesMatrix && a.apartmentsQuota > 0 && Math.abs(a.apartmentsDrift) <= Math.max(1, a.apartmentsQuota * 0.01) && (
            <p className="text-[12px] text-ink-500 px-3 py-2 leading-snug border-t border-ink-100">
              Matches the Apartments tab: {fmt0(a.matrixUnits)} units ={" "}
              {fmt0(program.totalSellable)} m² sellable. Apartments GFA target from Distribution:{" "}
              {fmt0(a.apartmentsQuota)} m².
            </p>
          )}
        </DerivBlock>

        {/* BUA total */}
        <DerivBlock title="BUA total (construction)">
          <DerivRow
            label="Σ BUA total (construction)"
            formula={
              "residential sellable " +
              fmt0(a.gsaResidential) +
              (a.retailGFA > 0 ? " + retail " + fmt0(a.retailGFA) : "") +
              (a.commercialGFA > 0 ? " + commercial " + fmt0(a.commercialGFA) : "") +
              " + amenities " + fmt0(a.amenities) +
              " + circulation " + fmt0(a.circulation) +
              " + services " + fmt0(a.services) +
              " + ground/podium parking " + fmt0(a.groundPodiumParking) +
              " + basements " + fmt0(a.basementsNet) +
              (a.parkingSurplus > 0
                ? " (" + fmt0(a.basementSurface) + " built − " + fmt0(a.parkingSurplus) + " surplus parking)"
                : "") +
              " m²"
            }
            m2={constructionBUA}
            total
          />
        </DerivBlock>
      </div>

      {/* Efficiency ratios */}
      <div className="card">
        <div className="mb-4">
          <h2 className="section-title">Efficiency ratios</h2>
          <p className="section-sub">
            Computed from the three totals above — GSA {fmtM2(gsaTotal)}, GFA {fmtM2(totalGFA)},
            BUA {fmtM2(constructionBUA)}.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ratios.map((r) => {
            const ok = r.num > 0 && r.den > 0;
            return (
              <div key={r.label} className="rounded-xl ring-1 ring-inset ring-ink-200/80 bg-white p-4">
                <div className="text-[12.5px] font-semibold text-ink-600">{r.label}</div>
                <div className="text-[30px] font-semibold tracking-tight mt-1 text-ink-900">
                  {ok ? `${((r.num / r.den) * 100).toFixed(1)}%` : "—"}
                </div>
                {ok && (
                  <div className="mt-2 h-1.5 rounded-full bg-brand-100 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (r.num / r.den) * 100)}%` }} />
                  </div>
                )}
                <div className="text-[12px] text-ink-500 mt-2 tabular-nums">
                  {ok
                    ? `${r.numLabel} ${fmt0(r.num)} m² ÷ ${r.denLabel} ${fmt0(r.den)} m²`
                    : "needs both totals above"}
                </div>
                <p className="text-[12px] text-ink-400 mt-2 leading-snug">{r.hint}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DerivBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel mb-4" style={{ minWidth: 640 }}>
      <div className="px-3 py-2.5 bg-bone-50 border-b border-ink-200/80 text-[12.5px] text-ink-800 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Magnitude comparison of the three totals — one series, one hue, values at the bar ends. */
function AreaBars({ rows }: { rows: { key: string; label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (max <= 0) return null;
  return (
    <div className="grid gap-2.5 mb-6" role="img" aria-label={rows.map((r) => `${r.label} ${fmt0(r.value)} m²`).join(", ")}>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[130px_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1fr)] items-center gap-3">
          <div className="text-[12.5px] text-ink-600 font-medium truncate">{r.label}</div>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-5 rounded-r-[4px] bg-brand-500 transition-[width] duration-500"
              style={{ width: `${Math.max(1, (r.value / max) * 82)}%` }}
              title={`${r.label}: ${fmt0(r.value)} m²`}
            />
            <span className="text-[12.5px] font-semibold text-ink-900 whitespace-nowrap tabular-nums">
              {r.value > 0 ? `${fmt0(r.value)} m²` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DerivRow({
  label, formula, m2, note, total,
}: { label: string; formula: string; m2: number; note?: string; total?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[190px_minmax(0,1fr)_110px_110px] gap-2 px-3 py-2 items-baseline border-t first:border-t-0 ${
        total ? "bg-brand-50/70 border-brand-200 font-semibold text-brand-800" : "border-ink-100"
      }`}
    >
      <div className={`text-[13px] ${total ? "" : "text-ink-900 font-medium"}`}>{label}</div>
      <div className="text-[12px] text-ink-500 leading-snug">
        {formula}
        {note && <span className="block text-ink-400">{note}</span>}
      </div>
      <div className="text-right text-[13px] tabular-nums">{m2 > 0 ? `${fmt0(m2)} m²` : "—"}</div>
      <div className="text-right text-[12px] tabular-nums text-ink-500">
        {m2 > 0 ? `${fmt0(m2 * M2_TO_SQFT)} sqft` : "—"}
      </div>
    </div>
  );
}

function Stat({
  label, value, sub, good, bad,
}: { label: string; value: string; sub?: string; good?: boolean; bad?: boolean }) {
  return <StatTile label={label} value={value} sub={sub} tone={bad ? "bad" : good ? "ok" : null} />;
}
