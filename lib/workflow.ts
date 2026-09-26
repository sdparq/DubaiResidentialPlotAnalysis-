import type { Project } from "./types";
import type { ProjectMetrics } from "./metrics";

export type StepId =
  | "plot"
  | "setup"
  | "common"
  | "typologies"
  | "program"
  | "parking"
  | "lifts"
  | "massing"
  | "summary";

export type StepGroup = "Site" | "Programme" | "Services" | "Design" | "Results";

export interface Step {
  id: StepId;
  num: string;
  /** Short label for the navigation. */
  label: string;
  /** Page title. */
  title: string;
  /** One-line explanation under the page title. */
  description: string;
  group: StepGroup;
}

/** The feasibility workflow, in the order a study is built. */
export const STEPS: Step[] = [
  {
    id: "plot",
    num: "01",
    label: "Plot",
    title: "Plot & affection plan",
    description:
      "Upload the DLD affection plan — the parcel and its scale are detected automatically. Trace ground, podium and tower footprints.",
    group: "Site",
  },
  {
    id: "setup",
    num: "02",
    label: "Setup",
    title: "Project setup",
    description:
      "Zone and market class, plot area, target GFA, floor breakdown and the GFA split by use.",
    group: "Site",
  },
  {
    id: "common",
    num: "03",
    label: "Distribution",
    title: "GFA distribution",
    description:
      "Tower floors derived from the residential GFA and the floor plate, and the residential split into apartments, amenities, circulation and services.",
    group: "Programme",
  },
  {
    id: "typologies",
    num: "04",
    label: "Typologies",
    title: "Unit typologies & mix",
    description:
      "Unit types, sizes and balconies, and the unit mix recommended for the zone's market class.",
    group: "Programme",
  },
  {
    id: "program",
    num: "05",
    label: "Apartments",
    title: "Apartments per floor",
    description:
      "Units per floor, auto-filled from the apartments GFA and the unit mix — edit any cell by hand.",
    group: "Programme",
  },
  {
    id: "parking",
    num: "06",
    label: "Parking",
    title: "Parking",
    description:
      "Required spaces by typology and use (incl. People of Determination), provision per level and the basements it takes.",
    group: "Services",
  },
  {
    id: "lifts",
    num: "07",
    label: "Lifts",
    title: "Vertical transportation",
    description:
      "Passenger lifts per Dubai Building Code D.8.8 and the minimum cabin specification per Table D.6.",
    group: "Services",
  },
  {
    id: "massing",
    num: "08",
    label: "3D Massing",
    title: "3D massing",
    description:
      "Stratified 3D model with setbacks, façade, roof amenities, a Dubai sun & shadow study and presentation views.",
    group: "Design",
  },
  {
    id: "summary",
    num: "09",
    label: "Areas & ratios",
    title: "Areas & efficiency",
    description:
      "GFA, sellable (GSA) and construction (BUA) areas with the efficiency ratios of the scheme.",
    group: "Results",
  },
];

export const STEP_GROUPS: StepGroup[] = ["Site", "Programme", "Services", "Design", "Results"];

export type StepStatus = "done" | "attention" | "todo" | null;

/**
 * Light-touch completion cues for the navigation — "has this step been given
 * what it needs?", not a validation. `attention` flags a result the developer
 * should look at (parking shortfall, lifts outside the DBC chart).
 */
export function stepStatuses(project: Project, m: ProjectMetrics): Record<StepId, StepStatus> {
  const parkingStatus: StepStatus =
    m.parkingRequired <= 0 ? "todo" : m.parkingProvided >= m.parkingRequired ? "done" : "attention";
  return {
    plot: m.plotArea > 0 ? "done" : "todo",
    setup: m.targetGFA > 0 ? "done" : "todo",
    common: (project.towerFootprintM2 ?? 0) > 0 && m.targetGFA > 0 ? "done" : "todo",
    typologies: project.typologies.length > 0 ? "done" : "todo",
    program: m.units > 0 ? "done" : "todo",
    parking: parkingStatus,
    lifts: m.units <= 0 ? "todo" : m.liftsOutOfChart ? "attention" : "done",
    massing: null,
    summary: null,
  };
}
