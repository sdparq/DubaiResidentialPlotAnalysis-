import { describe, it, expect } from "vitest";
import { PRODUCTION_CITY_SAMPLE } from "../sample";
import { analyze } from "./index";

describe("Production City sample — parity vs the source Excel", () => {
  const r = analyze(PRODUCTION_CITY_SAMPLE);

  it("program totals match Excel", () => {
    expect(r.program.totalUnits).toBe(346);
    expect(r.program.totalInteriorGFA).toBeCloseTo(17754.73, 1);
    expect(r.program.totalBalcony).toBeCloseTo(4754, 0);
    expect(r.program.totalSellable).toBeCloseTo(22508.73, 1);
    expect(r.program.shaftsDeduction).toBe(173);
    expect(r.program.commonAreasGFA).toBeCloseTo(3832.43, 1);
    expect(r.program.totalGFABuilding).toBeCloseTo(21414.16, 1);
  });

  it("parking totals match Excel", () => {
    expect(r.parking.availableStandard).toBe(360);
    expect(r.parking.availablePRM).toBe(9);
    expect(r.parking.availableTotal).toBe(369);
    const studio1br2br = r.parking.requiredByCategory
      .filter((x) => ["Studio", "1BR", "2BR"].includes(x.category))
      .reduce((s, x) => s + x.required, 0);
    const br3 = r.parking.requiredByCategory.find((x) => x.category === "3BR");
    expect(studio1br2br).toBe(338);
    expect(br3?.required).toBe(16);
    expect(r.parking.requiredTotal).toBe(354);
    expect(r.parking.requiredPRM).toBe(8);
    expect(r.parking.balance).toBe(15);
  });

  it("lift demand and practical checks match Excel", () => {
    expect(r.lifts.totalPopulation).toBeCloseTo(682.5, 1);
    expect(r.lifts.demandStandard).toBe(35);
    expect(r.lifts.demandPremium).toBe(48);
    expect(r.lifts.personsPerTrip).toBe(13);
    expect(r.lifts.totalTravelHeight).toBeCloseTo(28.8, 1);
    expect(r.lifts.ruleOfThumbLifts).toBe(5);
    expect(r.lifts.dcdMinLifts).toBe(3);
    expect(r.lifts.liftsRecommended).toBe(5);
  });

  // The Excel used a √N shortcut for probable stops; the app applies the full CIBSE Guide D
  // round-trip equation instead. Values below were checked by hand:
  //   N = 8, P = 13, t_v = 3.6 / 1.75 = 2.057 s, t_s = 8 s, t_p = 1.2 s
  //   S = 8·(1 − (7/8)^13) = 6.590       H = 8 − Σ(i/8)^13 = 7.798
  //   RTT = 2·7.798·2.057 + 7.590·8 + 2·13·1.2 = 124.0 s
  it("lifts follow the CIBSE Guide D round-trip time", () => {
    expect(r.lifts.probableStops).toBeCloseTo(6.59, 2);
    expect(r.lifts.highestReversalFloor).toBeCloseTo(7.798, 2);
    expect(r.lifts.rttSeconds).toBeCloseTo(124.0, 1);
    expect(r.lifts.capacityPerLift).toBe(31);
    expect(r.lifts.liftsCIBSEStandard).toBe(2);
    expect(r.lifts.liftsCIBSEPremium).toBe(2);
    expect(r.lifts.liftsForInterval).toBe(3);
    expect(r.lifts.liftsCIBSE).toBe(3);
    expect(r.lifts.governing).toMatch(/Rule of thumb/);
    expect(r.lifts.intervalAchievedS).toBeCloseTo(24.8, 1);
  });

  it("garbage room (Dubai DM) matches Excel", () => {
    expect(r.garbage.dailyWasteKg).toBeCloseTo(2130.57, 2);
    expect(r.garbage.storageKg).toBeCloseTo(4261.14, 2);
    expect(r.garbage.volumeRequiredM3).toBeCloseTo(28.41, 2);
    expect(r.garbage.containers).toBe(12);
    expect(r.garbage.roomWidthM).toBeCloseTo(18.39, 2);
    expect(r.garbage.roomDepthM).toBeCloseTo(2.64, 2);
    expect(r.garbage.roomAreaM2).toBeCloseTo(48.55, 2);
  });
});
