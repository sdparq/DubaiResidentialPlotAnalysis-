"use client";
import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Compass as CompassIcon,
  Focus,
  ImageDown,
  Maximize2,
  Pause,
  Play,
  Rotate3d,
  Ruler,
  Sun,
  TreePalm,
  X,
} from "lucide-react";
import { useStore, useProject } from "@/lib/store";
import { fmt2 } from "@/lib/format";
import PlanTrace from "./plan-trace";
import {
  type Point,
  edgeLengths,
  offsetPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  rectanglePlotPolygon,
  translatePolygon,
} from "@/lib/geom";
import { edgeColor } from "@/lib/edge-colors";
import type { Volume } from "@/lib/massing";
import type { FacadeConfig, TowerFacadeStyle } from "@/lib/types";
import type { CaptureFn, SceneStyle } from "./massing-scene";
import { dubaiDaylight, dubaiSun, formatClock } from "@/lib/sun";
import { projectMetrics, type ProjectMetrics } from "@/lib/metrics";
import { composeBrandedImage, downloadDataUrl, slug } from "@/lib/branded-image";
import { BRAND } from "@/lib/brand";
import { ACCENTS, FACADE_STYLES, GLASSES, resolveFacade, type FacadeParams } from "@/lib/facade";
import { BrandMark } from "./shell/brand-mark";

const MassingScene = dynamic(() => import("./massing-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-bone-100">
      <div className="text-center">
        <div className="mx-auto w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-[12px] text-ink-500">Loading 3D viewer…</div>
      </div>
    </div>
  ),
});

/** Tier colours of the Diagram style — kept in sync with PALETTES.diagram in massing-scene. */
const TIER_SWATCH: Record<NonNullable<Volume["kind"]>, string> = {
  basement: "#9aa3b2",
  ground: "#eb6834",
  podium: "#2a78d6",
  tower: "#1baf7a",
};

/** Resolve a per-edge setback array for a tier:
 *   - if the persisted perEdge array matches the plot polygon length, use it
 *   - otherwise fall back to the uniform value on every edge */
function resolvePerEdge(plot: Point[], uniform: number, perEdge: number[] | undefined): number[] {
  if (perEdge && perEdge.length === plot.length) {
    return perEdge.map((v) => Math.max(0, v));
  }
  return plot.map(() => Math.max(0, uniform));
}

function tierPolygon(plot: Point[], setbacks: number[]): Point[] {
  if (plot.length < 3) return plot;
  if (setbacks.every((s) => s <= 0)) return plot;
  return offsetPolygon(plot, setbacks);
}

export default function MassingTab() {
  const project = useProject();
  const patch = useStore((s) => s.patch);

  const mode = project.plotMode === "polygon" ? "polygon" : "rectangular";

  const sqRoot = project.plotArea > 0 ? Math.sqrt(project.plotArea) : 50;
  const frontage = project.plotFrontage && project.plotFrontage > 0 ? project.plotFrontage : sqRoot;
  const depth = project.plotDepth && project.plotDepth > 0 ? project.plotDepth : sqRoot;

  const plotPoly: Point[] = useMemo(() => {
    if (mode === "polygon" && project.plotPolygon && project.plotPolygon.length >= 3) {
      return project.plotPolygon;
    }
    return rectanglePlotPolygon(frontage, depth);
  }, [mode, project.plotPolygon, frontage, depth]);

  // Per-tier setbacks. Each tier has a uniform fallback and an optional per-edge
  // override. The user edits the per-edge values in the table below.
  const groundUni = project.groundSetbackM ?? 3;
  const podiumUni = project.podiumSetbackM ?? 3;
  const towerUni = project.towerSetbackM ?? 6;

  const groundEdges = useMemo(
    () => resolvePerEdge(plotPoly, groundUni, project.groundSetbackPerEdge),
    [plotPoly, groundUni, project.groundSetbackPerEdge],
  );
  const podiumEdges = useMemo(
    () => resolvePerEdge(plotPoly, podiumUni, project.podiumSetbackPerEdge),
    [plotPoly, podiumUni, project.podiumSetbackPerEdge],
  );
  const towerEdges = useMemo(
    () => resolvePerEdge(plotPoly, towerUni, project.towerSetbackPerEdge),
    [plotPoly, towerUni, project.towerSetbackPerEdge],
  );

  // Custom tier footprints traced in the Plot tab win over setback-derived
  // outlines — for plots where the tower/podium shape differs from the plot line.
  // Every tier is a LIST of traced blocks; the legacy singular fields count
  // as block #1 so existing projects keep rendering unchanged.
  const customGrounds = useMemo(() => {
    const list = project.groundPolygons ?? (project.groundPolygon ? [project.groundPolygon] : []);
    const valid = list.filter((poly) => (poly?.length ?? 0) >= 3);
    return valid.length > 0 ? valid : null;
  }, [project.groundPolygons, project.groundPolygon]);
  const customPodiums = useMemo(() => {
    const list = project.podiumPolygons ?? (project.podiumPolygon ? [project.podiumPolygon] : []);
    const valid = list.filter((poly) => (poly?.length ?? 0) >= 3);
    return valid.length > 0 ? valid : null;
  }, [project.podiumPolygons, project.podiumPolygon]);
  // Multiple towers: towerPolygons wins; the legacy singular field counts as
  // one tower. Empty/short polygons are dropped.
  const customTowers = useMemo(() => {
    const list = project.towerPolygons ?? (project.towerPolygon ? [project.towerPolygon] : []);
    const valid = list.filter((poly) => (poly?.length ?? 0) >= 3);
    return valid.length > 0 ? valid : null;
  }, [project.towerPolygons, project.towerPolygon]);

  const groundPolys = useMemo(
    () => customGrounds ?? [tierPolygon(plotPoly, groundEdges)],
    [customGrounds, plotPoly, groundEdges],
  );
  const podiumPolys = useMemo(
    () => customPodiums ?? [tierPolygon(plotPoly, podiumEdges)],
    [customPodiums, plotPoly, podiumEdges],
  );
  const towerPolysCentered = useMemo(
    () => customTowers ?? [tierPolygon(plotPoly, towerEdges)],
    [customTowers, plotPoly, towerEdges],
  );

  const towerDx = project.towerOffsetXM ?? 0;
  const towerDy = project.towerOffsetYM ?? 0;
  const towerPolys = useMemo(
    () =>
      towerDx === 0 && towerDy === 0
        ? towerPolysCentered
        : towerPolysCentered.map((poly) => translatePolygon(poly, towerDx, towerDy)),
    [towerPolysCentered, towerDx, towerDy],
  );
  /** First tower — anchor for the height dimension and amenity clearances. */
  const towerPoly = towerPolys[0] ?? [];

  const edgeColors = useMemo(
    () => (mode === "polygon" ? plotPoly.map((_, i) => edgeColor(i)) : undefined),
    [mode, plotPoly],
  );

  const plotPolyArea = polygonArea(plotPoly);
  const groundArea = groundPolys.reduce((sum, poly) => sum + polygonArea(poly), 0);
  const podiumArea = podiumPolys.reduce((sum, poly) => sum + polygonArea(poly), 0);
  const towerArea = towerPolys.reduce((sum, poly) => sum + polygonArea(poly), 0);

  // Tier heights — mirror the same fallbacks the Setup floor-breakdown card uses
  // so unsaved defaults still render here. Ground in particular defaults to
  // 1 × 4.5 m even when project.ground is undefined.
  const basementCount = project.basements?.count ?? 0;
  const basementHeightM = project.basements?.heightM ?? 3.0;
  const basementH = Math.max(0, basementCount) * Math.max(0, basementHeightM);

  const groundCount = project.ground?.count ?? 1;
  const groundHeightM = project.ground?.heightM ?? 4.5;
  const groundH = Math.max(0, groundCount) * Math.max(0, groundHeightM);

  const podiumCount = project.podium?.count ?? 0;
  const podiumHeightM = project.podium?.heightM ?? 4.0;
  const podiumH = Math.max(0, podiumCount) * Math.max(0, podiumHeightM);

  const towerCount = project.typeFloors?.count ?? project.numFloors;
  const towerHeightM = project.typeFloors?.heightM ?? project.floorHeight;
  const towerH = Math.max(0, towerCount) * Math.max(0, towerHeightM);

  const totalH = groundH + podiumH + towerH;

  const { sceneVolumes, volumeLabels } = useMemo(() => {
    const out: Volume[] = [];
    const labels: string[] = [];
    if (basementH > 0 && plotPoly.length >= 3) {
      out.push({ polygon: plotPoly, fromY: -basementH, toY: 0, kind: "basement", floors: basementCount });
      labels.push(basementCount > 1 ? `Basement · ${basementCount}F` : "Basement");
    }
    let y = 0;
    if (groundH > 0) {
      // One label per volume, pushed in the same order as the volumes.
      const gSuffix = groundCount > 1 ? ` · ${groundCount}F` : "";
      groundPolys.forEach((poly, i) => {
        if (poly.length < 3) return;
        out.push({ polygon: poly, fromY: y, toY: y + groundH, kind: "ground", floors: groundCount });
        labels.push(groundPolys.length > 1 ? `Ground ${i + 1}${gSuffix}` : `Ground${gSuffix}`);
      });
      y += groundH;
    }
    if (podiumH > 0) {
      const pSuffix = podiumCount > 1 ? ` · ${podiumCount}F` : "";
      podiumPolys.forEach((poly, i) => {
        if (poly.length < 3) return;
        out.push({ polygon: poly, fromY: y, toY: y + podiumH, kind: "podium", floors: podiumCount });
        labels.push(podiumPolys.length > 1 ? `Podium ${i + 1}${pSuffix}` : `Podium${pSuffix}`);
      });
      y += podiumH;
    }
    if (towerH > 0) {
      towerPolys.forEach((poly, i) => {
        if (poly.length < 3) return;
        out.push({ polygon: poly, fromY: y, toY: y + towerH, kind: "tower", floors: towerCount });
        labels.push(towerPolys.length > 1 ? `Tower ${i + 1} · ${towerCount}F` : `Tower · ${towerCount}F`);
      });
    }
    return { sceneVolumes: out, volumeLabels: labels };
  }, [plotPoly, groundPolys, podiumPolys, towerPolys, basementH, groundH, podiumH, towerH, basementCount, groundCount, podiumCount, towerCount]);

  const totalVolumeGFA = groundArea * groundCount + podiumArea * podiumCount + towerArea * towerCount;
  const computedFar = plotPolyArea > 0 ? totalVolumeGFA / plotPolyArea : 0;

  const captureRef = useRef<CaptureFn | null>(null);

  // Designed façade, persisted per project with every default applied.
  // Memoised so the 3D scene only rebuilds the building when it changes.
  const facadeParams: FacadeParams = useMemo(() => resolveFacade(project.facade), [project.facade]);

  function patchFacade(partial: Partial<FacadeConfig>) {
    patch({ facade: { ...project.facade, ...partial } });
  }

  const [amenityFit, setAmenityFit] = useState({ pool: true, lounge: true });
  const [panel, setPanel] = useState<"design" | "scheme" | "site">("design");

  const metrics = useMemo(() => projectMetrics(project), [project]);
  const northDeg = project.northDeg ?? 0;

  // ---- plot editor handlers ----
  function setPlotMode(next: "rectangular" | "polygon") {
    if (next === "polygon" && (!project.plotPolygon || project.plotPolygon.length < 3)) {
      patch({ plotMode: "polygon", plotPolygon: rectanglePlotPolygon(frontage, depth) });
    } else {
      patch({ plotMode: next });
    }
  }

  function updateVertex(i: number, p: Partial<Point>) {
    if (!project.plotPolygon) return;
    const next = project.plotPolygon.map((v, idx) => (idx === i ? { ...v, ...p } : v));
    patch({ plotPolygon: next });
  }

  function addVertexAfter(i: number) {
    if (!project.plotPolygon) return;
    const a = project.plotPolygon[i];
    const b = project.plotPolygon[(i + 1) % project.plotPolygon.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const next = [...project.plotPolygon.slice(0, i + 1), mid, ...project.plotPolygon.slice(i + 1)];
    patch({ plotPolygon: next });
  }

  function deleteVertex(i: number) {
    if (!project.plotPolygon) return;
    if (project.plotPolygon.length <= 3) {
      alert("A polygon needs at least 3 vertices.");
      return;
    }
    const next = project.plotPolygon.filter((_, idx) => idx !== i);
    patch({ plotPolygon: next });
  }

  function recentrePolygon() {
    if (!project.plotPolygon) return;
    const c = polygonCentroid(project.plotPolygon);
    const next = project.plotPolygon.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    patch({ plotPolygon: next });
  }

  const tiersPresent = useMemo(() => {
    const kinds = new Set(sceneVolumes.map((v) => v.kind ?? "tower"));
    return (["tower", "podium", "ground", "basement"] as const).filter((k) => kinds.has(k));
  }, [sceneVolumes]);

  const PANELS = [
    { id: "design", label: "Tower design" },
    { id: "scheme", label: "Scheme" },
    { id: "site", label: "Site" },
  ] as const;

  return (
    <div className="grid gap-6">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <MassingViewer
          projectId={project.id}
          projectName={project.name}
          zone={project.zone}
          plot={plotPoly}
          buildable={towerPoly}
          volumes={sceneVolumes}
          floorHeight={towerHeightM > 0 ? towerHeightM : project.floorHeight}
          showFrontMarker={mode === "rectangular"}
          edgeColors={edgeColors}
          volumeLabels={volumeLabels}
          facade={facadeParams}
          onAmenityFit={setAmenityFit}
          captureRef={captureRef}
          northDeg={northDeg}
          metrics={metrics}
          tiersPresent={tiersPresent}
        />

        <aside className="card !p-0 overflow-hidden xl:sticky xl:top-[150px]">
          <div className="px-4 pt-4 pb-3 border-b border-ink-100">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Design controls</h2>
              <span className="text-[12px] text-ink-500 tabular-nums">{metrics.heightCode} · {totalH.toFixed(1)} m</span>
            </div>
            <div className="seg mt-3 w-full grid grid-cols-3" role="tablist" aria-label="Design control groups">
              {PANELS.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={panel === p.id}
                  data-active={panel === p.id}
                  className="seg-btn !px-1"
                  onClick={() => setPanel(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 grid gap-4 xl:max-h-[calc(100vh-290px)] xl:overflow-y-auto scroll-thin">
            {panel === "design" && (
              <>
                <TowerDesignPanel
                  params={facadeParams}
                  onPatch={patchFacade}
                  hasGround={groundH > 0}
                  hasPodium={podiumH > 0}
                />
                <PodiumAmenitiesPanel
                  hasDeck={podiumH > 0 || groundH > 0}
                  deckKind={podiumH > 0 ? "podium" : "ground"}
                  pool={facadeParams.podiumPool}
                  lounge={facadeParams.podiumLoungeBbq}
                  fit={amenityFit}
                  onPatch={patchFacade}
                />
              </>
            )}

            {panel === "scheme" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <HeroStat label="Height above ground" value={fmt2(totalH)} unit="m" />
                  <HeroStat
                    label="Gross plates ÷ plot"
                    value={computedFar.toFixed(2)}
                    title="Every modelled floor plate (incl. parking and services levels) over the plot area — the GFA-based FAR is in the KPI bar"
                  />
                </div>
                <TierSummary
                  groundCount={groundCount}
                  groundHeightM={groundHeightM}
                  podiumCount={podiumCount}
                  podiumHeightM={podiumHeightM}
                  towerCount={towerCount}
                  towerHeightM={towerHeightM}
                  basementCount={basementCount}
                  basementHeightM={basementHeightM}
                  groundArea={groundArea}
                  podiumArea={podiumArea}
                  towerArea={towerArea}
                  plotArea={plotPolyArea}
                />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Stat label="Plot area" value={`${fmt2(plotPolyArea)} m²`} />
                  <Stat label="Tower footprint" value={`${fmt2(towerArea)} m²`} />
                  <Stat label="Basement depth" value={`${fmt2(basementH)} m`} />
                  <Stat label="Σ Volume GFA" value={`${fmt2(totalVolumeGFA)} m²`} />
                </div>
                {(customGrounds || customPodiums || customTowers) && (
                  <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-[12px] text-ink-800 leading-snug">
                    <div className="text-[12px] font-semibold text-brand-800 mb-1">Custom footprints from Plot</div>
                    {([
                      ["Ground", customGrounds, "ground"],
                      ["Podium", customPodiums, "podium"],
                      ["Tower", customTowers, "tower"],
                    ] as const).map(([label, blocks, tier]) =>
                      blocks ? (
                        <div key={tier} className="flex items-center justify-between gap-2 py-0.5">
                          <span>
                            <strong>
                              {blocks.length === 1 ? label : `${blocks.length} ${label.toLowerCase()} blocks`}
                            </strong>{" "}
                            use{blocks.length === 1 ? "s" : ""} traced footprint{blocks.length === 1 ? "" : "s"}{" "}
                            ({blocks.map((poly) => fmt2(polygonArea(poly))).join(" + ")} m²) — the{" "}
                            {label.toLowerCase()} setbacks are ignored. Add or remove blocks in the Plot step.
                          </span>
                          <button
                            className="text-[11px] text-ink-500 hover:text-red-700 underline shrink-0"
                            onClick={() => {
                              const singular = { ground: "groundPolygon", podium: "podiumPolygon", tower: "towerPolygon" } as const;
                              const plural = { ground: "groundPolygons", podium: "podiumPolygons", tower: "towerPolygons" } as const;
                              const traceKey = { ground: "grounds", podium: "podiums", tower: "towers" } as const;
                              patch({
                                [singular[tier]]: undefined,
                                [plural[tier]]: undefined,
                                parcel: project.parcel
                                  ? {
                                      ...project.parcel,
                                      tierTracesPx: {
                                        ...project.parcel.tierTracesPx,
                                        [tier]: undefined,
                                        [traceKey[tier]]: undefined,
                                      },
                                    }
                                  : project.parcel,
                              });
                            }}
                            title={`Remove every traced ${label.toLowerCase()} block and fall back to setbacks`}
                          >clear</button>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
                <TowerOffset dx={towerDx} dy={towerDy} onPatch={patch} />
              </>
            )}

            {panel === "site" && (
              <>
                <div className="grid gap-2">
                  <span className="text-[12px] font-medium text-ink-600">Plot geometry</span>
                  <div className="seg w-full grid grid-cols-2">
                    <button className="seg-btn" data-active={mode === "rectangular"} onClick={() => setPlotMode("rectangular")}>
                      Rectangular
                    </button>
                    <button className="seg-btn" data-active={mode === "polygon"} onClick={() => setPlotMode("polygon")}>
                      Polygon (irregular)
                    </button>
                  </div>
                </div>
                <Collapsible
                  title={mode === "polygon" ? "Plot vertices" : "Plot dimensions"}
                  defaultOpen={mode === "rectangular" || (project.plotPolygon?.length ?? 0) === 0}
                >
                  {mode === "rectangular" ? (
                    <RectangularInputs project={project} patch={patch} placeholder={sqRoot.toFixed(1)} />
                  ) : (
                    <PolygonInputs
                      vertices={project.plotPolygon ?? []}
                      onUpdate={updateVertex}
                      onAddAfter={addVertexAfter}
                      onDelete={deleteVertex}
                      onRecentre={recentrePolygon}
                    />
                  )}
                </Collapsible>
                <SetbacksTable
                  plotPoly={plotPoly}
                  groundEdges={groundEdges}
                  podiumEdges={podiumEdges}
                  towerEdges={towerEdges}
                  groundUni={groundUni}
                  podiumUni={podiumUni}
                  towerUni={towerUni}
                  onPatch={patch}
                />
                <NorthControl value={northDeg} onChange={(v) => patch({ northDeg: v })} />
              </>
            )}

          </div>
        </aside>
      </div>

      {project.parcel && !!project.parcel.imageDataUrl && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[13px] font-semibold text-ink-900">Reference plan</span>
            {project.parcel.calibration && (
              <span className="tag-ok">Calibrated · {project.parcel.calibration.metres.toFixed(2)} m ref</span>
            )}
          </div>
          <PlanTrace
            parcel={project.parcel}
            mode="idle"
            tracePolygonPx={project.parcel.tracePolygonPx}
            calibration={project.parcel.calibration}
            edgeColors={
              mode === "polygon" && project.parcel.tracePolygonPx
                ? project.parcel.tracePolygonPx.map((_, i) => edgeColor(i))
                : undefined
            }
            extraPolygons={([
              ["ground", TIER_SWATCH.ground, "Ground"],
              ["podium", TIER_SWATCH.podium, "Podium"],
              ["tower", TIER_SWATCH.tower, "Tower"],
            ] as const).flatMap(([key, color, label]) => {
              const t = project.parcel!.tierTracesPx;
              const plural = key === "ground" ? t?.grounds : key === "podium" ? t?.podiums : t?.towers;
              const single = t?.[key];
              const list = plural ?? (single ? [single] : []);
              return list
                .filter((pts) => pts.length >= 3)
                .map((pts, i, arr) => ({
                  points: pts,
                  color,
                  label: arr.length > 1 ? `${label} ${i + 1}` : label,
                }));
            })}
          />
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Viewer                                    */
/* -------------------------------------------------------------------------- */

const STYLES: { id: SceneStyle; label: string; hint: string }[] = [
  { id: "realistic", label: "Realistic", hint: "Dubai daylight with the chosen glass and metal" },
  { id: "model", label: "Model", hint: "White architectural model" },
  { id: "diagram", label: "Diagram", hint: "Colour by tier — basement, ground, podium, tower" },
];

const SUN_DATES: { label: string; m: number; d: number }[] = [
  { label: "21 Mar", m: 3, d: 21 },
  { label: "21 Jun", m: 6, d: 21 },
  { label: "21 Sep", m: 9, d: 21 },
  { label: "21 Dec", m: 12, d: 21 },
];

interface ViewerProps {
  projectId: string;
  projectName: string;
  zone: string;
  plot: Point[];
  buildable: Point[];
  volumes: Volume[];
  floorHeight: number;
  showFrontMarker: boolean;
  edgeColors?: string[];
  volumeLabels: string[];
  facade: FacadeParams;
  onAmenityFit: (fit: { pool: boolean; lounge: boolean }) => void;
  captureRef: React.MutableRefObject<CaptureFn | null>;
  northDeg: number;
  metrics: ProjectMetrics;
  tiersPresent: NonNullable<Volume["kind"]>[];
}

const MassingViewer = memo(function MassingViewer(props: ViewerProps) {
  const {
    projectId, projectName, zone, plot, buildable, volumes, floorHeight, showFrontMarker, edgeColors,
    volumeLabels, facade, onAmenityFit, captureRef, northDeg, metrics, tiersPresent,
  } = props;

  const [style, setStyle] = useState<SceneStyle>("realistic");
  const [resetView, setResetView] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showPlanting, setShowPlanting] = useState(true);
  const [present, setPresent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const compassRef = useRef<HTMLDivElement>(null);

  // Sun study — Dubai, a chosen day and hour.
  const year = new Date().getFullYear();
  const [sunOn, setSunOn] = useState(true);
  const [sunDate, setSunDate] = useState({ m: 3, d: 21 });
  const [hour, setHour] = useState(14);
  const [playing, setPlaying] = useState(false);
  const daylight = useMemo(() => dubaiDaylight(year, sunDate.m, sunDate.d), [year, sunDate]);
  const clampedHour = Math.min(daylight.sunset - 0.05, Math.max(daylight.sunrise + 0.05, hour));
  const sun = useMemo(
    () => (sunOn ? dubaiSun(year, sunDate.m, sunDate.d, clampedHour) : null),
    [sunOn, year, sunDate, clampedHour],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      // ~12 s for a whole day, updated at ~24 fps.
      if (acc > 40) {
        const step = ((daylight.sunset - daylight.sunrise) / 12000) * acc;
        acc = 0;
        setHour((h) => {
          const next = Math.max(h, daylight.sunrise) + step;
          return next >= daylight.sunset - 0.05 ? daylight.sunrise + 0.05 : next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, daylight]);

  // Presentation mode: Esc exits, and the page behind stops scrolling.
  useEffect(() => {
    if (!present) return;
    document.body.classList.add("present-open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPresent(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("present-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [present]);

  function flyToAerial() {
    setAutoRotate(false);
    setResetView((n) => n + 1);
  }

  const stats: Array<[string, string]> = useMemo(() => {
    const out: Array<[string, string]> = [];
    if (metrics.totalGFA > 0) out.push(["GFA", `${Math.round(metrics.totalGFA).toLocaleString("en-US")} m²`]);
    if (metrics.units > 0) out.push(["Units", metrics.units.toLocaleString("en-US")]);
    out.push(["Height", `${metrics.heightCode} · ${metrics.heightM.toFixed(0)} m`]);
    if (metrics.far !== null) out.push(["FAR", metrics.far.toFixed(2)]);
    if (metrics.gsa > 0) out.push(["Sellable", `${Math.round(metrics.gsa).toLocaleString("en-US")} m²`]);
    return out;
  }, [metrics]);

  async function exportImage() {
    const cap = captureRef.current;
    if (!cap || exporting) return;
    setExporting(true);
    try {
      const shot = await cap({ scale: 2 });
      if (!shot) return;
      const when = sun
        ? ` · sun ${SUN_DATES.find((d) => d.m === sunDate.m && d.d === sunDate.d)?.label ?? ""} ${formatClock(clampedHour)}`
        : "";
      const exportStats: Array<[string, string]> = [];
      if (metrics.totalGFA > 0) exportStats.push(["GFA", `${Math.round(metrics.totalGFA).toLocaleString("en-US")} m²`]);
      if (metrics.units > 0) exportStats.push(["Units", metrics.units.toLocaleString("en-US")]);
      exportStats.push(["Height", `${metrics.heightM.toFixed(0)} m`]);
      if (metrics.far !== null) exportStats.push(["FAR", metrics.far.toFixed(2)]);
      const img = await composeBrandedImage(shot, {
        title: projectName || "Untitled project",
        subtitle: `${zone || BRAND.market} · ${metrics.heightCode} · massing study${when}`,
        stats: exportStats,
        brand: BRAND.wordmark,
        tagline: BRAND.tagline,
      });
      downloadDataUrl(img, `${slug(projectName)}-massing.png`);
    } finally {
      setExporting(false);
    }
  }

  const toolBtn =
    "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap";
  const glass = "bg-white/85 backdrop-blur-md ring-1 ring-ink-900/10 shadow-sm";

  return (
    <div
      className={
        present
          ? "fixed inset-0 z-[70] bg-ink-950"
          : "relative rounded-xl overflow-hidden border border-ink-200/80 shadow-card bg-bone-100 aspect-[3/4] sm:aspect-[4/3] xl:aspect-auto xl:h-[calc(100vh-318px)] xl:min-h-[500px] xl:max-h-[860px]"
      }
    >
      <MassingScene
        plot={plot}
        buildable={buildable}
        volumes={volumes}
        primaryFootprint={buildable}
        floorHeight={floorHeight}
        showFrontMarker={showFrontMarker}
        edgeColors={edgeColors}
        volumeLabels={volumeLabels}
        showAnnotations={showAnnotations && !present}
        resetView={resetView}
        autoRotate={autoRotate}
        captureRef={captureRef}
        facade={facade}
        onAmenityFit={onAmenityFit}
        style={style}
        sun={sun}
        northDeg={northDeg}
        showPlanting={showPlanting}
        quality={present ? "high" : "standard"}
        compassRef={compassRef}
        frameKey={projectId}
      />

      {/* Top-left: style + legend */}
      <div className="absolute z-20 top-3 left-3 grid gap-2 justify-items-start max-w-[calc(100%-24px)]">
        {present && (
          <div className={`${glass} rounded-xl px-4 py-3 flex items-center gap-3`}>
            <BrandMark className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-ink-900 truncate max-w-[46vw]">{projectName}</div>
              <div className="text-[12px] text-ink-500 truncate">{zone} · {BRAND.wordmark} massing study</div>
            </div>
          </div>
        )}
        <div className={`${glass} rounded-lg p-0.5 inline-flex gap-0.5`} role="radiogroup" aria-label="Viewer style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={style === s.id}
              onClick={() => setStyle(s.id)}
              title={s.hint}
              className={`${toolBtn} !h-7 ${style === s.id ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-900/5"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {style === "diagram" && (
          <div className={`${glass} rounded-lg px-2.5 py-2 grid gap-1`} aria-label="Legend">
            {tiersPresent.map((k) => (
              <div key={k} className="flex items-center gap-2 text-[11.5px] text-ink-700">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TIER_SWATCH[k], opacity: k === "basement" ? 0.6 : 1 }} />
                {k === "tower" ? "Tower · residential" : k[0].toUpperCase() + k.slice(1)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-right: camera */}
      <div className="absolute z-20 top-3 right-3 flex items-center gap-2">
        <button
          onClick={flyToAerial}
          className={`${toolBtn} ${glass} text-ink-700 hover:bg-white`}
          title="Back to the aerial view"
          aria-label="Aerial view"
        >
          <Focus className="w-4 h-4" />
          <span className="hidden sm:inline">Aerial view</span>
        </button>
        <button
          onClick={() => setAutoRotate((v) => !v)}
          className={`${toolBtn} ${glass} ${autoRotate ? "!bg-ink-900 text-white" : "text-ink-700 hover:bg-white"}`}
          title="Turntable rotation"
          aria-pressed={autoRotate}
        >
          <Rotate3d className="w-4 h-4" />
        </button>
        {present && (
          <button onClick={() => setPresent(false)} className={`${toolBtn} ${glass} text-ink-700 hover:bg-white`} title="Exit presentation (Esc)">
            <X className="w-4 h-4" /> Exit
          </button>
        )}
      </div>

      {/* Bottom: compass + sun study + actions. Phones get two rows (sun bar on
          top, compass + actions under it); wider screens a single row. */}
      <div className="absolute z-20 left-3 right-3 bottom-3 grid gap-2 sm:flex sm:flex-wrap sm:items-end">
        <div className={`${glass} order-1 sm:order-2 rounded-xl px-3 py-2 grid gap-1.5 sm:flex sm:items-center sm:gap-3 min-w-0 sm:min-w-[440px]`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSunOn((v) => !v)}
              className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${sunOn ? "bg-sand-100 text-sand-700 ring-1 ring-sand-300" : "text-ink-400 hover:bg-ink-900/5"}`}
              title={sunOn ? "Sun & shadow study on — Dubai" : "Turn the Dubai sun & shadow study on"}
              aria-pressed={sunOn}
            >
              <Sun className="w-4 h-4" />
            </button>
            {sunOn ? (
              <>
                <div className="flex items-center gap-0.5 sm:gap-1" role="radiogroup" aria-label="Day of the year">
                  {SUN_DATES.map((d) => {
                    const active = d.m === sunDate.m && d.d === sunDate.d;
                    return (
                      <button
                        key={d.label}
                        role="radio"
                        aria-checked={active}
                        aria-label={d.label}
                        onClick={() => setSunDate({ m: d.m, d: d.d })}
                        className={`h-7 px-1.5 sm:px-2 rounded-md text-[11.5px] font-medium whitespace-nowrap ${active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-900/5"}`}
                      >
                        <span className="sm:hidden">{d.label.split(" ")[1]}</span>
                        <span className="hidden sm:inline">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="sm:hidden ml-auto text-right leading-tight shrink-0">
                  <div className="text-[13px] font-semibold text-ink-900 tabular-nums">{formatClock(clampedHour)}</div>
                </div>
              </>
            ) : (
              <span className="text-[12px] text-ink-500 pr-2">Sun study off — studio light</span>
            )}
          </div>
          {sunOn && (
            <div className="flex items-center gap-2 flex-1 min-w-0 sm:min-w-[180px]">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="w-7 h-7 rounded-md grid place-items-center text-ink-700 hover:bg-ink-900/5 shrink-0"
                title={playing ? "Pause the day" : "Play the day — sunrise to sunset"}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={Math.ceil(daylight.sunrise * 12) / 12}
                max={Math.floor(daylight.sunset * 12) / 12}
                step={1 / 12}
                value={clampedHour}
                onChange={(e) => {
                  setPlaying(false);
                  setHour(parseFloat(e.target.value));
                }}
                className="flex-1 accent-[#b88a42] min-w-[80px]"
                aria-label="Time of day"
              />
              <div className="text-right leading-tight shrink-0 w-[70px] sm:w-[92px]">
                <div className="hidden sm:block text-[13px] font-semibold text-ink-900 tabular-nums">{formatClock(clampedHour)}</div>
                <div className="text-[10.5px] text-ink-500 tabular-nums whitespace-nowrap">
                  {sun ? `alt ${sun.altitudeDeg.toFixed(0)}° · az ${sun.azimuthDeg.toFixed(0)}°` : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="order-2 flex items-end justify-between gap-2 sm:contents">
          <div className={`${glass} sm:order-1 w-11 h-11 rounded-full grid place-items-center shrink-0`} title="North">
            <div ref={compassRef} className="w-8 h-8 relative" aria-label="North arrow">
              <svg viewBox="0 0 32 32" className="w-8 h-8">
                <path d="M16 3 L20 16 L16 14 L12 16 Z" fill="#0d7f69" />
                <path d="M16 29 L12 16 L16 18 L20 16 Z" fill="#c2c8d3" />
              </svg>
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-brand-700">N</span>
            </div>
          </div>

          <div className={`${glass} sm:order-3 rounded-xl p-1 flex items-center gap-0.5 sm:ml-auto`}>
            <button
              onClick={() => setShowAnnotations((v) => !v)}
              className={`${toolBtn} ${showAnnotations ? "text-brand-700 bg-brand-50" : "text-ink-600 hover:bg-ink-900/5"}`}
              title="Height dimension and tier labels"
              aria-label="Dimensions and labels"
              aria-pressed={showAnnotations}
            >
              <Ruler className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowPlanting((v) => !v)}
              className={`${toolBtn} ${showPlanting ? "text-brand-700 bg-brand-50" : "text-ink-600 hover:bg-ink-900/5"}`}
              title="Street trees and palms"
              aria-label="Street trees and palms"
              aria-pressed={showPlanting}
            >
              <TreePalm className="w-4 h-4" />
            </button>
            <button onClick={() => void exportImage()} className={`${toolBtn} text-ink-700 hover:bg-ink-900/5`} title="Download a branded presentation image (PNG)" aria-label="Download image" disabled={exporting}>
              {exporting ? <Camera className="w-4 h-4 animate-pulse" /> : <ImageDown className="w-4 h-4" />}
              <span className="hidden md:inline">Image</span>
            </button>
            {!present && (
              <button onClick={() => setPresent(true)} className={`${toolBtn} bg-brand-600 text-white hover:bg-brand-700`} title="Full-screen presentation mode" aria-label="Present">
                <Maximize2 className="w-4 h-4" />
                <span className="hidden md:inline">Present</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Presentation KPI band */}
      {present && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[132px] sm:bottom-[76px] max-w-[calc(100%-24px)]">
          <div className={`${glass} rounded-2xl px-2 py-2 flex items-stretch overflow-x-auto no-scrollbar`}>
            {stats.map(([label, value]) => (
              <div key={label} className="px-4 py-1 border-r last:border-r-0 border-ink-900/10 min-w-[120px]">
                <div className="text-[11.5px] text-ink-500 font-medium whitespace-nowrap">{label}</div>
                <div className="text-[18px] font-semibold text-ink-900 whitespace-nowrap tracking-tight">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*                              Inspector panels                              */
/* -------------------------------------------------------------------------- */

function NorthControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="text-[12.5px] font-semibold text-ink-800 flex items-center gap-2">
          <CompassIcon className="w-4 h-4 text-ink-400" /> True north
        </span>
        <span className="text-[12px] text-ink-500 tabular-nums">{value.toFixed(0)}°</span>
      </div>
      <div className="p-3 grid gap-2">
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-[#0d7f69]"
          aria-label="True north bearing"
        />
        <p className="text-[11.5px] text-ink-500 leading-snug">
          Bearing of true north, clockwise from the top of the plot drawing. Copy it from the north arrow on the
          affection plan (0° = drawing is north-up). It orients the sun & shadow study.
        </p>
      </div>
    </div>
  );
}

function TierSummary({
  groundCount, groundHeightM,
  podiumCount, podiumHeightM,
  towerCount, towerHeightM,
  basementCount, basementHeightM,
  groundArea, podiumArea, towerArea, plotArea,
}: {
  groundCount: number; groundHeightM: number;
  podiumCount: number; podiumHeightM: number;
  towerCount: number; towerHeightM: number;
  basementCount: number; basementHeightM: number;
  groundArea: number; podiumArea: number; towerArea: number; plotArea: number;
}) {
  const rows: Array<{ label: string; floors: number; heightM: number; footprint: number; kind: "basement" | "ground" | "podium" | "tower" }> = [
    { label: "Tower", floors: towerCount, heightM: towerHeightM, footprint: towerArea, kind: "tower" },
    { label: "Podium", floors: podiumCount, heightM: podiumHeightM, footprint: podiumArea, kind: "podium" },
    { label: "Ground", floors: groundCount, heightM: groundHeightM, footprint: groundArea, kind: "ground" },
    { label: "Basement", floors: basementCount, heightM: basementHeightM, footprint: plotArea, kind: "basement" },
  ];
  return (
    <div className="panel">
      <div className="grid grid-cols-[1fr_52px_60px_78px] gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-500 bg-bone-50 border-b border-ink-200/80">
        <div>Tier</div>
        <div className="text-right">Floors</div>
        <div className="text-right">Fl. h</div>
        <div className="text-right">Plate m²</div>
      </div>
      {rows.map((r) => (
        <div key={r.kind} className="grid grid-cols-[1fr_52px_60px_78px] gap-1 px-3 py-2 items-center text-[12.5px] tabular-nums border-b border-ink-100 last:border-b-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: TIER_SWATCH[r.kind] }} />
            <span className="text-ink-900 truncate">{r.label}</span>
          </div>
          <div className="text-right text-ink-700">{r.floors > 0 ? r.floors : "—"}</div>
          <div className="text-right text-ink-700">{r.floors > 0 && r.heightM > 0 ? r.heightM.toFixed(2) : "—"}</div>
          <div className="text-right text-ink-900">{r.floors > 0 && r.footprint > 0 ? Math.round(r.footprint).toLocaleString("en-US") : "—"}</div>
        </div>
      ))}
      <div className="px-3 py-2 text-[11.5px] text-ink-500 leading-snug bg-bone-50/60">
        Floor counts and heights come from <strong>Setup → Floor breakdown</strong>.
      </div>
    </div>
  );
}

function SetbacksTable({
  plotPoly, groundEdges, podiumEdges, towerEdges,
  groundUni, podiumUni, towerUni,
  onPatch,
}: {
  plotPoly: Point[];
  groundEdges: number[];
  podiumEdges: number[];
  towerEdges: number[];
  groundUni: number;
  podiumUni: number;
  towerUni: number;
  onPatch: (p: Partial<ReturnType<typeof useProject>>) => void;
}) {
  const lengths = edgeLengths(plotPoly);

  function updateEdge(tier: "ground" | "podium" | "tower", i: number, v: number) {
    const safe = Math.max(0, v);
    const baseUniform = tier === "ground" ? groundUni : tier === "podium" ? podiumUni : towerUni;
    const baseArray = tier === "ground" ? groundEdges : tier === "podium" ? podiumEdges : towerEdges;
    const next = baseArray.length === plotPoly.length ? [...baseArray] : plotPoly.map(() => baseUniform);
    next[i] = safe;
    const field = tier === "ground" ? "groundSetbackPerEdge" : tier === "podium" ? "podiumSetbackPerEdge" : "towerSetbackPerEdge";
    onPatch({ [field]: next } as Partial<ReturnType<typeof useProject>>);
  }

  function applyUniform(tier: "ground" | "podium" | "tower", v: number) {
    const safe = Math.max(0, v);
    const next = plotPoly.map(() => safe);
    if (tier === "ground") onPatch({ groundSetbackM: safe, groundSetbackPerEdge: next });
    else if (tier === "podium") onPatch({ podiumSetbackM: safe, podiumSetbackPerEdge: next });
    else onPatch({ towerSetbackM: safe, towerSetbackPerEdge: next });
  }

  const inputCls = "cell-input text-right !py-1 !px-1.5 !text-[12.5px]";
  const cols = "grid grid-cols-[16px_18px_1fr_54px_54px_54px] gap-1";

  return (
    <div className="panel">
      <div className="px-3 py-2 bg-bone-50 border-b border-ink-200/80">
        <div className="text-[12.5px] font-semibold text-ink-800 mb-1.5">Setbacks per edge (m)</div>
        <div className={`${cols} text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-500`}>
          <span></span>
          <span>#</span>
          <span>Length</span>
          <span className="text-right">Ground</span>
          <span className="text-right">Podium</span>
          <span className="text-right">Tower</span>
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto scroll-thin">
        {plotPoly.map((_, i) => {
          const color = edgeColor(i);
          return (
            <div key={i} className={`${cols} px-3 py-1 items-center text-[12px] tabular-nums border-b border-ink-100 last:border-b-0`}>
              <span className="block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-ink-500">{i + 1}</span>
              <span className="text-ink-700 truncate">{fmt2(lengths[i] ?? 0)} m</span>
              <input
                type="number"
                step={0.5}
                min={0}
                className={inputCls}
                value={Number((groundEdges[i] ?? groundUni).toFixed(1))}
                onChange={(e) => updateEdge("ground", i, parseFloat(e.target.value) || 0)}
                aria-label={`Ground setback, edge ${i + 1}`}
              />
              <input
                type="number"
                step={0.5}
                min={0}
                className={inputCls}
                value={Number((podiumEdges[i] ?? podiumUni).toFixed(1))}
                onChange={(e) => updateEdge("podium", i, parseFloat(e.target.value) || 0)}
                aria-label={`Podium setback, edge ${i + 1}`}
              />
              <input
                type="number"
                step={0.5}
                min={0}
                className={inputCls}
                value={Number((towerEdges[i] ?? towerUni).toFixed(1))}
                onChange={(e) => updateEdge("tower", i, parseFloat(e.target.value) || 0)}
                aria-label={`Tower setback, edge ${i + 1}`}
              />
            </div>
          );
        })}
      </div>
      <div className={`${cols} px-3 py-2 items-center text-[11.5px] text-ink-600 bg-brand-50/60 border-t border-ink-200/80`}>
        <span></span>
        <span></span>
        <span className="font-medium">All edges →</span>
        <input
          type="number"
          step={0.5}
          min={0}
          className={inputCls}
          value={Number(groundUni.toFixed(1))}
          onChange={(e) => applyUniform("ground", parseFloat(e.target.value) || 0)}
          title="Set every edge to this value for Ground"
        />
        <input
          type="number"
          step={0.5}
          min={0}
          className={inputCls}
          value={Number(podiumUni.toFixed(1))}
          onChange={(e) => applyUniform("podium", parseFloat(e.target.value) || 0)}
          title="Set every edge to this value for Podium"
        />
        <input
          type="number"
          step={0.5}
          min={0}
          className={inputCls}
          value={Number(towerUni.toFixed(1))}
          onChange={(e) => applyUniform("tower", parseFloat(e.target.value) || 0)}
          title="Set every edge to this value for Tower"
        />
      </div>
      <p className="px-3 py-2 text-[11.5px] text-ink-500 leading-snug border-t border-ink-100">
        Basement always follows the plot line. The colour swatch matches the edge in the 3D viewer and on the
        reference plan.
      </p>
    </div>
  );
}

/* ---- Tower design ---- */

/** Blend two hex colours (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Mini elevation of a façade concept, in the chosen glass and metal. */
function FacadePictogram({ style, glass, accent }: { style: TowerFacadeStyle; glass: string; accent: string }) {
  const sky = "#eef3f7";
  const white = "#ffffff";
  const x0 = 40;
  const x1 = 80;
  const top = 8;
  const bottom = 58;
  const rows = Array.from({ length: 8 }, (_, i) => top + 6 + i * 6.2);
  const cols = (step: number) => Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => x0 + i * step);
  return (
    <svg viewBox="0 0 120 64" className="w-full h-14 rounded-md" aria-hidden>
      <rect width="120" height="64" fill={sky} />
      <rect x="0" y="58" width="120" height="6" fill="#dcd6c8" />
      <rect x={x0} y={top} width={x1 - x0} height={bottom - top} rx={style === "frame" ? 1 : 5} fill={glass} />
      {style === "balconies" &&
        rows.map((y) => (
          <g key={y}>
            <rect x={x0 - 4} y={y} width={x1 - x0 + 8} height={1.8} rx={0.9} fill={white} />
            <rect x={x0 - 4} y={y - 2.4} width={x1 - x0 + 8} height={0.8} fill={accent} />
          </g>
        ))}
      {style === "curtain" && (
        <>
          {rows.map((y) => (
            <rect key={y} x={x0} y={y} width={x1 - x0} height={1.6} fill={mix(glass, "#0b1324", 0.45)} />
          ))}
          {cols(4).map((x, i) => (
            <rect key={x} x={x - (i % 4 === 0 ? 0.9 : 0.3)} y={top} width={i % 4 === 0 ? 1.8 : 0.6} height={bottom - top} fill={i % 4 === 0 ? accent : white} opacity={i % 4 === 0 ? 1 : 0.55} />
          ))}
        </>
      )}
      {style === "fins" && (
        <>
          {rows.map((y) => (
            <rect key={y} x={x0} y={y} width={x1 - x0} height={0.9} fill={white} opacity={0.85} />
          ))}
          {cols(4.4).map((x, i) => (
            <rect key={x} x={x - 0.9} y={top} width={1.8 + 0.9 * Math.abs(Math.sin(i * 0.7))} height={bottom - top} fill={accent} />
          ))}
        </>
      )}
      {style === "frame" && (
        <>
          {cols(3.3).map((x) => (
            <rect key={x} x={x - 0.25} y={top} width={0.5} height={bottom - top} fill={white} opacity={0.5} />
          ))}
          {[top, ...rows.filter((_, i) => i % 2 === 1)].map((y) => (
            <rect key={y} x={x0 - 1.5} y={y} width={x1 - x0 + 3} height={2.4} fill={accent} />
          ))}
          {cols(10).map((x) => (
            <rect key={`p${x}`} x={x - 1.3} y={top} width={2.6} height={bottom - top} fill={accent} />
          ))}
        </>
      )}
      {/* crown */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={x0 + 1 + i * 4.75} y={2.5} width={0.9} height={top - 2.5} fill={accent} />
      ))}
      <rect x={x0} y={2} width={x1 - x0} height={1.2} fill={accent} />
    </svg>
  );
}

function SwatchRow<K extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: K;
  options: { id: K; label: string; swatch: string }[];
  onChange: (id: K) => void;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-medium text-ink-600">{label}</span>
        <span className="text-[12px] font-medium text-ink-900">{current?.label}</span>
      </div>
      <div className="flex items-center gap-2.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.label}
              title={o.label}
              onClick={() => onChange(o.id)}
              className={`w-8 h-8 rounded-full grid place-items-center transition-shadow ${
                active ? "ring-2 ring-brand-500 ring-offset-2" : "ring-1 ring-ink-200 hover:ring-ink-400"
              }`}
            >
              <span
                className="w-6 h-6 rounded-full"
                style={{
                  background: `linear-gradient(145deg, ${mix(o.swatch, "#ffffff", 0.45)} 0%, ${o.swatch} 55%, ${mix(o.swatch, "#000000", 0.25)} 100%)`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  label, hint, checked, disabled, onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-bone-50 transition-colors disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-medium text-ink-900">{label}</span>
        <span className="block text-[11.5px] text-ink-500 leading-snug">{hint}</span>
      </span>
      <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${checked && !disabled ? "bg-brand-600" : "bg-ink-200"}`}>
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

function TowerDesignPanel({
  params, onPatch, hasGround, hasPodium,
}: {
  params: FacadeParams;
  onPatch: (p: Partial<FacadeConfig>) => void;
  hasGround: boolean;
  hasPodium: boolean;
}) {
  const designed = params.mode === "residential";
  const glass = GLASSES[params.glass].swatch;
  const accent = ACCENTS[params.accent].swatch;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-ink-800">Façade concept</span>
        <div className="seg">
          <button className="seg-btn !py-0.5" data-active={designed} onClick={() => onPatch({ mode: "residential" })}>
            Designed
          </button>
          <button
            className="seg-btn !py-0.5"
            data-active={!designed}
            onClick={() => onPatch({ mode: "massing" })}
            title="Plain tier volumes with floor lines"
          >
            Plain massing
          </button>
        </div>
      </div>

      <div className={`grid gap-4 transition-opacity ${designed ? "" : "opacity-40 pointer-events-none select-none"}`} aria-disabled={!designed}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Façade concept">
          {FACADE_STYLES.map((f) => {
            const active = params.style === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPatch({ style: f.id, mode: "residential" })}
                className={`text-left rounded-lg p-2 transition-shadow bg-white ${
                  active ? "ring-2 ring-brand-500 shadow-sm" : "ring-1 ring-ink-200 hover:ring-ink-400"
                }`}
              >
                <FacadePictogram style={f.id} glass={glass} accent={accent} />
                <span className="block mt-2 px-0.5 text-[12.5px] font-semibold text-ink-900 leading-tight">{f.label}</span>
                <span className="block px-0.5 mt-0.5 text-[11px] text-ink-500 leading-snug">{f.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SwatchRow
            label="Glass"
            value={params.glass}
            options={(Object.keys(GLASSES) as (keyof typeof GLASSES)[]).map((id) => ({ id, label: GLASSES[id].label, swatch: GLASSES[id].swatch }))}
            onChange={(id) => onPatch({ glass: id })}
          />
          <SwatchRow
            label="Metal"
            value={params.accent}
            options={(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((id) => ({ id, label: ACCENTS[id].label, swatch: ACCENTS[id].swatch }))}
            onChange={(id) => onPatch({ accent: id })}
          />
        </div>

        {params.style === "balconies" && (
          <label className="grid gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-ink-600">Balcony depth</span>
              <span className="text-[12px] font-medium text-ink-900 tabular-nums">{params.balconyDepthM.toFixed(1)} m</span>
            </span>
            <input
              type="range"
              min={1.2}
              max={3.5}
              step={0.1}
              value={params.balconyDepthM}
              onChange={(e) => onPatch({ balconyDepthM: parseFloat(e.target.value) })}
              className="w-full accent-[#0d7f69]"
            />
          </label>
        )}

        <div className="panel divide-y divide-ink-100">
          <ToggleRow
            label="Rounded corners"
            hint="Soft, sculpted tower corners"
            checked={params.roundedCorners}
            onChange={(v) => onPatch({ roundedCorners: v })}
          />
          <ToggleRow
            label="Crown & sky pool"
            hint="Crown screen over a rooftop pool and lounge"
            checked={params.crown}
            onChange={(v) => onPatch({ crown: v })}
          />
          <ToggleRow
            label="Lobby & entrance canopy"
            hint="Glazed ground floor with a drop-off canopy"
            checked={params.entrance}
            disabled={!hasGround}
            onChange={(v) => onPatch({ entrance: v })}
          />
          <ToggleRow
            label="Podium screen"
            hint="Metal fins screening the podium car park"
            checked={params.groundPodiumTreatment === "fins"}
            disabled={!hasPodium}
            onChange={(v) => onPatch({ groundPodiumTreatment: v ? "fins" : "massing" })}
          />
        </div>
      </div>

      <p className="text-[11.5px] text-ink-500 leading-snug">
        Visual only — areas and ratios never change. The Diagram style shows plain tier colours.
      </p>
    </div>
  );
}

function PodiumAmenitiesPanel({
  hasDeck, deckKind, pool, lounge, fit, onPatch,
}: {
  hasDeck: boolean;
  deckKind: "podium" | "ground";
  pool: boolean;
  lounge: boolean;
  fit: { pool: boolean; lounge: boolean };
  onPatch: (p: { podiumPool?: boolean; podiumLoungeBbq?: boolean }) => void;
}) {
  const deckLabel = deckKind === "podium" ? "podium" : "ground floor";
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="text-[12.5px] font-semibold text-ink-800">Roof amenities</span>
      </div>
      <div className="p-3 grid gap-2">
        <label className={`flex items-center gap-2 text-[13px] ${hasDeck ? "text-ink-900" : "text-ink-400"}`}>
          <input
            type="checkbox"
            checked={pool}
            disabled={!hasDeck}
            onChange={(e) => onPatch({ podiumPool: e.target.checked })}
          />
          Swimming pool
        </label>
        {pool && hasDeck && !fit.pool && (
          <p className="text-[11.5px] text-amber-800 leading-snug pl-5 -mt-1">
            No room on the {deckLabel} deck for a pool — the ring between the tower and the {deckLabel}
            edge is too narrow. Increase Tower setback or reduce {deckKind === "podium" ? "Podium" : "Ground"} setback per edge.
          </p>
        )}
        <label className={`flex items-center gap-2 text-[13px] ${hasDeck ? "text-ink-900" : "text-ink-400"}`}>
          <input
            type="checkbox"
            checked={lounge}
            disabled={!hasDeck}
            onChange={(e) => onPatch({ podiumLoungeBbq: e.target.checked })}
          />
          Lounge &amp; BBQ terrace
        </label>
        {lounge && hasDeck && !fit.lounge && (
          <p className="text-[11.5px] text-amber-800 leading-snug pl-5 -mt-1">
            No room on the {deckLabel} deck for a lounge terrace — same fix: widen the ring by
            adjusting the Tower / {deckKind === "podium" ? "Podium" : "Ground"} setbacks per edge.
          </p>
        )}
        <p className="text-[11.5px] text-ink-500 leading-snug">
          {hasDeck
            ? `Placed on the ${deckLabel} roof ring exposed once the (further set back) tower rises above it — only if there is enough clear depth.`
            : "Add ground or podium floors in Setup → Floor breakdown to unlock roof amenities."}
        </p>
      </div>
    </div>
  );
}

function TowerOffset({
  dx, dy, onPatch,
}: {
  dx: number;
  dy: number;
  onPatch: (p: Partial<ReturnType<typeof useProject>>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="text-[12.5px] font-semibold text-ink-800">Tower position offset (m)</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <Field label="X (right +)">
          <input
            type="number"
            step={0.5}
            className="cell-input text-right"
            value={Number(dx.toFixed(2))}
            onChange={(e) => onPatch({ towerOffsetXM: parseFloat(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Y (up +)">
          <input
            type="number"
            step={0.5}
            className="cell-input text-right"
            value={Number(dy.toFixed(2))}
            onChange={(e) => onPatch({ towerOffsetYM: parseFloat(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <p className="px-3 pb-3 text-[11.5px] text-ink-500 leading-snug">
        Shift the tower footprint after the setback offset. Leave at 0 for a centred tower.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Plot geometry                                 */
/* -------------------------------------------------------------------------- */

function RectangularInputs({
  project, patch, placeholder,
}: {
  project: ReturnType<typeof useProject>;
  patch: (p: Partial<ReturnType<typeof useProject>>) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frontage (m)">
          <NumInput value={project.plotFrontage} onChange={(v) => patch({ plotFrontage: v })} placeholder={placeholder} />
        </Field>
        <Field label="Depth (m)">
          <NumInput value={project.plotDepth} onChange={(v) => patch({ plotDepth: v })} placeholder={placeholder} />
        </Field>
      </div>
      <p className="text-[11.5px] text-ink-500 mt-2">
        Empty fields fall back to a square derived from plot area.
      </p>
    </div>
  );
}

function PolygonInputs({
  vertices, onUpdate, onAddAfter, onDelete, onRecentre,
}: {
  vertices: Point[];
  onUpdate: (i: number, p: Partial<Point>) => void;
  onAddAfter: (i: number) => void;
  onDelete: (i: number) => void;
  onRecentre: () => void;
}) {
  const lengths = edgeLengths(vertices);
  const perimeter = polygonPerimeter(vertices);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-medium text-ink-600">Vertices (m)</div>
        <button
          onClick={onRecentre}
          className="text-[12px] font-medium text-brand-700 hover:text-brand-900"
          title="Re-centre the polygon at the origin"
        >Centre</button>
      </div>
      <div className="panel">
        <div className="grid grid-cols-[24px_1fr_1fr_76px_24px] gap-1 px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-500 bg-bone-50 border-b border-ink-200/80">
          <span>#</span><span>X</span><span>Y</span><span className="text-right">Edge →</span><span></span>
        </div>
        <div className="max-h-[240px] overflow-y-auto scroll-thin">
          {vertices.map((v, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_76px_24px] gap-1 px-2 py-1 items-center border-b border-ink-100 last:border-b-0">
              <span className="text-[11px] text-ink-500 tabular-nums">{i + 1}</span>
              <input
                type="number"
                step={0.01}
                className="cell-input text-right !py-1 !px-1.5"
                value={v.x}
                onChange={(e) => onUpdate(i, { x: parseFloat(e.target.value) || 0 })}
              />
              <input
                type="number"
                step={0.01}
                className="cell-input text-right !py-1 !px-1.5"
                value={v.y}
                onChange={(e) => onUpdate(i, { y: parseFloat(e.target.value) || 0 })}
              />
              <span className="text-right text-[11px] text-ink-700 tabular-nums" title={`Length to vertex ${((i + 1) % vertices.length) + 1}`}>
                {fmt2(lengths[i] ?? 0)} m
              </span>
              <button
                onClick={() => onDelete(i)}
                className="text-ink-400 hover:text-red-700 text-base leading-none"
                title="Delete vertex"
                aria-label="Delete vertex"
              >×</button>
              <span></span>
              <span className="col-span-3 -mt-0.5 -mb-0.5">
                <button
                  onClick={() => onAddAfter(i)}
                  className="block w-full rounded text-[10.5px] text-ink-400 hover:text-brand-700 hover:bg-brand-50 py-0.5"
                  title="Insert vertex after this one"
                >+ insert vertex here</button>
              </span>
              <span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[11.5px] text-ink-500 flex justify-between">
        <span>{vertices.length} vertices</span>
        <span className="tabular-nums">Perimeter: {fmt2(perimeter)} m</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Small helpers                                 */
/* -------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11.5px] font-medium text-ink-600">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value, onChange, step = 1, placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      min={0}
      className="cell-input text-right"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") onChange(undefined);
        else {
          const n = parseFloat(raw);
          onChange(Number.isFinite(n) && n >= 0 ? n : undefined);
        }
      }}
    />
  );
}

function HeroStat({ label, value, unit, title }: { label: string; value: string; unit?: string; title?: string }) {
  return (
    <div className="rounded-lg bg-bone-50 ring-1 ring-inset ring-ink-200/70 px-3 py-2.5" title={title}>
      <div className="text-[11.5px] font-medium text-ink-500 mb-1">{label}</div>
      <div className="text-ink-900 text-[22px] font-semibold leading-none tracking-tight">
        {value}
        {unit && <span className="text-[12px] font-medium text-ink-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium text-ink-500">{label}</div>
      <div className="text-ink-900 tabular-nums text-[13.5px]">{value}</div>
    </div>
  );
}

function Collapsible({
  title, defaultOpen, children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="panel group" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-3 py-2 bg-bone-50 text-[12.5px] font-semibold text-ink-800 hover:bg-bone-100 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-ink-400 text-[14px] leading-none transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="grid gap-4 p-3 border-t border-ink-200/80">{children}</div>
    </details>
  );
}
