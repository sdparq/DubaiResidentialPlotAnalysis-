import { describe, it, expect } from "vitest";
import { PRODUCTION_CITY_SAMPLE, emptyProject } from "../sample";
import type { Project } from "../types";
import { analyze, computeEconomic, computeLifts, computeParking } from "./index";
import { computeChecks } from "./compliance";

const withSample = (patch: Partial<Project>): Project => ({ ...PRODUCTION_CITY_SAMPLE, ...patch });

describe("economics", () => {
  const priced = withSample({
    economic: {
      typologyPricing: Object.fromEntries(PRODUCTION_CITY_SAMPLE.typologies.map((t) => [t.id, 10_000])),
      landCost: 30_000_000,
      constructionRatePerBUA: 4_000,
    },
  });
  const r = computeEconomic(priced);

  it("adds the DLD land transfer fee (4 % by default) to the cost", () => {
    expect(r.dldFee).toBeCloseTo(1_200_000, 2);
    expect(r.costs.find((c) => c.key === "dld")?.amount).toBeCloseTo(1_200_000, 2);
    expect(r.totalCost).toBeCloseTo(167_244_314.32, 1);
  });

  it("residual land value hits the target margin exactly", () => {
    expect(r.targetMarginPct).toBe(0.2);
    expect(r.residualLandValue).toBeCloseTo(42_332_236.23, 1);
    const atRlv = computeEconomic({ ...priced, economic: { ...priced.economic, landCost: r.residualLandValue } });
    expect(atRlv.marginOnGDV).toBeCloseTo(0.2, 9);
  });

  it("quotes land per sq ft of GFA", () => {
    const gfaSqft = r.totalGFA * 10.763910417;
    expect(r.landCostPerSqftGFA).toBeCloseTo(30_000_000 / gfaSqft, 6);
  });

  it("returns zeros instead of NaN for an empty project", () => {
    const e = computeEconomic(emptyProject());
    expect(e.totalRevenue).toBe(0);
    expect(e.residualLandValue).toBe(0);
    expect(Number.isFinite(e.marginOnGDV)).toBe(true);
  });
});

describe("parking", () => {
  it("respects an explicit 0 % PRM ratio", () => {
    expect(computeParking(withSample({ prmPercent: 0 })).requiredPRM).toBe(0);
  });

  it("rounds other-use requirements up to whole spaces", () => {
    const r = computeParking(withSample({ otherUses: [{ id: "r", name: "Retail", netArea: 250, spacesPer100sqm: 3 }] }));
    expect(r.otherUsesRequired[0].required).toBe(8); // 7.5 → 8
    expect(r.grandRequired).toBe(354 + 8);
  });

  it("rounds a fractional residential total up", () => {
    const p = withSample({
      typologies: PRODUCTION_CITY_SAMPLE.typologies.map((t) => (t.id === "3br-a" ? { ...t, parkingPerUnit: 1.5 } : t)),
      program: [{ floor: 1, typologyId: "3br-a", count: 3 }],
    });
    expect(computeParking(p).requiredTotal).toBe(5); // 4.5 → 5
  });
});

describe("lifts", () => {
  it("handles a single residential floor", () => {
    const p = withSample({ numFloors: 1, program: [{ floor: 1, typologyId: "studio-a", count: 20 }] });
    const l = computeLifts(p);
    expect(l.probableStops).toBeCloseTo(1, 9);
    expect(l.highestReversalFloor).toBeCloseTo(1, 9);
    // RTT = 2·1·(3.6/1.75) + 2·8 + 2·13·1.2
    expect(l.rttSeconds).toBeCloseTo(2 * (3.6 / 1.75) + 16 + 31.2, 6);
  });

  it("recommends nothing when there are no units", () => {
    const l = computeLifts(emptyProject());
    expect(l.liftsRecommended).toBe(0);
    expect(l.governing).toMatch(/No units/);
  });

  it("sizes on the interval when it governs", () => {
    const p = withSample({ lifts: { ...PRODUCTION_CITY_SAMPLE.lifts, unitsPerLiftRule: 1000, dcdMinLifts: 0, targetIntervalS: 30 } });
    const l = computeLifts(p);
    expect(l.liftsForInterval).toBe(Math.ceil(l.rttSeconds / 30));
    expect(l.liftsRecommended).toBe(l.liftsForInterval);
    expect(l.governing).toMatch(/interval/);
  });
});

describe("compliance checks", () => {
  it("only shows planning checks once limits are set", () => {
    const keys = computeChecks(PRODUCTION_CITY_SAMPLE, analyze(PRODUCTION_CITY_SAMPLE)).map((c) => c.key);
    expect(keys).not.toContain("gfa");
    expect(keys).toContain("parking");
  });

  it("flags GFA, FAR and height breaches", () => {
    const p = withSample({ targetGFA: 20_000, maxFAR: 3, maxHeightM: 25 });
    const checks = computeChecks(p, analyze(p));
    const status = (k: string) => checks.find((c) => c.key === k)?.status;
    expect(status("gfa")).toBe("fail"); // 21,414 > 20,000
    expect(status("far")).toBe("fail"); // 3.17 > 3
    expect(status("height")).toBe("fail"); // 28.8 > 25
    expect(status("lifts")).toBe("ok");
  });
});
