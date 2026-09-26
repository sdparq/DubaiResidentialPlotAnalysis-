import type { Project, Typology, ProgramCell } from "./types";

/**
 * The demo scheme every new browser opens with — a fictional residential tower
 * on a 64 × 50 m plot in Business Bay (market class C), fully worked through
 * every step so each tab, the KPI bar and the 3D massing have something
 * meaningful to show:
 *
 *   plot 3,200 m² · target GFA 38,400 m² (FAR 12) · 95 % residential + 5 % retail
 *   2B + G + 3P + 35 type floors · tower plate 1,040 m² (12 m setbacks)
 *   415 units (Studio → 3 Bedrooms) · parking for 520 cars (493 required)
 *   in 2 basements + 3 podium levels
 *
 * Numbers are illustrative, not a real project. Balconies are 14.4 % of each
 * unit (class C matrix) and are excluded from GFA.
 */

const BALCONY_SHARE = 0.144;

function unit(
  id: string,
  name: string,
  category: Typology["category"],
  totalM2: number,
  occupancy: number,
  parkingPerUnit: number,
): Typology {
  return {
    id,
    name,
    category,
    internalArea: Number((totalM2 * (1 - BALCONY_SHARE)).toFixed(1)),
    balconyArea: Number((totalM2 * BALCONY_SHARE).toFixed(1)),
    occupancy,
    parkingPerUnit,
  };
}

const DEMO_TYPOLOGIES: Typology[] = [
  unit("demo-studio", "Studio", "Studio", 42, 1.5, 1),
  unit("demo-1br", "1 Bedroom", "1BR", 74, 1.8, 1),
  unit("demo-2br", "2 Bedrooms", "2BR", 118, 3, 1),
  unit("demo-3br", "3 Bedrooms", "3BR", 168, 4, 2),
];

/** Same unit mix on a band of floors: [studio, 1BR, 2BR, 3BR] per floor. */
function band(from: number, to: number, counts: [number, number, number, number]): ProgramCell[] {
  const cells: ProgramCell[] = [];
  for (let floor = from; floor <= to; floor++) {
    DEMO_TYPOLOGIES.forEach((t, i) => {
      if (counts[i] > 0) cells.push({ floor, typologyId: t.id, count: counts[i] });
    });
  }
  return cells;
}

const DEMO_PROGRAM: ProgramCell[] = [
  ...band(1, 10, [3, 6, 3, 1]),
  ...band(11, 30, [2, 5, 4, 1]),
  // Larger units on the upper floors.
  ...band(31, 35, [0, 3, 4, 2]),
];

export const DEMO_SAMPLE: Project = {
  id: "demo-sample",
  createdAt: 0,
  updatedAt: 0,
  name: "Sample · Business Bay tower",
  zone: "Business Bay",
  use: "RESIDENTIAL",
  plotArea: 3200,
  plotMode: "rectangular",
  plotFrontage: 64,
  plotDepth: 50,
  targetGFA: 38400,
  gfaBreakdown: {
    residential: { mode: "percent", value: 95 },
    retail: { mode: "percent", value: 5 },
  },
  basements: { count: 2, heightM: 3.5 },
  ground: { count: 1, heightM: 4.5 },
  podium: { count: 3, heightM: 3.6 },
  typeFloors: { count: 35, heightM: 3.6 },
  numFloors: 35,
  floorHeight: 3.6,
  towerFootprintM2: 1040,
  shaftPerUnit: 0.5,
  prmPercent: 0.02,
  typologies: DEMO_TYPOLOGIES,
  typologiesSeeded: true,
  typologyMix: { Studio: 17, "1BR": 42, "2BR": 31, "3BR": 10 },
  program: DEMO_PROGRAM,
  commonAreas: [],
  parking: [],
  otherUses: [],
  podiumParkingPerFloorM2: 2200,
  groundParkingM2: 0,
  groundSetbackM: 2,
  podiumSetbackM: 2,
  towerSetbackM: 12,
  facade: {
    mode: "residential",
    style: "balconies",
    glass: "azure",
    accent: "champagne",
    roundedCorners: true,
    crown: true,
    entrance: true,
    balconyDepthM: 2.2,
    groundPodiumTreatment: "fins",
    podiumPool: true,
    podiumLoungeBbq: true,
  },
  lifts: {
    cabinKg: 1275,
    speed: 1.75,
    timePerStop: 8,
    handlingPctStandard: 0.05,
    handlingPctPremium: 0.07,
    unitsPerLiftRule: 75,
    dcdMinLifts: 3,
    dcdMinUnitsThreshold: 100,
  },
  notes: "",
};

export function newId(prefix = "p"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyProject(name = "New Project"): Project {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    name,
    zone: "Other",
    use: "RESIDENTIAL",
    plotArea: 0,
    numFloors: 1,
    floorHeight: 3.6,
    shaftPerUnit: 0.5,
    prmPercent: 0.02,
    typologies: [],
    program: [],
    commonAreas: [],
    parking: [],
    otherUses: [],
    lifts: {
      cabinKg: 1275,
      speed: 1.75,
      timePerStop: 8,
      handlingPctStandard: 0.05,
      handlingPctPremium: 0.07,
      unitsPerLiftRule: 75,
      dcdMinLifts: 3,
      dcdMinUnitsThreshold: 100,
    },
    notes: "",
  };
}
