import { describe, it, expect } from "vitest";
import { PRODUCTION_CITY_SAMPLE } from "./sample";
import { makeBackup, normalizeProject, parseImport, safeFileName } from "./project-io";

describe("project import", () => {
  it("rejects JSON that is not a project", () => {
    expect(parseImport(null)).toEqual([]);
    expect(parseImport([1, 2, 3])).toEqual([]);
    expect(parseImport({ hello: "world" })).toEqual([]);
  });

  it("gives imported projects a fresh id and keeps their data", () => {
    const [p] = parseImport(JSON.parse(JSON.stringify(PRODUCTION_CITY_SAMPLE)));
    expect(p.id).not.toBe(PRODUCTION_CITY_SAMPLE.id);
    expect(p.typologies).toHaveLength(PRODUCTION_CITY_SAMPLE.typologies.length);
    expect(p.program).toHaveLength(PRODUCTION_CITY_SAMPLE.program.filter((c) => c.count > 0).length);
    expect(p.plotArea).toBe(PRODUCTION_CITY_SAMPLE.plotArea);
  });

  it("fills missing fields from a blank project, never from the sample", () => {
    const p = normalizeProject({ name: "Partial", plotArea: 1000 })!;
    expect(p.name).toBe("Partial");
    expect(p.typologies).toEqual([]);
    expect(p.commonAreas).toEqual([]);
    expect(p.numFloors).toBe(1);
    expect(p.lifts.cabinKg).toBe(1275);
  });

  it("drops malformed rows and coerces bad numbers", () => {
    const p = normalizeProject({
      name: "Messy",
      numFloors: "8",
      typologies: [{ id: "a", name: "A", internalArea: "x" }, "junk", { name: "no id" }],
      program: [{ floor: 1, typologyId: "a", count: 2.6 }, { floor: 0, typologyId: "a", count: 1 }, { floor: 2 }],
    })!;
    expect(p.numFloors).toBe(1);
    expect(p.typologies).toHaveLength(1);
    expect(p.typologies[0].internalArea).toBe(0);
    expect(p.program).toEqual([{ floor: 1, typologyId: "a", count: 3 }]);
  });

  it("reads a full backup", () => {
    const backup = JSON.parse(JSON.stringify(makeBackup([PRODUCTION_CITY_SAMPLE, { ...PRODUCTION_CITY_SAMPLE, name: "Second" }])));
    const found = parseImport(backup);
    expect(found.map((p) => p.name)).toEqual([PRODUCTION_CITY_SAMPLE.name, "Second"]);
    expect(new Set(found.map((p) => p.id)).size).toBe(2);
  });

  it("builds safe file names", () => {
    expect(safeFileName("Tower A / Phase 2")).toBe("Tower_A_Phase_2");
    expect(safeFileName("")).toBe("project");
  });
});
