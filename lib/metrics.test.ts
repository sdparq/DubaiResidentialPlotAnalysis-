import { describe, expect, it } from "vitest";
import { DEMO_SAMPLE, emptyProject } from "./sample";
import { compact, heightCode, projectMetrics } from "./metrics";
import { stepStatuses } from "./workflow";
import { computeTowerYield } from "./calc/tower-yield";
import { computeAreas } from "./calc/areas";

describe("heightCode", () => {
  it("writes the Dubai storey notation", () => {
    expect(heightCode(2, 1, 3, 35)).toBe("2B+G+3P+35");
    expect(heightCode(0, 1, 0, 8)).toBe("G+8");
    expect(heightCode(1, 2, 0, 0)).toBe("1B+2G");
  });
});

describe("compact", () => {
  it("keeps small numbers exact and shortens big ones", () => {
    expect(compact(1284)).toBe("1,284");
    expect(compact(38400)).toBe("38,400");
    expect(compact(125_400)).toBe("125K");
    expect(compact(4_200_000)).toBe("4.20M");
  });
});

describe("demo sample", () => {
  const m = projectMetrics(DEMO_SAMPLE);

  it("is fully worked through: GFA on target, FAR 12", () => {
    expect(m.totalGFA).toBeCloseTo(38400, 0);
    expect(m.gfaOfTarget).toBeCloseTo(1, 5);
    expect(m.far).toBeCloseTo(12, 5);
  });

  it("stores the tower floor count Distribution derives", () => {
    expect(DEMO_SAMPLE.typeFloors?.count).toBe(computeTowerYield(DEMO_SAMPLE).towerFloors);
    expect(DEMO_SAMPLE.numFloors).toBe(DEMO_SAMPLE.typeFloors?.count);
    expect(m.heightCode).toBe("2B+G+3P+35");
  });

  it("places units that match the apartments GFA quota", () => {
    const a = computeAreas(DEMO_SAMPLE);
    expect(m.units).toBe(415);
    expect(Math.abs(a.apartmentsDrift) / a.apartmentsQuota).toBeLessThan(0.005);
  });

  it("provides enough parking", () => {
    expect(m.parkingProvided).toBeGreaterThanOrEqual(m.parkingRequired);
    expect(m.efficiency).toBeGreaterThan(0.6);
    expect(m.efficiency).toBeLessThan(0.8);
  });

  it("shows every trackable step as done", () => {
    const s = stepStatuses(DEMO_SAMPLE, m);
    expect(Object.values(s).filter((v) => v !== null && v !== "done")).toEqual([]);
  });
});

describe("empty project", () => {
  it("has no misleading figures", () => {
    const p = emptyProject();
    const m = projectMetrics(p);
    expect(m.far).toBeNull();
    expect(m.efficiency).toBeNull();
    expect(m.gfaOfTarget).toBeNull();
    const s = stepStatuses(p, m);
    expect(s.plot).toBe("todo");
    expect(s.massing).toBeNull();
  });
});
