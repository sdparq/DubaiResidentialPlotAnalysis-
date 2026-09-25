import type { Project, Typology } from "../types";
import { m2ToSqft } from "../units";
import { computeProgram } from "./program";

export interface TypologyRevenue {
  typology: Typology;
  units: number;
  sellablePerUnit: number;
  totalSellable: number;
  pricePerM2: number;
  pricePerUnit: number;
  totalRevenue: number;
  pctOfRevenue: number;
}

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  basis: string;
  pctOfTotalCost: number;
  pctOfRevenue: number;
}

export interface EconomicResult {
  currency: string;
  /** Revenue */
  perTypologyRevenue: TypologyRevenue[];
  residentialRevenue: number;
  parkingRevenue: number;
  retailRevenue: number;
  totalRevenue: number; // GDV
  /** Cost lines, in order */
  costs: CostLine[];
  totalCost: number; // TDC
  /** KPIs */
  profit: number;
  marginOnCost: number;
  marginOnGDV: number;
  /** Land as percentage of total cost */
  landSharePct: number;
  landCost: number;
  dldFee: number;
  /** Land price per sq ft of GFA — how plots are quoted in Dubai. */
  landCostPerSqftGFA: number;
  /** Profit target on GDV used for the residual land value. */
  targetMarginPct: number;
  /**
   * Residual land value: the most that can be paid for the land (before the DLD fee) while still
   * hitting the target margin on GDV. Negative when the scheme cannot carry any land cost.
   */
  residualLandValue: number;
  residualLandPerSqftGFA: number;
  /** Per-area metrics */
  avgPricePerM2Sellable: number;
  avgPricePerUnit: number;
  costPerM2GFA: number;
  costPerM2BUA: number;
  costPerM2Sellable: number;
  /** Reference figures */
  totalUnits: number;
  totalGFA: number;
  totalBUA: number;
  totalSellable: number;
}

export const ECONOMIC_DEFAULTS = {
  softCostsPct: 0.06,
  marketingPct: 0.04,
  permitsPct: 0.02,
  contingencyPct: 0.05,
  financingPct: 0.03,
  brokeragePct: 0.02,
  brandingFeePct: 0,
  dldFeePct: 0.04,
  targetMarginPct: 0.2,
};

export function computeEconomic(project: Project): EconomicResult {
  const program = computeProgram(project);
  const cfg = project.economic ?? {};
  const currency = cfg.currency ?? "AED";

  // ---- Revenue ----
  const pricing = cfg.typologyPricing ?? {};
  const residentialBeforePct: TypologyRevenue[] = program.byTypology
    .filter((ts) => ts.totalUnits > 0)
    .map((ts) => {
      const pricePerM2 = Number(pricing[ts.typology.id] ?? 0);
      const sellablePerUnit = ts.totalUnits > 0 ? ts.totalSellable / ts.totalUnits : 0;
      const pricePerUnit = sellablePerUnit * pricePerM2;
      const totalRevenue = ts.totalSellable * pricePerM2;
      return {
        typology: ts.typology,
        units: ts.totalUnits,
        sellablePerUnit,
        totalSellable: ts.totalSellable,
        pricePerM2,
        pricePerUnit,
        totalRevenue,
        pctOfRevenue: 0,
      };
    });
  const residentialRevenue = residentialBeforePct.reduce((s, r) => s + r.totalRevenue, 0);

  const parkingSpacesForSale = Math.max(0, cfg.parkingSpacesForSale ?? 0);
  const parkingPricePerSpace = Math.max(0, cfg.parkingPricePerSpace ?? 0);
  const parkingRevenue = parkingSpacesForSale * parkingPricePerSpace;

  const retailRevenue = Math.max(0, cfg.retailRevenue ?? 0);

  const totalRevenue = residentialRevenue + parkingRevenue + retailRevenue;

  // Now we can compute per-typology pct of revenue
  const perTypologyRevenue = residentialBeforePct.map((r) => ({
    ...r,
    pctOfRevenue: totalRevenue > 0 ? r.totalRevenue / totalRevenue : 0,
  }));

  // ---- Costs ----
  const landCost = Math.max(0, cfg.landCost ?? 0);
  const rate = Math.max(0, cfg.constructionRatePerBUA ?? 0);
  const constructionCost = program.totalBUABuilding * rate;

  const d = ECONOMIC_DEFAULTS;
  const softPct = cfg.softCostsPct ?? d.softCostsPct;
  const marketingPct = cfg.marketingPct ?? d.marketingPct;
  const permitsPct = cfg.permitsPct ?? d.permitsPct;
  const contingencyPct = cfg.contingencyPct ?? d.contingencyPct;
  const financingPct = cfg.financingPct ?? d.financingPct;
  const brokeragePct = cfg.brokeragePct ?? d.brokeragePct;
  const brandingFeePct = cfg.brandingFeePct ?? d.brandingFeePct;
  const dldFeePct = cfg.dldFeePct ?? d.dldFeePct;
  const targetMarginPct = cfg.targetMarginPct ?? d.targetMarginPct;

  const dldFee = landCost * dldFeePct;
  const softCosts = constructionCost * softPct;
  const permitsCost = constructionCost * permitsPct;
  const contingencyCost = (constructionCost + softCosts) * contingencyPct;
  const financingCost = constructionCost * financingPct;
  const marketingCost = totalRevenue * marketingPct;
  const brokerageCost = totalRevenue * brokeragePct;
  const brandingFee = totalRevenue * brandingFeePct;

  const nonLandCost =
    constructionCost +
    softCosts +
    permitsCost +
    contingencyCost +
    financingCost +
    marketingCost +
    brokerageCost +
    brandingFee;
  const totalCost = landCost + dldFee + nonLandCost;

  const pctLabel = (p: number) => `${(p * 100).toFixed(1)}%`;
  const lines: { key: string; label: string; amount: number; basis: string }[] = [
    { key: "land", label: "Land acquisition", amount: landCost, basis: "Direct input" },
    { key: "dld", label: "Land transfer fee (DLD)", amount: dldFee, basis: `${pctLabel(dldFeePct)} of land` },
    { key: "construction", label: "Construction", amount: constructionCost, basis: `BUA × ${Math.round(rate).toLocaleString("en-US")} ${currency}/m²` },
    { key: "soft", label: "Soft costs (design / consultants)", amount: softCosts, basis: `${pctLabel(softPct)} of construction` },
    { key: "permits", label: "Permits & authority fees", amount: permitsCost, basis: `${pctLabel(permitsPct)} of construction` },
    { key: "contingency", label: "Contingency", amount: contingencyCost, basis: `${pctLabel(contingencyPct)} of (construction + soft)` },
    { key: "financing", label: "Financing during construction", amount: financingCost, basis: `${pctLabel(financingPct)} of construction` },
    { key: "marketing", label: "Marketing & sales", amount: marketingCost, basis: `${pctLabel(marketingPct)} of GDV` },
    { key: "brokerage", label: "Brokerage / agency", amount: brokerageCost, basis: `${pctLabel(brokeragePct)} of GDV` },
  ];
  if (brandingFeePct > 0) {
    lines.push({ key: "branding", label: "Branding fee", amount: brandingFee, basis: `${pctLabel(brandingFeePct)} of GDV` });
  }
  const costs: CostLine[] = lines.map((l) => ({
    ...l,
    pctOfTotalCost: totalCost > 0 ? l.amount / totalCost : 0,
    pctOfRevenue: totalRevenue > 0 ? l.amount / totalRevenue : 0,
  }));

  const profit = totalRevenue - totalCost;
  const marginOnCost = totalCost > 0 ? profit / totalCost : 0;
  const marginOnGDV = totalRevenue > 0 ? profit / totalRevenue : 0;

  // Residual land value: solve  GDV − (L·(1 + dld) + nonLandCost) = target · GDV  for L.
  const residualLandValue =
    totalRevenue > 0 ? (totalRevenue * (1 - targetMarginPct) - nonLandCost) / (1 + dldFeePct) : 0;

  const totalSellable = program.totalSellable;
  const totalUnits = program.totalUnits;
  const gfaSqft = m2ToSqft(program.totalGFABuilding);
  const avgPricePerM2Sellable = totalSellable > 0 ? residentialRevenue / totalSellable : 0;
  const avgPricePerUnit = totalUnits > 0 ? residentialRevenue / totalUnits : 0;
  const costPerM2GFA = program.totalGFABuilding > 0 ? totalCost / program.totalGFABuilding : 0;
  const costPerM2BUA = program.totalBUABuilding > 0 ? totalCost / program.totalBUABuilding : 0;
  const costPerM2Sellable = totalSellable > 0 ? totalCost / totalSellable : 0;

  return {
    currency,
    perTypologyRevenue,
    residentialRevenue,
    parkingRevenue,
    retailRevenue,
    totalRevenue,
    costs,
    totalCost,
    profit,
    marginOnCost,
    marginOnGDV,
    landSharePct: totalCost > 0 ? landCost / totalCost : 0,
    landCost,
    dldFee,
    landCostPerSqftGFA: gfaSqft > 0 ? landCost / gfaSqft : 0,
    targetMarginPct,
    residualLandValue,
    residualLandPerSqftGFA: gfaSqft > 0 ? residualLandValue / gfaSqft : 0,
    avgPricePerM2Sellable,
    avgPricePerUnit,
    costPerM2GFA,
    costPerM2BUA,
    costPerM2Sellable,
    totalUnits,
    totalGFA: program.totalGFABuilding,
    totalBUA: program.totalBUABuilding,
    totalSellable,
  };
}
