import type { CommonArea, OtherUse, ParkingLevel, ProgramCell, Project, Typology } from "./types";
import { emptyProject } from "./sample";

const APP_ID = "dubai-plot-analysis";

export interface ProjectsBackup {
  app: typeof APP_ID;
  kind: "backup";
  version: 1;
  exportedAt: string;
  projects: Project[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

/** Keep only array entries that are objects with a string id, filling numeric fields with safe defaults. */
function cleanList<T>(v: unknown, fix: (o: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((o): o is Record<string, unknown> => isObj(o) && typeof o.id === "string").map(fix);
}

/**
 * Turn arbitrary JSON (an imported file, a persisted record from an older version) into a
 * well-formed Project. Unknown optional fields are kept; required fields fall back to the
 * defaults of a blank project — never to the sample, so nothing leaks between projects.
 * Returns null when the input is not a project at all.
 */
export function normalizeProject(raw: unknown, keepIdentity = false): Project | null {
  if (!isObj(raw)) return null;
  const looksLikeProject =
    "typologies" in raw || "program" in raw || "plotArea" in raw || "numFloors" in raw || "commonAreas" in raw;
  if (!looksLikeProject) return null;

  const base = emptyProject(str(raw.name, "").trim() || "Imported project");
  const r = raw as Partial<Project>;

  const typologies = cleanList<Typology>(r.typologies, (t) => ({
    ...(t as unknown as Typology),
    name: str(t.name, "Typology"),
    category: (str(t.category, "Studio") as Typology["category"]),
    internalArea: num(t.internalArea, 0),
    balconyArea: num(t.balconyArea, 0),
    occupancy: num(t.occupancy, 0),
    parkingPerUnit: num(t.parkingPerUnit, 0),
  }));
  const program: ProgramCell[] = Array.isArray(r.program)
    ? r.program
        .filter((c): c is ProgramCell => isObj(c) && typeof c.typologyId === "string")
        .map((c) => ({ floor: Math.round(num(c.floor, 0)), typologyId: c.typologyId, count: Math.max(0, Math.round(num(c.count, 0))) }))
        .filter((c) => c.floor >= 1 && c.count > 0)
    : [];
  const commonAreas = cleanList<CommonArea>(r.commonAreas, (c) => ({
    ...(c as unknown as CommonArea),
    name: str(c.name, "Element"),
    area: num(c.area, 0),
    floors: Math.max(1, Math.round(num(c.floors, 1))),
  }));
  const parking = cleanList<ParkingLevel>(r.parking, (p) => ({
    ...(p as unknown as ParkingLevel),
    name: str(p.name, "Level"),
    standard: Math.max(0, Math.round(num(p.standard, 0))),
    prm: Math.max(0, Math.round(num(p.prm, 0))),
  }));
  const otherUses = cleanList<OtherUse>(r.otherUses, (u) => ({
    ...(u as unknown as OtherUse),
    name: str(u.name, "Use"),
    netArea: num(u.netArea, 0),
    spacesPer100sqm: num(u.spacesPer100sqm, 0),
  }));

  return {
    ...base,
    ...r,
    id: keepIdentity && typeof r.id === "string" ? r.id : base.id,
    createdAt: keepIdentity ? num(r.createdAt, base.createdAt) : base.createdAt,
    updatedAt: keepIdentity ? num(r.updatedAt, base.updatedAt) : base.updatedAt,
    name: keepIdentity ? str(r.name, base.name) : base.name,
    zone: str(r.zone, base.zone),
    use: "RESIDENTIAL",
    plotArea: Math.max(0, num(r.plotArea, 0)),
    numFloors: Math.max(1, Math.round(num(r.numFloors, 1))),
    floorHeight: Math.max(0, num(r.floorHeight, base.floorHeight)),
    shaftPerUnit: Math.max(0, num(r.shaftPerUnit, base.shaftPerUnit)),
    prmPercent: Math.max(0, num(r.prmPercent, base.prmPercent)),
    typologies,
    program,
    commonAreas,
    parking,
    otherUses,
    lifts: { ...base.lifts, ...(isObj(r.lifts) ? (r.lifts as Partial<Project["lifts"]>) : {}) },
    notes: str(r.notes, ""),
  };
}

/** Accepts a single exported project or a full backup; returns the projects found (empty if none). */
export function parseImport(json: unknown): Project[] {
  if (isObj(json) && Array.isArray(json.projects)) {
    return json.projects.map((p) => normalizeProject(p)).filter((p): p is Project => p !== null);
  }
  const single = normalizeProject(json);
  return single ? [single] : [];
}

export function makeBackup(projects: Project[]): ProjectsBackup {
  return { app: APP_ID, kind: "backup", version: 1, exportedAt: new Date().toISOString(), projects };
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const safeFileName = (name: string) => (name || "project").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
