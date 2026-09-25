import { describe, it, expect } from "vitest";
import { parseCoordinates } from "./geo-parse";

describe("parseCoordinates", () => {
  it("reads plain pairs", () => {
    expect(parseCoordinates("25.1972, 55.2744")).toEqual({ lat: 25.1972, lng: 55.2744 });
    expect(parseCoordinates(" 25.1972 55.2744 ")).toEqual({ lat: 25.1972, lng: 55.2744 });
  });

  it("prefers the place pin of a Google Maps link over the map centre", () => {
    const url =
      "https://www.google.com/maps/place/Burj+Khalifa/@25.1971,55.2711,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f43348a67e24b:0xff45e502e1ceb7e2!8m2!3d25.197197!4d55.2743764";
    expect(parseCoordinates(url)).toEqual({ lat: 25.197197, lng: 55.2743764 });
    expect(parseCoordinates("https://www.google.com/maps/@25.0307,55.1873,16z")).toEqual({ lat: 25.0307, lng: 55.1873 });
    expect(parseCoordinates("https://maps.google.com/?q=25.0307,55.1873")).toEqual({ lat: 25.0307, lng: 55.1873 });
  });

  it("reads degrees, minutes and seconds", () => {
    const r = parseCoordinates(`25°11'50.0"N 55°16'28.0"E`)!;
    expect(r.lat).toBeCloseTo(25.197222, 5);
    expect(r.lng).toBeCloseTo(55.274444, 5);
  });

  it("rejects text and impossible values", () => {
    expect(parseCoordinates("Dubai Marina")).toBeNull();
    expect(parseCoordinates("125.2, 55.3")).toBeNull();
    expect(parseCoordinates("")).toBeNull();
  });
});
