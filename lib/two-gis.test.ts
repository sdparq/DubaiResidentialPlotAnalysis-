import { describe, expect, it } from "vitest";
import { cityCamera, lngLatToMapPoint, mapPointsPerMetre } from "./two-gis";

describe("2GIS map placement", () => {
  it("puts the origin at 0,0 and keeps east/north positive", () => {
    expect(lngLatToMapPoint(0, 0)).toEqual([0, 0]);
    const [x, y] = lngLatToMapPoint(55.264, 25.1865);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it("measures metres consistently with the projection", () => {
    // Web Mercator works on a sphere of radius 6378137 m — the space 2GIS draws
    // its own buildings in — so 0.001° is 111.32 m north-south and
    // 111.32·cos(lat) m east-west, whatever the latitude.
    const lat = 25.1865;
    const [, y0] = lngLatToMapPoint(55.264, lat);
    const [, y1] = lngLatToMapPoint(55.264, lat + 0.001);
    expect((y1 - y0) / mapPointsPerMetre(lat + 0.0005)).toBeCloseTo(111.32, 1);
    const [x0] = lngLatToMapPoint(55.264, lat);
    const [x1] = lngLatToMapPoint(55.265, lat);
    expect((x1 - x0) / mapPointsPerMetre(lat)).toBeCloseTo(111.32 * Math.cos((lat * Math.PI) / 180), 1);
  });

  it("frames taller towers from further out", () => {
    expect(cityCamera(0, 40).zoom).toBeGreaterThan(cityCamera(0, 300).zoom);
    expect(cityCamera(0, 150).rotation).toBe(38);
    expect(cityCamera(170, 150).rotation).toBe(-152);
  });
});
