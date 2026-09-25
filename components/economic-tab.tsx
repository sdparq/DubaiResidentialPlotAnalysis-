"use client";
import { useStore, useProject } from "@/lib/store";
import { computeEconomic, ECONOMIC_DEFAULTS } from "@/lib/calc/economic";
import { fmt0, fmt2, fmtMoney, fmtMoneyShort, fmtPct } from "@/lib/format";
import { m2ToSqft, perM2ToPerSqft, perSqftToPerM2 } from "@/lib/units";
import type { EconomicConfig } from "@/lib/types";
import NumInput from "./num-input";

const CURRENCIES = ["AED", "USD", "EUR", "SAR", "GBP"];

export default function EconomicTab() {
  const project = useProject();
  const patch = useStore((s) => s.patch);
  const r = computeEconomic(project);
  const cfg = project.economic ?? {};
  const currency = r.currency;
  const unit = cfg.priceUnit ?? "sqft";
  const unitLabel = unit === "sqft" ? "sq ft" : "m²";
  // Prices are stored per m²; show and edit them in the chosen unit.
  const toShown = (perM2: number) => (unit === "sqft" ? perM2ToPerSqft(perM2) : perM2);
  const fromShown = (v: number) => (unit === "sqft" ? perSqftToPerM2(v) : v);
  const areaShown = (m2: number) => (unit === "sqft" ? m2ToSqft(m2) : m2);

  function setCfg(p: Partial<EconomicConfig>) {
    patch({ economic: { ...cfg, ...p } });
  }
  function setTypologyPrice(typologyId: string, pricePerM2: number) {
    const next = { ...(cfg.typologyPricing ?? {}) };
    if (pricePerM2 > 0) next[typologyId] = pricePerM2;
    else delete next[typologyId];
    setCfg({ typologyPricing: next });
  }

  const hasRevenue = r.totalRevenue > 0;

  return (
    <div className="grid gap-6">
      {/* ---------- Top KPIs ---------- */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="GDV (revenue)" value={fmtMoneyShort(r.totalRevenue, currency)} sub={fmtMoney(r.totalRevenue, currency)} />
        <Kpi label="Total dev. cost" value={fmtMoneyShort(r.totalCost, currency)} sub={fmtMoney(r.totalCost, currency)} />
        <Kpi
          label="Profit"
          value={fmtMoneyShort(r.profit, currency)}
          sub={hasRevenue ? `${fmtPct(r.marginOnCost)} on cost` : "Enter sale prices below"}
          tone={r.profit > 0 ? "good" : r.profit < 0 ? "bad" : undefined}
        />
        <Kpi
          label="Margin on GDV"
          value={fmtPct(r.marginOnGDV)}
          sub={`target ${fmtPct(r.targetMarginPct, 0)}`}
          tone={!hasRevenue ? undefined : r.marginOnGDV >= r.targetMarginPct ? "good" : r.marginOnGDV < 0 ? "bad" : "warn"}
        />
        <Kpi
          label={`Residual land @ ${fmtPct(r.targetMarginPct, 0)}`}
          value={hasRevenue ? fmtMoneyShort(r.residualLandValue, currency) : "—"}
          sub={hasRevenue ? `${currency} ${fmt0(r.residualLandPerSqftGFA)} / sq ft GFA` : "Max land price for the target margin"}
          tone={!hasRevenue ? undefined : r.residualLandValue >= r.landCost ? "good" : "bad"}
        />
      </section>

      {/* ---------- Pricing per typology ---------- */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2 className="section-title">Sales pricing per typology</h2>
            <p className="section-sub">
              Asking price per {unitLabel} of sellable area (interior + balcony) for each typology. Unit price and revenue
              update live.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex border border-ink-200 bg-bone-50" role="group" aria-label="Price unit">
              {(["sqft", "sqm"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setCfg({ priceUnit: u })}
                  className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] transition-colors ${
                    unit === u ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-bone-200"
                  }`}
                >
                  {currency} / {u === "sqft" ? "sq ft" : "m²"}
                </button>
              ))}
            </div>
            <select className="cell-input !w-24" value={currency} onChange={(e) => setCfg({ currency: e.target.value })} aria-label="Currency">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {r.perTypologyRevenue.length === 0 ? (
          <div className="text-sm text-ink-500 italic py-6 text-center">
            No typologies with units yet. Fill the Typologies and Program tabs first.
          </div>
        ) : (
          <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "860px" }}>
            <table className="tbl w-full table-fixed">
              <colgroup>
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Typology</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Sellable / unit</th>
                  <th className="text-right">{currency} / {unitLabel}</th>
                  <th className="text-right">Price / unit</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">% GDV</th>
                </tr>
              </thead>
              <tbody>
                {r.perTypologyRevenue.map((row) => (
                  <tr key={row.typology.id}>
                    <td className="font-medium text-ink-900">
                      {row.typology.name}
                      <span className="text-ink-400 text-xs ml-2">{row.typology.category}</span>
                    </td>
                    <td className="text-right">{fmt0(row.units)}</td>
                    <td className="text-right tabular-nums">{fmt0(areaShown(row.sellablePerUnit))} {unitLabel}</td>
                    <td className="cell-edit">
                      <NumInput
                        className="cell-input text-right"
                        value={row.pricePerM2 > 0 ? Number(toShown(row.pricePerM2).toFixed(2)) : undefined}
                        min={0}
                        step={unit === "sqft" ? 25 : 250}
                        placeholder="0"
                        onChange={(v) => setTypologyPrice(row.typology.id, fromShown(v))}
                        onClear={() => setTypologyPrice(row.typology.id, 0)}
                        aria-label={`${row.typology.name} price per ${unitLabel}`}
                      />
                    </td>
                    <td className="text-right tabular-nums">{fmt0(row.pricePerUnit)}</td>
                    <td className="text-right tabular-nums">{fmt0(row.totalRevenue)}</td>
                    <td className="text-right text-ink-500 text-xs">{fmtPct(row.pctOfRevenue)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td colSpan={3} className="text-right uppercase tracking-[0.10em] text-[11px]">Residential subtotal</td>
                  <td className="text-right text-[11px] text-ink-500">avg {fmt0(toShown(r.avgPricePerM2Sellable))}</td>
                  <td className="text-right">{fmt0(r.avgPricePerUnit)}</td>
                  <td className="text-right">{fmt0(r.residentialRevenue)}</td>
                  <td className="text-right">{fmtPct(r.totalRevenue > 0 ? r.residentialRevenue / r.totalRevenue : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          <Field label="Parking spaces sold">
            <NumInput value={cfg.parkingSpacesForSale ?? 0} integer min={0} onChange={(v) => setCfg({ parkingSpacesForSale: v })} />
          </Field>
          <Field label={`Price per space (${currency})`}>
            <NumInput value={cfg.parkingPricePerSpace ?? 0} min={0} step={5000} onChange={(v) => setCfg({ parkingPricePerSpace: v })} />
          </Field>
          <Field label={`Retail / F&B revenue (${currency})`}>
            <NumInput value={cfg.retailRevenue ?? 0} min={0} step={100000} onChange={(v) => setCfg({ retailRevenue: v })} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Residential" value={fmtMoneyShort(r.residentialRevenue, currency)} />
          <Stat label="Parking" value={fmtMoneyShort(r.parkingRevenue, currency)} />
          <Stat label="Retail" value={fmtMoneyShort(r.retailRevenue, currency)} />
        </div>
      </div>

      {/* ---------- Costs inputs ---------- */}
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Costs</h2>
          <p className="section-sub">
            Land price and construction rate are direct inputs. The rest are percentages with typical defaults — adjust
            them to your market and procurement route.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Field
            label={`Land acquisition (${currency})`}
            hint={r.landCost > 0 && r.totalGFA > 0 ? `${currency} ${fmt0(r.landCostPerSqftGFA)} / sq ft GFA` : "Total price paid for the plot"}
          >
            <NumInput value={cfg.landCost ?? 0} min={0} step={500000} onChange={(v) => setCfg({ landCost: v })} />
          </Field>
          <Field label={`Construction rate (${currency} / ${unitLabel} BUA)`} hint="All-in: structure, MEP, finishes, parking, external works">
            <NumInput
              value={Number(toShown(cfg.constructionRatePerBUA ?? 0).toFixed(2))}
              min={0}
              step={unit === "sqft" ? 10 : 100}
              onChange={(v) => setCfg({ constructionRatePerBUA: fromShown(v) })}
            />
          </Field>
          <PctField label="Land transfer fee — DLD (% of land)" value={cfg.dldFeePct ?? ECONOMIC_DEFAULTS.dldFeePct} onChange={(v) => setCfg({ dldFeePct: v })} />
          <PctField label="Soft costs (% of construction)" value={cfg.softCostsPct ?? ECONOMIC_DEFAULTS.softCostsPct} onChange={(v) => setCfg({ softCostsPct: v })} />
          <PctField label="Permits & authority fees (% of construction)" value={cfg.permitsPct ?? ECONOMIC_DEFAULTS.permitsPct} onChange={(v) => setCfg({ permitsPct: v })} />
          <PctField label="Contingency (% of construction + soft)" value={cfg.contingencyPct ?? ECONOMIC_DEFAULTS.contingencyPct} onChange={(v) => setCfg({ contingencyPct: v })} />
          <PctField label="Financing (% of construction)" value={cfg.financingPct ?? ECONOMIC_DEFAULTS.financingPct} onChange={(v) => setCfg({ financingPct: v })} />
          <PctField label="Marketing & sales (% of GDV)" value={cfg.marketingPct ?? ECONOMIC_DEFAULTS.marketingPct} onChange={(v) => setCfg({ marketingPct: v })} />
          <PctField label="Brokerage / agency (% of GDV)" value={cfg.brokeragePct ?? ECONOMIC_DEFAULTS.brokeragePct} onChange={(v) => setCfg({ brokeragePct: v })} />
          <PctField label="Branding fee (% of GDV)" value={cfg.brandingFeePct ?? ECONOMIC_DEFAULTS.brandingFeePct} onChange={(v) => setCfg({ brandingFeePct: v })} />
          <PctField label="Target margin on GDV (for residual land)" value={cfg.targetMarginPct ?? ECONOMIC_DEFAULTS.targetMarginPct} onChange={(v) => setCfg({ targetMarginPct: v })} />
        </div>
      </div>

      {/* ---------- Cost breakdown ---------- */}
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Cost breakdown</h2>
        </div>
        <div className="tbl-scroll" style={{ ["--tbl-min" as string]: "680px" }}>
          <table className="tbl w-full table-fixed">
            <colgroup>
              <col />
              <col style={{ width: "30%" }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Line</th>
                <th>Basis</th>
                <th className="text-right">Amount ({currency})</th>
                <th className="text-right">% TDC</th>
                <th className="text-right">% GDV</th>
              </tr>
            </thead>
            <tbody>
              {r.costs.map((c) => (
                <tr key={c.key}>
                  <td className="font-medium text-ink-900">{c.label}</td>
                  <td className="text-ink-500 text-xs">
                    {c.key === "construction" ? `BUA × ${fmt0(toShown(cfg.constructionRatePerBUA ?? 0))} ${currency}/${unitLabel}` : c.basis}
                  </td>
                  <td className="text-right tabular-nums">{fmt0(c.amount)}</td>
                  <td className="text-right text-ink-700">{fmtPct(c.pctOfTotalCost)}</td>
                  <td className="text-right text-ink-500">{fmtPct(c.pctOfRevenue)}</td>
                </tr>
              ))}
              <tr className="row-total">
                <td colSpan={2} className="uppercase tracking-[0.10em] text-[11px]">Total development cost</td>
                <td className="text-right">{fmt0(r.totalCost)}</td>
                <td className="text-right">100%</td>
                <td className="text-right">{fmtPct(r.totalRevenue > 0 ? r.totalCost / r.totalRevenue : 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Bottom metrics ---------- */}
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Feasibility metrics</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Kpi label={`Avg price / ${unitLabel} sellable`} value={`${currency} ${fmt0(toShown(r.avgPricePerM2Sellable))}`} />
          <Kpi label="Avg price / unit" value={fmtMoney(r.avgPricePerUnit, currency)} />
          <Kpi label={`Break-even / ${unitLabel} sellable`} value={`${currency} ${fmt0(toShown(r.costPerM2Sellable))}`} sub="Total cost ÷ sellable area" />
          <Kpi label={`Cost / ${unitLabel} BUA`} value={`${currency} ${fmt0(toShown(r.costPerM2BUA))}`} sub="All-in, incl. land" />
          <Kpi label="Land / sq ft GFA" value={`${currency} ${fmt0(r.landCostPerSqftGFA)}`} sub={`${fmtPct(r.landSharePct)} of total cost`} />
          <Kpi label={`Cost / ${unitLabel} GFA`} value={`${currency} ${fmt0(toShown(r.costPerM2GFA))}`} />
          <Kpi label="Sellable / GFA" value={fmtPct(r.totalGFA > 0 ? r.totalSellable / r.totalGFA : 0)} sub="Balconies are sold but not GFA" />
          <Kpi label="Sellable / BUA" value={fmtPct(r.totalBUA > 0 ? r.totalSellable / r.totalBUA : 0)} sub={`${fmt2(areaShown(r.totalSellable))} ${unitLabel} sellable`} />
        </div>
      </div>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-ink-900";
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${cls}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[10.5px] uppercase tracking-[0.10em] text-ink-500">{label}</span>
      <span className="font-medium tabular-nums text-ink-900">{value}</span>
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

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <NumInput value={Number((value * 100).toFixed(2))} min={0} max={100} step={0.25} suffix="%" onChange={(v) => onChange(v / 100)} />
    </Field>
  );
}
