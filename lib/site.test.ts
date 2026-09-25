import { describe, it, expect } from "vitest";
import { PRODUCTION_CITY_SAMPLE } from "./sample";
import { computeProgram } from "./calc/program";
import { deriveMassing, deriveSite, groundFootprintArea, volumesToGeoFrame } from "./site";
import { dayOfYearFromISODate, sunDirection, uaeClockToSolarHour } from "./building-physics";
import { buildMassing, type Volume } from "./massing";
import { polygonBBox } from "./geom";

describe("site geometry", () => {
  it("derives the sample plot and buildable area from frontage, depth and setbacks", () => {
    const site = deriveSite(PRODUCTION_CITY_SAMPLE);
    expect(site.plotArea).toBeCloseTo(80 * 84.55, 6);
    // 80 − 2·3 wide, 84.55 − 6 − 3 deep
    expect(site.buildableArea).toBeCloseTo(74 * 75.55, 6);
  });

  it("builds the massing that matches the program GFA", () => {
    const site = deriveSite(PRODUCTION_CITY_SAMPLE);
    const gfa = computeProgram(PRODUCTION_CITY_SAMPLE).totalGFABuilding;
    const { massing, effFloors } = deriveMassing(PRODUCTION_CITY_SAMPLE, site, gfa);
    expect(effFloors).toBe(8);
    expect(massing.totalGFA).toBeCloseTo(gfa, 0);
  });

  it("counts every tower and subtracts courtyards in the ground footprint", () => {
    const sq = (x: number, y: number, s: number) => [
      { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
    ];
    const volumes: Volume[] = [
      { polygon: sq(0, 0, 10), fromY: 0, toY: 30 },
      { polygon: sq(20, 0, 10), fromY: 0, toY: 30 },
      { polygon: sq(40, 0, 10), hole: sq(43, 3, 4), fromY: 0, toY: 12 },
      { polygon: sq(0, 0, 5), fromY: 30, toY: 40 },
    ];
    expect(groundFootprintArea(volumes)).toBeCloseTo(100 + 100 + (100 - 16), 9);
  });

  it("rotates plot-local volumes into east/north like the 3D context scene", () => {
    const v: Volume[] = [{ polygon: [{ x: 0, y: 10 }], fromY: 0, toY: 3 }];
    // Plot +Y pointing east (heading 90°): a point 10 m along +Y lies 10 m east.
    const [east] = volumesToGeoFrame(v, 90);
    expect(east.polygon[0].x).toBeCloseTo(10, 9);
    expect(east.polygon[0].y).toBeCloseTo(0, 9);
    // Offsets: +X moves east, +Z moves south.
    const [moved] = volumesToGeoFrame(v, 0, 5, 7);
    expect(moved.polygon[0]).toEqual({ x: 5, y: 3 });
  });
});

describe("solar time in the UAE", () => {
  it("puts solar noon in Dubai a little after 12:00 on the clock", () => {
    const day = dayOfYearFromISODate("2025-06-21");
    expect(day).toBe(172);
    const solarAtClockNoon = uaeClockToSolarHour(12, 55.27, day);
    // Longitude correction ≈ −19 min, equation of time on 21 June ≈ −1.5 min.
    expect(solarAtClockNoon).toBeGreaterThan(11.6);
    expect(solarAtClockNoon).toBeLessThan(11.75);
  });

  it("has the sun almost overhead at solar noon in June", () => {
    const dir = sunDirection(25.2, 172, 12)!;
    const elevationDeg = (Math.asin(dir.y) * 180) / Math.PI;
    expect(elevationDeg).toBeGreaterThan(87);
  });
});

describe("twin towers", () => {
  it("keeps the two towers apart by at least the clear gap", () => {
    const site = deriveSite(PRODUCTION_CITY_SAMPLE);
    const gfa = computeProgram(PRODUCTION_CITY_SAMPLE).totalGFABuilding;
    const { inputs } = deriveMassing({ ...PRODUCTION_CITY_SAMPLE, massingShape: "twinTowers", twinSeparation: 12, twinCoverage: 0.3 }, site, gfa);
    const m = buildMassing(inputs);
    expect(m.volumes).toHaveLength(2);
    const [a, b] = m.volumes.map((v) => polygonBBox(v.polygon)).sort((p, q) => p.minX - q.minX);
    expect(b.minX - a.maxX).toBeGreaterThanOrEqual(12 - 1e-6);
    // Each tower stays inside the buildable area.
    const bb = polygonBBox(site.buildable);
    expect(a.minX).toBeGreaterThanOrEqual(bb.minX - 1e-6);
    expect(b.maxX).toBeLessThanOrEqual(bb.maxX + 1e-6);
  });
});
