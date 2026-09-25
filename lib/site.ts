import type { Project } from "./types";
import {
  type Point,
  offsetPolygon,
  polygonArea,
  rectanglePlotPolygon,
  rectangleToPolygon,
} from "./geom";
import { buildMassing, type MassingInputs, type MassingResult, type Volume } from "./massing";

/**
 * Single source of truth for the plot / buildable geometry and the massing parameters, shared by
 * the Massing and Sun & Views tabs (and the variant generator) so they always show the same building.
 */

export interface SiteGeometry {
  mode: "rectangular" | "polygon";
  plot: Point[];
  buildable: Point[];
  /** Polygon mode only — one setback per edge. */
  setbackPerEdge: number[];
  setbackUniform: number;
  frontage: number;
  depth: number;
  /** Side of a square with the Setup plot area — used when frontage / depth are empty. */
  squareFallback: number;
  plotArea: number;
  buildableArea: number;
}

export function deriveSite(project: Project): SiteGeometry {
  const mode = project.plotMode === "polygon" ? "polygon" : "rectangular";
  const squareFallback = project.plotArea > 0 ? Math.sqrt(project.plotArea) : 50;
  const frontage = project.plotFrontage && project.plotFrontage > 0 ? project.plotFrontage : squareFallback;
  const depth = project.plotDepth && project.plotDepth > 0 ? project.plotDepth : squareFallback;
  const sFront = project.setbackFront ?? 0;
  const sRear = project.setbackRear ?? 0;
  const sSide = project.setbackSide ?? 0;
  const setbackUniform = project.setbackUniform ?? Math.max(sFront, sRear, sSide, 3);

  const plot =
    mode === "polygon" && project.plotPolygon && project.plotPolygon.length >= 3
      ? project.plotPolygon
      : rectanglePlotPolygon(frontage, depth);

  const setbackPerEdge =
    mode !== "polygon"
      ? []
      : project.setbackPerEdge && project.setbackPerEdge.length === plot.length
        ? project.setbackPerEdge
        : new Array<number>(plot.length).fill(setbackUniform);

  const buildable =
    mode === "polygon" ? offsetPolygon(plot, setbackPerEdge) : rectangleToPolygon(frontage, depth, sFront, sRear, sSide);

  return {
    mode,
    plot,
    buildable,
    setbackPerEdge,
    setbackUniform,
    frontage,
    depth,
    squareFallback,
    plotArea: polygonArea(plot),
    buildableArea: polygonArea(buildable),
  };
}

export interface MassingSetup {
  inputs: MassingInputs;
  /** Program GFA spread over the Setup floors. */
  programFloorArea: number;
  effFloors: number;
  effFloorArea: number;
  buildingHeight: number;
}

/** Massing parameters with every default in one place. */
export function deriveMassingInputs(project: Project, site: SiteGeometry, programGFA: number): MassingSetup {
  const programFloorArea = project.numFloors > 0 ? programGFA / project.numFloors : 0;
  const effFloors = project.massingFloors ?? project.numFloors;
  const effFloorArea = project.massingFloorArea ?? programFloorArea;
  const inputs: MassingInputs = {
    buildable: site.buildable,
    effFloors,
    effFloorArea,
    floorHeight: project.floorHeight,
    shape: project.massingShape ?? "block",
    podiumFloors: project.podiumFloors ?? Math.min(2, effFloors),
    podiumCoverage: project.podiumCoverage ?? 0.95,
    towerCoverage: project.towerCoverage ?? 0.45,
    towerPosition: project.towerPosition ?? "C",
    courtyardRatio: project.courtyardRatio ?? 0.18,
    twinSeparation: project.twinSeparation ?? Math.max(8, Math.sqrt(site.buildableArea) * 0.2),
    twinCoverage: project.twinCoverage ?? 0.28,
    steppedSteps: project.steppedSteps ?? 4,
    steppedShrink: project.steppedShrink ?? 0.15,
    lNotchPosition: project.lNotchPosition ?? "NE",
    lNotchRatio: project.lNotchRatio ?? 0.32,
    uOpening: project.uOpening ?? "N",
    uArmRatio: project.uArmRatio ?? 0.28,
    uNotchDepth: project.uNotchDepth ?? 0.55,
  };
  return { inputs, programFloorArea, effFloors, effFloorArea, buildingHeight: effFloors * project.floorHeight };
}

export function deriveMassing(project: Project, site: SiteGeometry, programGFA: number): MassingSetup & { massing: MassingResult } {
  const setup = deriveMassingInputs(project, site, programGFA);
  return { ...setup, massing: buildMassing(setup.inputs) };
}

/** Area covered at ground level by the massing (courtyards subtracted, every tower counted). */
export function groundFootprintArea(volumes: Volume[]): number {
  return volumes
    .filter((v) => v.fromY <= 1e-6)
    .reduce((s, v) => s + polygonArea(v.polygon) - (v.hole ? polygonArea(v.hole) : 0), 0);
}

/**
 * Map plot-local volumes (x along the plot's +X, y along its +Y) into the geographic frame used for
 * OpenStreetMap buildings (x = east, y = north), applying the plot's north heading and the manual
 * offset set in the in-context view. Mirrors the transform applied by the 3D context scene.
 */
export function volumesToGeoFrame(volumes: Volume[], headingDeg: number, offsetXM = 0, offsetZM = 0): Volume[] {
  const h = (headingDeg * Math.PI) / 180;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const map = (p: Point): Point => ({ x: p.x * c + p.y * s + offsetXM, y: -p.x * s + p.y * c - offsetZM });
  return volumes.map((v) => ({ ...v, polygon: v.polygon.map(map), hole: v.hole?.map(map) }));
}
