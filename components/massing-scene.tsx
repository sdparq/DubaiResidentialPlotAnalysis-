"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Edges,
  Environment,
  Grid,
  Html,
  Lightformer,
  Line,
  OrbitControls,
  Sky,
} from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Point } from "@/lib/geom";
import { isCounterClockwise, offsetPolygon, polygonBBox, polygonCentroid } from "@/lib/geom";
import type { Volume } from "@/lib/massing";
import { planPodiumAmenities, type PlacedAmenity } from "@/lib/podium-amenities";
import { sunDirectionWorld } from "@/lib/sun";

/** "iso" is kept as an alias of "aerial" for older callers. */
export type ViewPresetKind = "iso" | "aerial" | "street" | "front" | "top";
/** model = white architectural model · diagram = colour by tier · realistic = Dubai daylight. */
export type SceneStyle = "model" | "diagram" | "realistic";
/** Renders a fresh frame and resolves with it as a PNG data-URL; `scale` supersamples the export. */
export type CaptureFn = (opts?: { scale?: number }) => Promise<string | null>;

export interface SunInput {
  azimuthDeg: number;
  altitudeDeg: number;
}

/** Resolved parameters for the modelled residential facade. */
export interface FacadeParams {
  mode: "massing" | "residential";
  panelWidthM: number;
  balconyDepthM: number;
  balconyEveryNBays: number;
  /** Fraction (0–1) of facade cells that get a solid precast panel instead of glazing. */
  solidPanelRatio: number;
  /** "rhythm" = balconies stack in columns on every Nth bay; "random" = scattered per cell with 1/N probability. */
  balconyLayout: "rhythm" | "random";
  /** Seed for the deterministic random pattern. */
  patternSeed: number;
  /** Treatment for the Ground + Podium tiers; "fins" adds a vertical louvre screen in front of the solid volume. */
  groundPodiumTreatment: "massing" | "fins";
  finSpacingM: number;
  finWidthM: number;
  finDepthM: number;
  /** Model a swimming pool on the podium roof deck, only if it fits. */
  podiumPool: boolean;
  /** Model a lounge + BBQ terrace on the podium roof deck, only if it fits. */
  podiumLoungeBbq: boolean;
}

export const SIDEWALK_W = 3; // sidewalk ring width around the plot (m)
export const ROAD_W = 8;     // road ring width beyond the sidewalk (m)

type TierKind = NonNullable<Volume["kind"]>;

interface TierLook {
  fill: string;
  edge: string;
  opacity: number;
  roughness: number;
  metalness: number;
}

export interface FacadeLook {
  glass: string;
  glassOpacity: number;
  glassRoughness: number;
  glassMetalness: number;
  slab: string;
  mullion: string;
  solidLight: string;
  solidDark: string;
  rail: string;
  railOpacity: number;
  balcony: string;
}

export interface AmenityLook {
  water: string;
  rim: string;
  lounger: string;
  bbq: string;
}

interface ScenePalette {
  sky: boolean;
  bgTop: string;
  bgBottom: string;
  fog: string;
  ground: string;
  grid: { cell: string; section: string } | null;
  road: string;
  roadLine: string;
  sidewalk: string;
  plot: string;
  plotLine: string;
  tiers: Record<TierKind, TierLook>;
  edgeOpacity: number;
  floorLine: string;
  floorLineOpacity: number;
  facade: FacadeLook;
  fins: string;
  amenity: AmenityLook;
  planting: { trunk: string; leaf: string; palmLeaf: string } | null;
  env: number;
  /** Light-former colours of the reflection environment: sky dome, key, fill, ground bounce. */
  envColors: { top: string; key: string; fill: string; bottom: string };
  sun: { intensity: number; color: string };
  hemi: { sky: string; ground: string; intensity: number };
  contactShadow: number;
  /** Diagram style ignores the façade / fin treatments and shows plain tier volumes. */
  plainVolumes: boolean;
}

const MODEL_FACADE: FacadeLook = {
  glass: "#b3c3cf",
  glassOpacity: 0.94,
  glassRoughness: 0.08,
  glassMetalness: 0.3,
  slab: "#f6f5f1",
  mullion: "#efeeea",
  solidLight: "#f4f3ef",
  solidDark: "#dddad3",
  rail: "#cbd8df",
  railOpacity: 0.55,
  balcony: "#f3f2ee",
};

const REAL_FACADE: FacadeLook = {
  glass: "#6f8e9c",
  glassOpacity: 0.93,
  glassRoughness: 0.06,
  glassMetalness: 0.55,
  slab: "#efebe3",
  mullion: "#d9d6cf",
  solidLight: "#ece6d9",
  solidDark: "#b9ad96",
  rail: "#a8c4cd",
  railOpacity: 0.45,
  balcony: "#ebe7df",
};

const NEUTRAL_SITE = {
  sky: false,
  bgTop: "#f9fafc",
  bgBottom: "#e3e8ee",
  fog: "#e6eaef",
  ground: "#eceff3",
  grid: { cell: "#e0e5eb", section: "#cfd6df" },
  road: "#d7dce2",
  roadLine: "#f8f9fb",
  sidewalk: "#e5e8ec",
  plot: "#f7f7f5",
  plotLine: "#7d8699",
};

export const PALETTES: Record<SceneStyle, ScenePalette> = {
  model: {
    ...NEUTRAL_SITE,
    tiers: {
      basement: { fill: "#d6dbe2", edge: "#a9b1be", opacity: 0.45, roughness: 0.9, metalness: 0 },
      ground: { fill: "#efede8", edge: "#b3bac5", opacity: 1, roughness: 0.85, metalness: 0 },
      podium: { fill: "#f3f1ec", edge: "#b3bac5", opacity: 1, roughness: 0.85, metalness: 0 },
      tower: { fill: "#f8f7f4", edge: "#b3bac5", opacity: 1, roughness: 0.8, metalness: 0 },
    },
    edgeOpacity: 0.7,
    floorLine: "#aeb6c2",
    floorLineOpacity: 0.55,
    facade: MODEL_FACADE,
    fins: "#e8e5de",
    amenity: { water: "#9fcfe0", rim: "#ebe9e3", lounger: "#e0dcd3", bbq: "#b8b4ab" },
    planting: { trunk: "#d9d5cc", leaf: "#dce3d8", palmLeaf: "#dce3d8" },
    env: 0.6,
    envColors: { top: "#f2f6fb", key: "#fff4e2", fill: "#dfe8f2", bottom: "#d9d2c2" },
    sun: { intensity: 2.3, color: "#fff8ef" },
    hemi: { sky: "#f4f7fb", ground: "#d8d3c7", intensity: 0.55 },
    contactShadow: 0.32,
    plainVolumes: false,
  },
  diagram: {
    ...NEUTRAL_SITE,
    tiers: {
      // Validated categorical trio (orange · blue · aqua) + neutral basement.
      basement: { fill: "#9aa3b2", edge: "#5a6479", opacity: 0.4, roughness: 0.9, metalness: 0 },
      ground: { fill: "#eb6834", edge: "#8f3614", opacity: 1, roughness: 0.75, metalness: 0 },
      podium: { fill: "#2a78d6", edge: "#16427a", opacity: 1, roughness: 0.75, metalness: 0 },
      tower: { fill: "#1baf7a", edge: "#0b5a3e", opacity: 1, roughness: 0.7, metalness: 0 },
    },
    edgeOpacity: 0.55,
    floorLine: "#ffffff",
    floorLineOpacity: 0.6,
    facade: MODEL_FACADE,
    fins: "#e8e5de",
    amenity: { water: "#8fd0e6", rim: "#f1efe9", lounger: "#e4e0d7", bbq: "#b8b4ab" },
    planting: null,
    env: 0.5,
    envColors: { top: "#f2f6fb", key: "#fff4e2", fill: "#dfe8f2", bottom: "#d9d2c2" },
    sun: { intensity: 2.0, color: "#ffffff" },
    hemi: { sky: "#f4f7fb", ground: "#d8d3c7", intensity: 0.7 },
    contactShadow: 0.25,
    plainVolumes: true,
  },
  realistic: {
    sky: true,
    bgTop: "#9cc3e4",
    bgBottom: "#e4e9ec",
    fog: "#dfe6ea",
    ground: "#d6c6a1",
    grid: null,
    road: "#46494f",
    roadLine: "#efe7d2",
    sidewalk: "#d8d1c2",
    plot: "#cdc4b1",
    plotLine: "#8a7f68",
    tiers: {
      basement: { fill: "#bfb6a3", edge: "#7d7462", opacity: 0.35, roughness: 0.9, metalness: 0 },
      ground: { fill: "#e9e4d9", edge: "#a79f8e", opacity: 1, roughness: 0.7, metalness: 0.02 },
      podium: { fill: "#e2dbcd", edge: "#a79f8e", opacity: 1, roughness: 0.7, metalness: 0.02 },
      tower: { fill: "#cfdbe1", edge: "#7f93a0", opacity: 1, roughness: 0.22, metalness: 0.35 },
    },
    edgeOpacity: 0.35,
    floorLine: "#5d6b73",
    floorLineOpacity: 0.35,
    facade: REAL_FACADE,
    fins: "#9a8364",
    amenity: { water: "#3aa6c2", rim: "#e3ddcf", lounger: "#b08d62", bbq: "#3f3d38" },
    planting: { trunk: "#8a7355", leaf: "#4f7a3a", palmLeaf: "#4a7732" },
    env: 0.9,
    envColors: { top: "#8fb8e4", key: "#fff1d6", fill: "#c9dcef", bottom: "#cdbd98" },
    sun: { intensity: 2.7, color: "#fff0d8" },
    hemi: { sky: "#dbe7f3", ground: "#cbbd9c", intensity: 0.55 },
    contactShadow: 0.3,
    plainVolumes: false,
  },
};

/** Default light when the sun study is off: mid-afternoon, from the south-west. */
const DEFAULT_SUN: SunInput = { azimuthDeg: 215, altitudeDeg: 42 };

/** Deterministic per-cell hash → [0,1). Stable across renders for a given seed. */
function cellRand(seed: number, i: number, j: number, salt = 0): number {
  let h = (seed | 0) ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface SceneProps {
  plot: Point[];           // Plot polygon in plot-local metres
  buildable: Point[];      // Buildable polygon (after setbacks)
  /** Volumes that compose the building. Each has its own footprint, height span and optional hole. */
  volumes: Volume[];
  /** Used to draw faint floor-level rings on the primary footprint. */
  floorHeight: number;
  /** Footprint to trace floor lines on (typically the tallest volume's polygon). */
  primaryFootprint?: Point[];
  showFrontMarker?: boolean;
  /** Optional per-edge colors for the plot outline. */
  edgeColors?: string[];
  /** Labels aligned by index with `volumes`, shown as floating chips beside each tier. */
  volumeLabels?: string[];
  /** Show dimension line + tier labels. */
  showAnnotations?: boolean;
  /** Camera preset request; bump `nonce` to re-trigger the same preset. */
  viewPreset?: { kind: ViewPresetKind; nonce: number } | null;
  /** Slow turntable rotation. */
  autoRotate?: boolean;
  /** Receives a function that renders a frame and returns it as a PNG data-URL. */
  captureRef?: MutableRefObject<CaptureFn | null>;
  /** Facade treatment; "residential" models slabs, glazing, mullions and balconies on the tower. */
  facade?: FacadeParams;
  /** Reports whether the requested podium amenities actually found room, so the tab can show a hint. */
  onAmenityFit?: (fit: { pool: boolean; lounge: boolean }) => void;
  /** Visual style of the scene. */
  style?: SceneStyle;
  /** Sun position for the shadow study; null/undefined uses a pleasant default light. */
  sun?: SunInput | null;
  /** Bearing of true north, clockwise from the drawing's +y axis (degrees). */
  northDeg?: number;
  /** Street trees and palms around the plot. */
  showPlanting?: boolean;
  /** "high" adds screen-space ambient occlusion and sharper shadows. */
  quality?: "standard" | "high";
  /** DOM element rotated every frame so it points to true north on screen. */
  compassRef?: RefObject<HTMLElement>;
  /** Changing this re-frames the camera on the model (e.g. the project id). */
  frameKey?: string;
  /** Called when the view comes to rest: an orbit gesture ends or a camera flight lands. */
  onViewSettled?: () => void;
}

interface CameraGoal {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
  fov: number;
  /** Orbit limit to apply: eye-level views need to look up past the horizon. */
  maxPolar: number;
}

const GROUND_POLAR = Math.PI / 2 - 0.02;
const STREET_POLAR = Math.PI * 0.92;

interface FitInfo {
  cx: number;
  cz: number;
  w: number;
  d: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export default function MassingScene(props: SceneProps) {
  const style = props.style ?? "model";
  const palette = PALETTES[style];
  const high = props.quality === "high";
  const topY = props.volumes.reduce((m, v) => Math.max(m, v.toY), 0);
  const bbox = useMemo(() => polygonBBox(props.plot), [props.plot]);
  const maxDim = Math.max(bbox.w, bbox.h, topY, 30);

  return (
    <Canvas
      shadows
      camera={{ position: [maxDim, maxDim, maxDim], fov: 32, near: 1, far: maxDim * 80 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      style={{
        background: palette.sky
          ? `linear-gradient(180deg, ${palette.bgTop} 0%, ${palette.bgBottom} 100%)`
          : `radial-gradient(120% 90% at 50% 0%, ${palette.bgTop} 0%, ${palette.bgBottom} 100%)`,
      }}
    >
      <SceneContents {...props} style={style} palette={palette} high={high} topY={topY} maxDim={maxDim} />
    </Canvas>
  );
}

function SceneContents(
  props: SceneProps & { style: SceneStyle; palette: ScenePalette; high: boolean; topY: number; maxDim: number },
) {
  const {
    plot, buildable, volumes, floorHeight, showFrontMarker, edgeColors, volumeLabels,
    showAnnotations = true, viewPreset, autoRotate, captureRef, facade, onAmenityFit,
    palette, high, topY, maxDim, sun, northDeg = 0, showPlanting = true, compassRef, frameKey, onViewSettled,
  } = props;

  const bbox = useMemo(() => polygonBBox(plot), [plot]);
  const fit: FitInfo = useMemo(() => {
    const ring = SIDEWALK_W + ROAD_W;
    return {
      cx: (bbox.minX + bbox.maxX) / 2,
      cz: -(bbox.minY + bbox.maxY) / 2,
      w: bbox.w,
      d: bbox.h,
      minX: bbox.minX - ring,
      maxX: bbox.maxX + ring,
      minZ: -bbox.maxY - ring,
      maxZ: -bbox.minY + ring,
      topY,
    };
  }, [bbox, topY]);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const goalRef = useRef<CameraGoal | null>(null);
  const composerRef = useRef<EffectComposerImpl | null>(null);

  const sunInput = sun ?? DEFAULT_SUN;
  const sunUp = sunInput.altitudeDeg > 0.5;
  const sunDir = useMemo(() => {
    // Clamp near-zenith suns: a vertical light makes the shadow camera basis degenerate.
    const alt = Math.min(85, Math.max(0.5, sunInput.altitudeDeg));
    return sunDirectionWorld({ azimuthDeg: sunInput.azimuthDeg, altitudeDeg: alt }, northDeg);
  }, [sunInput.azimuthDeg, sunInput.altitudeDeg, northDeg]);
  // Low sun: warmer and dimmer light, like late afternoon in Dubai.
  const low = Math.max(0, Math.min(1, (20 - sunInput.altitudeDeg) / 20));
  const sunColor = useMemo(
    () => new THREE.Color(palette.sun.color).lerp(new THREE.Color("#ffc58a"), low * 0.7),
    [palette.sun.color, low],
  );
  const sunIntensity = sunUp ? palette.sun.intensity * (1 - low * 0.35) : 0;

  return (
    <>
      {palette.sky ? (
        <Sky
          distance={450000}
          sunPosition={[sunDir[0] * 100, Math.max(sunDir[1], 0.02) * 100, sunDir[2] * 100]}
          turbidity={5}
          rayleigh={1.3}
          mieCoefficient={0.004}
          mieDirectionalG={0.82}
        />
      ) : (
        <GradientBackground top={palette.bgTop} bottom={palette.bgBottom} />
      )}
      <fog attach="fog" args={[palette.fog, maxDim * 2.6, maxDim * 9]} />

      {/* Light-former environment for soft sky light and reflections — no network fetches. */}
      {/* Keyed by style: a one-frame environment only re-renders when it remounts. */}
      <Environment key={props.style} resolution={256} frames={1} environmentIntensity={palette.env}>
        <Lightformer intensity={1.1} rotation-x={Math.PI / 2} position={[0, 60, 0]} scale={[200, 200, 1]} color={palette.envColors.top} />
        <Lightformer intensity={2.4} form="rect" position={[80, 40, 60]} scale={[60, 30, 1]} color={palette.envColors.key} target={[0, 0, 0]} />
        <Lightformer intensity={0.7} form="rect" position={[-80, 25, -40]} scale={[90, 30, 1]} color={palette.envColors.fill} target={[0, 0, 0]} />
        <Lightformer intensity={0.4} rotation-x={-Math.PI / 2} position={[0, -10, 0]} scale={[200, 200, 1]} color={palette.envColors.bottom} />
      </Environment>

      <hemisphereLight args={[palette.hemi.sky, palette.hemi.ground, palette.hemi.intensity]} />
      <SunLight dir={sunDir} fit={fit} intensity={sunIntensity} color={sunColor} mapSize={high ? 4096 : 2048} />

      <SiteAndBuilding
        plot={plot}
        buildable={buildable}
        volumes={volumes}
        floorHeight={floorHeight}
        showFrontMarker={showFrontMarker}
        edgeColors={edgeColors}
        volumeLabels={volumeLabels}
        showAnnotations={showAnnotations}
        facade={facade}
        onAmenityFit={onAmenityFit}
        palette={palette}
        topY={topY}
        maxDim={maxDim}
        showPlanting={showPlanting}
        fit={fit}
      />

      <CameraRig
        preset={viewPreset ?? null}
        goalRef={goalRef}
        controlsRef={controlsRef}
        fit={fit}
        frameKey={frameKey}
        northDeg={northDeg}
        compassRef={compassRef}
        onSettled={onViewSettled}
      />
      {captureRef && <CaptureBridge captureRef={captureRef} composerRef={composerRef} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        autoRotate={!!autoRotate}
        autoRotateSpeed={0.6}
        onStart={() => { goalRef.current = null; }}
        onEnd={() => onViewSettled?.()}
        minDistance={4}
        maxDistance={maxDim * 8}
      />

      {high && (
        <EffectComposer ref={composerRef} multisampling={4}>
          <N8AO aoRadius={Math.max(2, Math.min(8, maxDim * 0.03))} intensity={2.2} distanceFalloff={1} quality="medium" halfRes />
        </EffectComposer>
      )}
    </>
  );
}

interface SiteProps {
  plot: Point[];
  buildable: Point[];
  volumes: Volume[];
  floorHeight: number;
  showFrontMarker?: boolean;
  edgeColors?: string[];
  volumeLabels?: string[];
  showAnnotations: boolean;
  facade?: FacadeParams;
  onAmenityFit?: (fit: { pool: boolean; lounge: boolean }) => void;
  palette: ScenePalette;
  topY: number;
  maxDim: number;
  showPlanting: boolean;
  fit: FitInfo;
}

/** Everything that doesn't depend on the sun — memoised so a time-lapse only
 *  moves the light instead of rebuilding the building every frame. */
const SiteAndBuilding = memo(function SiteAndBuilding({
  plot, buildable, volumes, floorHeight, showFrontMarker, edgeColors, volumeLabels,
  showAnnotations, facade, onAmenityFit, palette, topY, maxDim, showPlanting, fit,
}: SiteProps) {
  const facadeActive = !palette.plainVolumes && facade?.mode === "residential";
  const finsActive = !palette.plainVolumes && facade?.groundPodiumTreatment === "fins";

  // The amenity deck is whichever tier sits directly below the tower: podium
  // when there is one, otherwise the ground floor (tower rises straight off it).
  const deckVolume = useMemo(
    () => volumes.find((v) => v.kind === "podium") ?? volumes.find((v) => v.kind === "ground"),
    [volumes],
  );
  const towerVolume = useMemo(() => volumes.find((v) => v.kind === "tower"), [volumes]);
  const wantPool = !!facade?.podiumPool;
  const wantLounge = !!facade?.podiumLoungeBbq;
  const amenityPlan = useMemo(
    () =>
      deckVolume && (wantPool || wantLounge)
        ? planPodiumAmenities(deckVolume.polygon, towerVolume?.polygon ?? [], { pool: wantPool, lounge: wantLounge })
        : { pool: null, lounge: null },
    [deckVolume, towerVolume, wantPool, wantLounge],
  );
  useEffect(() => {
    onAmenityFit?.({
      pool: wantPool ? amenityPlan.pool !== null : true,
      lounge: wantLounge ? amenityPlan.lounge !== null : true,
    });
  }, [amenityPlan, wantPool, wantLounge, onAmenityFit]);

  const bbox = useMemo(() => polygonBBox(plot), [plot]);
  const centroid = useMemo(() => polygonCentroid(plot), [plot]);
  const plotShape = useMemo(() => polyToShape(plot), [plot]);

  // Street context around the plot: a sidewalk ring hugging the plot line,
  // wrapped by a road ring with a dashed centreline. Negative offsets grow outward.
  const sidewalkOuter = useMemo(
    () => (plot.length >= 3 ? offsetPolygon(plot, plot.map(() => -SIDEWALK_W)) : []),
    [plot],
  );
  const roadOuter = useMemo(
    () => (plot.length >= 3 ? offsetPolygon(plot, plot.map(() => -(SIDEWALK_W + ROAD_W))) : []),
    [plot],
  );
  const roadCentreline = useMemo(
    () => (plot.length >= 3 ? closedPoints(offsetPolygon(plot, plot.map(() => -(SIDEWALK_W + ROAD_W / 2))), 0.012) : []),
    [plot],
  );
  const treeLine = useMemo(
    () => (plot.length >= 3 ? offsetPolygon(plot, plot.map(() => -(SIDEWALK_W - 1.1))) : []),
    [plot],
  );
  const plotOutline = useMemo(() => closedPoints(plot, 0.03), [plot]);
  const buildableOutline = useMemo(() => closedPoints(buildable, 0.035), [buildable]);

  const volumeShapes = useMemo(
    () =>
      volumes.map((v) => {
        const s = polyToShape(v.polygon);
        if (s && v.hole && v.hole.length >= 3) {
          const reversed = v.hole.slice().reverse(); // holes need opposite winding
          const path = new THREE.Path();
          path.moveTo(reversed[0].x, reversed[0].y);
          for (let i = 1; i < reversed.length; i++) path.lineTo(reversed[i].x, reversed[i].y);
          path.closePath();
          s.holes.push(path);
        }
        return s;
      }),
    [volumes],
  );

  const floorRings = useMemo(() => {
    if (floorHeight <= 0 || volumes.length === 0) return [];
    const out: { y: number; polygon: Point[]; hole?: Point[]; emphasis: boolean; kind?: Volume["kind"] }[] = [];
    for (const v of volumes) {
      if (v.kind === "basement") continue;
      // Floor levels inside this volume, excluding top and bottom (those are mesh edges)
      const startFloor = Math.floor(v.fromY / floorHeight) + 1;
      const endFloor = Math.ceil(v.toY / floorHeight) - 1;
      for (let f = startFloor; f <= endFloor; f++) {
        const y = f * floorHeight;
        if (y <= v.fromY + 1e-3 || y >= v.toY - 1e-3) continue;
        out.push({ y, polygon: v.polygon, hole: v.hole, emphasis: f % 5 === 0, kind: v.kind });
      }
    }
    return out;
  }, [volumes, floorHeight]);

  // Annotation anchors: dimension line on the right of the plot, tier chips on the left.
  const annotPad = Math.max(2.5, Math.max(bbox.w, bbox.h) * 0.08);
  const dimX = bbox.maxX + annotPad;
  const labelX = bbox.minX - annotPad;
  const tierBoundaries = useMemo(() => {
    const ys = new Set<number>([0]);
    volumes.forEach((v) => {
      if (v.fromY >= 0) ys.add(v.fromY);
      if (v.toY > 0) ys.add(v.toY);
    });
    return Array.from(ys).sort((a, b) => a - b);
  }, [volumes]);

  return (
    <>
      {/* Ground plane — well below the site layers so they never z-fight at a distance. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fit.cx, -0.12, fit.cz]} receiveShadow>
        {/* Big enough that its rim sits in the fog at the horizon, never inside the frame. */}
        <circleGeometry args={[maxDim * 60, 96]} />
        <meshStandardMaterial color={palette.ground} roughness={1} />
      </mesh>
      {palette.grid && (
        <Grid
          args={[maxDim * 4, maxDim * 4]}
          cellSize={1}
          cellThickness={0.35}
          cellColor={palette.grid.cell}
          sectionSize={10}
          sectionThickness={0.8}
          sectionColor={palette.grid.section}
          fadeDistance={maxDim * 3.2}
          fadeStrength={1.6}
          position={[fit.cx, -0.06, fit.cz]}
          infiniteGrid
        />
      )}

      {/* Street context: road ring, dashed centreline, then the sidewalk ring */}
      <GroundRing inner={sidewalkOuter} outer={roadOuter} y={0.004} color={palette.road} roughness={0.95} />
      {roadCentreline.length >= 3 && (
        <Line
          points={roadCentreline}
          color={palette.roadLine}
          lineWidth={1.5}
          dashed
          dashSize={2.2}
          gapSize={2.2}
          transparent
          opacity={0.9}
        />
      )}
      <GroundRing inner={plot} outer={sidewalkOuter} y={0.008} color={palette.sidewalk} roughness={0.95} />

      {plotShape && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <shapeGeometry args={[plotShape]} />
          <meshStandardMaterial color={palette.plot} roughness={0.95} />
        </mesh>
      )}

      {/* Soft ambient-occlusion style grounding under the building */}
      <ContactShadows
        position={[fit.cx, 0.02, fit.cz]}
        scale={Math.max(bbox.w, bbox.h) * 2.2}
        far={Math.max(8, Math.min(topY, 60) * 0.5)}
        blur={2.6}
        opacity={palette.contactShadow}
        resolution={1024}
        color="#1c2433"
      />

      {/* Plot outline */}
      {edgeColors && edgeColors.length === plot.length ? (
        plot.map((p, i) => {
          const next = plot[(i + 1) % plot.length];
          const points: [number, number, number][] = [[p.x, 0.03, -p.y], [next.x, 0.03, -next.y]];
          return <Line key={`edge-${i}`} points={points} color={edgeColors[i]} lineWidth={3} />;
        })
      ) : (
        <Line points={plotOutline} color={palette.plotLine} lineWidth={1.4} dashed dashSize={1.2} gapSize={0.8} />
      )}
      {buildable.length >= 3 && palette.plainVolumes && (
        <Line points={buildableOutline} color="#5a6479" lineWidth={1} transparent opacity={0.5} />
      )}

      {/* Volumes */}
      {volumes.map((v, i) => {
        const shape = volumeShapes[i];
        const depth = v.toY - v.fromY;
        if (!shape || depth <= 0) return null;
        if (facadeActive && facade && v.kind === "tower") {
          return (
            <ResidentialFacade
              key={`fac-${i}`}
              polygon={v.polygon}
              hole={v.hole}
              fromY={v.fromY}
              toY={v.toY}
              floorHeight={floorHeight}
              params={facade}
              look={palette.facade}
            />
          );
        }
        const look = palette.tiers[v.kind ?? "tower"];
        const showFins = finsActive && facade && (v.kind === "ground" || v.kind === "podium");
        return (
          <group key={i}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, v.fromY, 0]} castShadow receiveShadow>
              <extrudeGeometry args={[shape, { depth, bevelEnabled: false }]} />
              <meshPhysicalMaterial
                color={look.fill}
                roughness={look.roughness}
                metalness={look.metalness}
                clearcoat={v.kind === "tower" && !palette.plainVolumes ? 0.3 : 0}
                clearcoatRoughness={0.6}
                transparent={look.opacity < 1}
                opacity={look.opacity}
                depthWrite={look.opacity >= 1}
              />
              <Edges color={look.edge} threshold={15} transparent opacity={palette.edgeOpacity} />
            </mesh>
            {showFins && (
              <VerticalFinScreen polygon={v.polygon} fromY={v.fromY} toY={v.toY} params={facade!} color={palette.fins} />
            )}
          </group>
        );
      })}

      {/* Roof amenities: pool and/or lounge + BBQ terrace, on the ring of
          podium (or ground, if there's no podium) deck left exposed once the
          further-set-back tower rises above it. */}
      {deckVolume && (
        <PodiumAmenities pool={amenityPlan.pool} lounge={amenityPlan.lounge} toY={deckVolume.toY} look={palette.amenity} />
      )}

      {/* Floor-level rings around each volume — emphasised every 5 floors.
          The modelled facade draws real slabs on the tower, so its rings are skipped. */}
      {floorRings
        .filter((r) => !(facadeActive && r.kind === "tower"))
        .map((r, i) => (
          <FloorRing
            key={`fr-${i}`}
            y={r.y}
            polygon={r.polygon}
            hole={r.hole}
            emphasis={r.emphasis}
            color={palette.floorLine}
            opacity={palette.floorLineOpacity}
          />
        ))}

      {showPlanting && palette.planting && treeLine.length >= 3 && (
        <SitePlanting ring={treeLine} look={palette.planting} />
      )}

      {/* Annotations: height dimension line + tier chips */}
      {showAnnotations && topY > 0 && (
        <HeightDimension x={dimX} z={-centroid.y} topY={topY} boundaries={tierBoundaries} maxDim={maxDim} />
      )}
      {showAnnotations && volumeLabels && volumeLabels.length === volumes.length &&
        volumes.map((v, i) => {
          const label = volumeLabels[i];
          if (!label) return null;
          const midY = (v.fromY + v.toY) / 2;
          return (
            <Html
              key={`vl-${i}`}
              position={[labelX, midY, -centroid.y]}
              center
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-md bg-white/90 ring-1 ring-black/10 text-[10.5px] font-medium text-[#233049] whitespace-nowrap shadow-sm">
                <span className="w-2 h-2 rounded-sm" style={{ background: PALETTES.diagram.tiers[v.kind ?? "tower"].fill }} />
                {label}
              </div>
            </Html>
          );
        })}

      {showFrontMarker && <FrontMarker plot={plot} />}
    </>
  );
});

/** Screen-space vertical gradient behind everything (captured with the frame). */
function GradientBackground({ top, bottom }: { top: string; bottom: string }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const prev = scene.background;
    scene.background = tex;
    return () => {
      scene.background = prev;
      tex.dispose();
    };
  }, [scene, top, bottom]);
  return null;
}

/**
 * Directional "sun" whose orthographic shadow camera is fitted to the site and
 * to the shadows it throws, so shadows stay crisp from a 3-storey block to a
 * 60-storey tower at any sun angle.
 */
function SunLight({
  dir, fit, intensity, color, mapSize,
}: {
  dir: [number, number, number];
  fit: FitInfo;
  intensity: number;
  color: THREE.Color;
  mapSize: number;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const L = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    const c = new THREE.Vector3(fit.cx, 0, fit.cz);
    const span = Math.max(fit.maxX - fit.minX, fit.maxZ - fit.minZ, fit.topY, 20);
    const dist = span * 3 + fit.topY * 2;
    light.position.copy(c).addScaledVector(L, dist);
    target.position.copy(c);
    target.updateMatrixWorld();
    light.target = target;
    light.updateMatrixWorld();

    // Camera basis as Object3D.lookAt builds it for a camera looking from the light to the target.
    const zc = L.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const xc = new THREE.Vector3().crossVectors(up, zc).normalize();
    const yc = new THREE.Vector3().crossVectors(zc, xc);

    const pts: THREE.Vector3[] = [];
    const ys = [0, Math.max(0.1, fit.topY)];
    for (const x of [fit.minX, fit.maxX]) {
      for (const z of [fit.minZ, fit.maxZ]) {
        for (const y of ys) pts.push(new THREE.Vector3(x, y, z));
        // Where the top of the building lands on the ground (shadow tip),
        // capped so a grazing sun doesn't stretch the map over kilometres.
        if (L.y > 0.02) {
          let sx = (-L.x * fit.topY) / L.y;
          let sz = (-L.z * fit.topY) / L.y;
          const len = Math.hypot(sx, sz);
          const cap = fit.topY * 5 + 40;
          if (len > cap) {
            sx *= cap / len;
            sz *= cap / len;
          }
          pts.push(new THREE.Vector3(x + sx, 0, z + sz));
        }
      }
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minD = Infinity, maxD = -Infinity;
    const rel = new THREE.Vector3();
    for (const p of pts) {
      rel.subVectors(p, light.position);
      const x = rel.dot(xc);
      const y = rel.dot(yc);
      const d = -rel.dot(zc);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    }
    const m = 4;
    const cam = light.shadow.camera;
    cam.left = minX - m;
    cam.right = maxX + m;
    cam.bottom = minY - m;
    cam.top = maxY + m;
    cam.near = Math.max(0.5, minD - m * 4);
    cam.far = maxD + m * 4;
    cam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }, [dir, fit, target]);

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        castShadow
        intensity={intensity}
        color={color}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
    </>
  );
}

function fitDistance(radius: number, fovDeg: number, aspect: number) {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return radius / Math.sin(Math.min(v, h) / 2);
}

function presetGoal(kind: ViewPresetKind, f: FitInfo, aspect: number): CameraGoal {
  const radius = 0.5 * Math.sqrt(f.w * f.w + f.d * f.d + f.topY * f.topY) + 4;
  const tall = f.topY > Math.max(f.w, f.d);
  if (kind === "top") {
    const siteR = 0.5 * Math.hypot(f.maxX - f.minX, f.maxZ - f.minZ);
    const dist = fitDistance(siteR, 30, aspect) * 0.95 + f.topY;
    return {
      pos: new THREE.Vector3(f.cx, dist, f.cz + dist * 0.01),
      tgt: new THREE.Vector3(f.cx, 0, f.cz),
      fov: 30,
      maxPolar: GROUND_POLAR,
    };
  }
  if (kind === "front") {
    const fov = 30;
    const tgt = new THREE.Vector3(f.cx, f.topY * 0.48, f.cz);
    const dist = fitDistance(radius, fov, aspect) * 1.18;
    const el = (6 * Math.PI) / 180;
    return { pos: new THREE.Vector3(f.cx, tgt.y + Math.sin(el) * dist, f.cz + Math.cos(el) * dist), tgt, fov, maxPolar: GROUND_POLAR };
  }
  if (kind === "street") {
    const fov = 58;
    // Across the road from the front-left corner, at eye height, looking up.
    const standoff = SIDEWALK_W + ROAD_W + 5;
    let px = f.cx - f.w * 0.55 - standoff * 0.6;
    let pz = f.cz + f.d / 2 + standoff;
    const minD = f.topY * 0.72 + Math.hypot(f.w, f.d) * 0.35;
    const dx = px - f.cx;
    const dz = pz - f.cz;
    const d = Math.hypot(dx, dz);
    if (d < minD) {
      px = f.cx + (dx / d) * minD;
      pz = f.cz + (dz / d) * minD;
    }
    return {
      pos: new THREE.Vector3(px, 1.7, pz),
      tgt: new THREE.Vector3(f.cx, Math.max(4, f.topY * 0.52), f.cz),
      fov,
      maxPolar: STREET_POLAR,
    };
  }
  // aerial / iso — from the south-east, lower for towers so the façade reads.
  const fov = 32;
  const az = (38 * Math.PI) / 180;
  const el = ((tall ? 22 : 32) * Math.PI) / 180;
  // Headroom for the viewer's floating toolbars at the top and bottom.
  const tgt = new THREE.Vector3(f.cx, f.topY * 0.42, f.cz);
  const dist = fitDistance(radius, fov, aspect) * 1.22;
  return {
    pos: new THREE.Vector3(
      tgt.x + Math.cos(el) * Math.sin(az) * dist,
      tgt.y + Math.sin(el) * dist,
      tgt.z + Math.cos(el) * Math.cos(az) * dist,
    ),
    tgt,
    fov,
    maxPolar: GROUND_POLAR,
  };
}

/** Frames the model, flies to requested presets and keeps the compass pointing north. */
function CameraRig({
  preset, goalRef, controlsRef, fit, frameKey, northDeg, compassRef, onSettled,
}: {
  preset: { kind: ViewPresetKind; nonce: number } | null;
  goalRef: MutableRefObject<CameraGoal | null>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  fit: FitInfo;
  frameKey?: string;
  northDeg: number;
  compassRef?: RefObject<HTMLElement>;
  onSettled?: () => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const framed = useRef<string | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  // Snap to the aerial view on first mount and whenever the project changes.
  useEffect(() => {
    const key = frameKey ?? "default";
    const controls = controlsRef.current;
    if (framed.current === key || !controls || size.width === 0) return;
    framed.current = key;
    const g = presetGoal("aerial", fit, aspect);
    camera.position.copy(g.pos);
    camera.fov = g.fov;
    camera.updateProjectionMatrix();
    controls.maxPolarAngle = g.maxPolar;
    controls.target.copy(g.tgt);
    controls.update();
    goalRef.current = null;
    onSettled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, size.width > 0, controlsRef.current]);

  useEffect(() => {
    if (!preset) return;
    const g = presetGoal(preset.kind, fit, aspect);
    // Relaxing the orbit limit is safe right away; tightening it waits until
    // the flight lands, or the controls would yank the camera mid-air.
    const controls = controlsRef.current;
    if (controls && g.maxPolar > controls.maxPolarAngle) controls.maxPolarAngle = g.maxPolar;
    goalRef.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce, preset?.kind]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const g = goalRef.current;
    if (g && controls) {
      // Time-based damping so the flight speed is framerate-independent.
      const k = 1 - Math.exp(-5 * Math.min(delta, 0.1));
      camera.position.lerp(g.pos, k);
      controls.target.lerp(g.tgt, k);
      camera.fov += (g.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
      if (camera.position.distanceTo(g.pos) < 0.05 && Math.abs(camera.fov - g.fov) < 0.05) {
        camera.position.copy(g.pos);
        controls.target.copy(g.tgt);
        camera.fov = g.fov;
        camera.updateProjectionMatrix();
        controls.maxPolarAngle = g.maxPolar;
        goalRef.current = null;
        onSettled?.();
      }
      controls.update();
    }
    // Never let the camera sink below the ground plane.
    if (camera.position.y < 0.6) camera.position.y = 0.6;
    const el = compassRef?.current;
    if (el) {
      camera.getWorldDirection(tmp);
      const viewAz = (Math.atan2(tmp.x, -tmp.z) * 180) / Math.PI;
      el.style.transform = `rotate(${northDeg - viewAz}deg)`;
    }
  });

  return null;
}

/**
 * Exposes a capture function that renders one frame (optionally supersampled)
 * and returns it as a PNG. The resize → render → read → restore sequence runs
 * synchronously in a single task, so no React re-render or R3F frame can slip
 * in between (R3F re-applies the Canvas dpr prop whenever the Canvas renders).
 */
function CaptureBridge({
  captureRef, composerRef,
}: {
  captureRef: MutableRefObject<CaptureFn | null>;
  composerRef: MutableRefObject<EffectComposerImpl | null>;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const size = new THREE.Vector2();
    captureRef.current = async (opts) => {
      // Let any pending React/R3F update land first.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const canvas = gl.domElement;
      const base = gl.getPixelRatio();
      const scale = Math.max(1, Math.min(3, opts?.scale ?? 1));
      const maxTex = gl.capabilities.maxTextureSize || 4096;
      gl.getSize(size);
      const target = Math.max(base, Math.min(base * scale, maxTex / Math.max(1, size.x), maxTex / Math.max(1, size.y)));
      const composer = composerRef.current;
      const annotations = scene.getObjectByName("annotations");
      const annotationsVisible = annotations?.visible ?? false;
      if (annotations) annotations.visible = false;
      try {
        if (target !== base) {
          gl.setPixelRatio(target);
          composer?.setSize(size.x, size.y);
        }
        if (composer) composer.render();
        else gl.render(scene, camera);
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      } finally {
        if (annotations) annotations.visible = annotationsVisible;
        if (target !== base) {
          gl.setPixelRatio(base);
          composer?.setSize(size.x, size.y);
        }
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, scene, camera, captureRef, composerRef]);
  return null;
}

function HeightDimension({
  x, z, topY, boundaries, maxDim,
}: {
  x: number;
  z: number;
  topY: number;
  boundaries: number[];
  maxDim: number;
}) {
  const tick = Math.max(0.6, maxDim * 0.012);
  const color = "#5a6479";
  // Named so captures can hide it: its HTML label never makes it into a PNG.
  return (
    <group name="annotations">
      <Line points={[[x, 0, z], [x, topY, z]]} color={color} lineWidth={1} transparent opacity={0.7} />
      {boundaries.map((y, i) => (
        <Line key={`tick-${i}`} points={[[x - tick, y, z], [x + tick, y, z]]} color={color} lineWidth={1} transparent opacity={0.7} />
      ))}
      <Html position={[x, topY, z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className="px-2 py-0.5 -translate-y-4 rounded-md bg-[#0b1324]/90 text-[11px] font-semibold tabular-nums text-white whitespace-nowrap shadow-md">
          +{topY.toFixed(1)} m
        </div>
      </Html>
    </group>
  );
}

function FloorRing({
  y, polygon, hole, emphasis, color, opacity,
}: {
  y: number;
  polygon: Point[];
  hole?: Point[];
  emphasis: boolean;
  color: string;
  opacity: number;
}) {
  const width = emphasis ? 1.6 : 1;
  const alpha = emphasis ? Math.min(1, opacity * 1.5) : opacity;
  // Push the ring slightly outside the facade (or inside for holes) so it
  // hugs the visible surface without z-fighting, and stays depth-tested —
  // rings read as facade floor lines instead of an x-ray overlay.
  const ringPoints = (poly: Point[], grow: number): [number, number, number][] => {
    const c = polygonCentroid(poly);
    const shifted = poly.map((p) => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * grow, y: p.y + (dy / len) * grow };
    });
    const r: [number, number, number][] = shifted.map((p) => [p.x, y, -p.y] as [number, number, number]);
    r.push([shifted[0].x, y, -shifted[0].y]);
    return r;
  };
  return (
    <>
      <Line points={ringPoints(polygon, 0.06)} color={color} lineWidth={width} transparent opacity={alpha} />
      {hole && hole.length >= 3 && (
        <Line points={ringPoints(hole, -0.06)} color={color} lineWidth={width} transparent opacity={alpha} />
      )}
    </>
  );
}

/** Flat ring between two nested polygons (outer minus inner), lying on the ground plane. */
export function GroundRing({
  inner, outer, y, color, roughness = 1,
}: {
  inner: Point[];
  outer: Point[];
  y: number;
  color: string;
  roughness?: number;
}) {
  const shape = useMemo(() => {
    if (outer.length < 3) return null;
    const s = polyToShape(outer);
    if (!s) return null;
    if (inner.length >= 3) {
      const src = inner.slice().reverse(); // holes need opposite winding
      const path = new THREE.Path();
      path.moveTo(src[0].x, src[0].y);
      for (let i = 1; i < src.length; i++) path.lineTo(src[i].x, src[i].y);
      path.closePath();
      s.holes.push(path);
    }
    return s;
  }, [inner, outer]);
  if (!shape) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

export function polyToShape(points: Point[]): THREE.Shape | null {
  if (points.length < 3) return null;
  const s = new THREE.Shape();
  s.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i].x, points[i].y);
  s.closePath();
  return s;
}

function closedPoints(points: Point[], elev: number): [number, number, number][] {
  if (points.length === 0) return [];
  const result: [number, number, number][] = points.map((p) => [p.x, elev, -p.y]);
  result.push([points[0].x, elev, -points[0].y]);
  return result;
}

function FrontMarker({ plot }: { plot: Point[] }) {
  const bbox = polygonBBox(plot);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const size = Math.max(0.5, Math.min(bbox.w, bbox.h) * 0.035);
  const z = -(bbox.minY - size * 1.2);
  return (
    <mesh position={[cx, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <coneGeometry args={[size, size * 1.6, 3]} />
      <meshBasicMaterial color="#0d7f69" />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Site planting                                */
/* -------------------------------------------------------------------------- */

/** Points every `spacing` metres along a ring, skipping the corners. */
function plantingSpots(ring: Point[], spacing: number) {
  const out: { x: number; y: number; i: number }[] = [];
  let idx = 0;
  for (let e = 0; e < ring.length; e++) {
    const a = ring[e];
    const b = ring[(e + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < spacing * 1.2) continue;
    const count = Math.max(1, Math.floor((len - 4) / spacing));
    const step = (len - 4) / count;
    for (let k = 0; k <= count; k++, idx++) {
      const t = (2 + k * step) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, i: idx });
    }
  }
  return out;
}

function usePalmGeometries() {
  return useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.13, 0.2, 6.6, 7);
    trunk.translate(0, 3.3, 0);
    const fronds: THREE.BufferGeometry[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const g = new THREE.ConeGeometry(0.32, 2.7, 4, 1);
      g.translate(0, 1.35, 0); // base at origin, tip at +y
      g.scale(1, 1, 0.25);
      g.rotateZ(-(1.05 + (i % 3) * 0.18)); // droop outward
      g.rotateY((i / n) * Math.PI * 2 + (i % 2) * 0.2);
      g.translate(0, 6.5, 0);
      fronds.push(g);
    }
    const crown = mergeGeometries(fronds) ?? new THREE.BufferGeometry();
    fronds.forEach((g) => g.dispose());
    const treeTrunk = new THREE.CylinderGeometry(0.12, 0.17, 2.4, 6);
    treeTrunk.translate(0, 1.2, 0);
    const canopy = new THREE.IcosahedronGeometry(1.7, 1);
    canopy.scale(1, 0.85, 1);
    canopy.translate(0, 3.4, 0);
    return { trunk, crown, treeTrunk, canopy };
  }, []);
}

/** Street palms and shade trees along the sidewalk, instanced. */
function SitePlanting({ ring, look }: { ring: Point[]; look: { trunk: string; leaf: string; palmLeaf: string } }) {
  const geo = usePalmGeometries();
  const { palms, trees } = useMemo(() => {
    const palms: THREE.Matrix4[] = [];
    const trees: THREE.Matrix4[] = [];
    for (const s of plantingSpots(ring, 9)) {
      const r = cellRand(11, s.i, 0);
      const scale = 0.85 + cellRand(11, s.i, 1) * 0.35;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(s.x, 0, -s.y),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cellRand(11, s.i, 2) * Math.PI * 2),
        new THREE.Vector3(scale, scale, scale),
      );
      (r < 0.7 ? palms : trees).push(m);
    }
    return { palms, trees };
  }, [ring]);
  return (
    <>
      <InstancedGeometry geometry={geo.trunk} matrices={palms} color={look.trunk} roughness={0.95} />
      <InstancedGeometry geometry={geo.crown} matrices={palms} color={look.palmLeaf} roughness={0.85} flat doubleSide />
      <InstancedGeometry geometry={geo.treeTrunk} matrices={trees} color={look.trunk} roughness={0.95} />
      <InstancedGeometry geometry={geo.canopy} matrices={trees} color={look.leaf} roughness={0.9} flat />
    </>
  );
}

function InstancedGeometry({
  geometry, matrices, color, roughness = 0.9, flat = false, doubleSide = false,
}: {
  geometry: THREE.BufferGeometry;
  matrices: THREE.Matrix4[];
  color: string;
  roughness?: number;
  flat?: boolean;
  doubleSide?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh key={matrices.length} ref={ref} args={[geometry, undefined, matrices.length]} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        flatShading={flat}
        side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
      />
    </instancedMesh>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Parametric residential facade                       */
/* -------------------------------------------------------------------------- */

const SLAB_T = 0.22;          // floor slab thickness (m)
const SLAB_LIP = 0.12;        // slab projection beyond the facade line (m)
const GLASS_INSET = 0.16;     // curtain-wall setback behind the facade line (m)
const MULLION_W = 0.12;       // vertical mullion section (m)
const RAIL_H = 1.05;          // balustrade height (m)

/**
 * Models a residential tower facade from the massing polygon: floor slabs,
 * a recessed glazing body, vertical mullions on a parametric bay rhythm and
 * balconies on every Nth bay. All repeated elements are instanced.
 */
export function ResidentialFacade({
  polygon, hole, fromY, toY, floorHeight, params, look = REAL_FACADE,
}: {
  polygon: Point[];
  hole?: Point[];
  fromY: number;
  toY: number;
  floorHeight: number;
  params: FacadeParams;
  look?: FacadeLook;
}) {
  const { panelWidthM, balconyDepthM, balconyEveryNBays, solidPanelRatio, balconyLayout, patternSeed } = params;
  const height = toY - fromY;
  const floors = Math.max(1, Math.round(height / Math.max(0.1, floorHeight)));
  const floorH = height / floors;

  const glassShape = useMemo(() => {
    const inset = offsetPolygon(polygon, polygon.map(() => GLASS_INSET));
    const s = polyToShape(inset.length >= 3 ? inset : polygon);
    if (s && hole && hole.length >= 3) {
      const grown = offsetPolygon(hole, hole.map(() => -GLASS_INSET));
      const src = (grown.length >= 3 ? grown : hole).slice().reverse();
      const path = new THREE.Path();
      path.moveTo(src[0].x, src[0].y);
      for (let i = 1; i < src.length; i++) path.lineTo(src[i].x, src[i].y);
      path.closePath();
      s.holes.push(path);
    }
    return s;
  }, [polygon, hole]);

  // One slab geometry, instanced per floor (plus the roof slab).
  const slabGeometry = useMemo(() => {
    const grown = offsetPolygon(polygon, polygon.map(() => -SLAB_LIP));
    const s = polyToShape(grown.length >= 3 ? grown : polygon);
    if (!s) return null;
    if (hole && hole.length >= 3) {
      const shrunk = offsetPolygon(hole, hole.map(() => SLAB_LIP));
      const src = (shrunk.length >= 3 ? shrunk : hole).slice().reverse();
      const path = new THREE.Path();
      path.moveTo(src[0].x, src[0].y);
      for (let i = 1; i < src.length; i++) path.lineTo(src[i].x, src[i].y);
      path.closePath();
      s.holes.push(path);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: SLAB_T, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polygon, hole]);
  useEffect(() => () => slabGeometry?.dispose(), [slabGeometry]);

  const slabMatrices = useMemo(
    () =>
      Array.from({ length: floors + 1 }, (_, i) => {
        const y = i === floors ? toY - SLAB_T : fromY + i * floorH;
        return new THREE.Matrix4().makeTranslation(0, y, 0);
      }),
    [floors, fromY, toY, floorH],
  );

  const { mullions, balconySlabs, rails, solidsLight, solidsDark } = useMemo(() => {
    const mullions: THREE.Matrix4[] = [];
    const balconySlabs: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    const solidsLight: THREE.Matrix4[] = [];
    const solidsDark: THREE.Matrix4[] = [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

    const ccw = isCounterClockwise(polygon);
    const outSign = ccw ? 1 : -1; // outward normal = (uy,-ux) for CCW polygons (local xy)
    const panelW = Math.max(1, panelWidthM);
    const everyN = Math.max(1, Math.round(balconyEveryNBays));
    const solidRatio = Math.min(1, Math.max(0, solidPanelRatio));
    const seed = Math.floor(patternSeed) || 1;
    const mullionH = floorH - SLAB_T;
    const panelH = floorH - SLAB_T;
    let globalBay = 0;

    for (let e = 0; e < polygon.length; e++) {
      const a = polygon[e];
      const b = polygon[(e + 1) % polygon.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (len < 0.8) continue;
      const ux = ex / len;
      const uy = ey / len;
      const nx = uy * outSign;
      const ny = -ux * outSign;
      // Yaw that aligns the box's local X with the edge direction in world space.
      const yaw = Math.atan2(uy, ux);
      quat.setFromAxisAngle(yAxis, yaw);
      const bays = Math.max(1, Math.round(len / panelW));
      const bayLen = len / bays;

      for (let k = 0; k < bays; k++, globalBay++) {
        // Vertical mullion at the bay start (the next edge contributes its own corner mullion).
        const px = a.x + ux * bayLen * k + nx * 0.02;
        const py = a.y + uy * bayLen * k + ny * 0.02;
        for (let f = 0; f < floors; f++) {
          const yMid = fromY + f * floorH + SLAB_T + mullionH / 2;
          pos.set(px, yMid, -py);
          scale.set(MULLION_W, mullionH, MULLION_W);
          mullions.push(new THREE.Matrix4().compose(pos, quat, scale));
        }

        const cx = a.x + ux * bayLen * (k + 0.5);
        const cy = a.y + uy * bayLen * (k + 0.5);
        const w = bayLen * 0.9;

        for (let f = 0; f < floors; f++) {
          // Solid precast panel instead of glazing on a random subset of cells.
          const isSolid = solidRatio > 0 && cellRand(seed, globalBay, f) < solidRatio;
          if (isSolid) {
            const yMid = fromY + f * floorH + SLAB_T + panelH / 2;
            pos.set(cx, yMid, -cy);
            scale.set(Math.max(0.3, bayLen - MULLION_W), panelH, 0.16);
            const m = new THREE.Matrix4().compose(pos, quat, scale);
            if (cellRand(seed, globalBay, f, 2) < 0.7) solidsLight.push(m);
            else solidsDark.push(m);
          }

          // Balconies: never on the tower's base floor line or on solid cells.
          if (f === 0 || isSolid || balconyDepthM <= 0.05) continue;
          const hasBalcony =
            balconyLayout === "random"
              ? cellRand(seed, globalBay, f, 1) < 1 / everyN
              : globalBay % everyN === 0;
          if (!hasBalcony) continue;
          const yBase = fromY + f * floorH;
          // slab
          pos.set(cx + nx * (balconyDepthM / 2), yBase + 0.07, -(cy + ny * (balconyDepthM / 2)));
          scale.set(w, 0.14, balconyDepthM);
          balconySlabs.push(new THREE.Matrix4().compose(pos, quat, scale));
          // glass balustrade on the outer edge
          pos.set(cx + nx * (balconyDepthM - 0.03), yBase + 0.14 + RAIL_H / 2, -(cy + ny * (balconyDepthM - 0.03)));
          scale.set(w, RAIL_H, 0.05);
          rails.push(new THREE.Matrix4().compose(pos, quat, scale));
        }
      }
    }
    return { mullions, balconySlabs, rails, solidsLight, solidsDark };
  }, [polygon, fromY, floors, floorH, panelWidthM, balconyDepthM, balconyEveryNBays, solidPanelRatio, balconyLayout, patternSeed]);

  return (
    <group>
      {/* Recessed glazing body — stops under the roof slab so the roof reads opaque */}
      {glassShape && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, fromY, 0]} castShadow receiveShadow>
          <extrudeGeometry args={[glassShape, { depth: Math.max(0.1, height - SLAB_T), bevelEnabled: false }]} />
          <meshPhysicalMaterial
            color={look.glass}
            roughness={look.glassRoughness}
            metalness={look.glassMetalness}
            clearcoat={0.6}
            clearcoatRoughness={0.2}
            transparent={look.glassOpacity < 1}
            opacity={look.glassOpacity}
          />
        </mesh>
      )}
      {/* Floor slabs (including roof slab) */}
      {slabGeometry && (
        <InstancedGeometry geometry={slabGeometry} matrices={slabMatrices} color={look.slab} roughness={0.85} />
      )}
      <InstancedBoxes matrices={mullions} color={look.mullion} roughness={0.7} />
      <InstancedBoxes matrices={solidsLight} color={look.solidLight} roughness={0.85} />
      <InstancedBoxes matrices={solidsDark} color={look.solidDark} roughness={0.85} />
      <InstancedBoxes matrices={balconySlabs} color={look.balcony} roughness={0.85} />
      <InstancedBoxes matrices={rails} color={look.rail} roughness={0.15} metalness={0.2} opacity={look.railOpacity} />
    </group>
  );
}

/** Renders a set of unit boxes with per-instance transforms. */
function InstancedBoxes({
  matrices, color, roughness = 0.8, metalness = 0, opacity = 1,
}: {
  matrices: THREE.Matrix4[];
  color: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      key={matrices.length}
      ref={ref}
      args={[undefined, undefined, matrices.length]}
      castShadow={opacity >= 1}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </instancedMesh>
  );
}

/**
 * Full-height vertical fin/louvre screen wrapping a Ground or Podium
 * footprint — thin blades spaced along the perimeter, projecting outward
 * from the facade line, in front of the solid tier volume.
 */
export function VerticalFinScreen({
  polygon, fromY, toY, params, color = "#9a8364",
}: {
  polygon: Point[];
  fromY: number;
  toY: number;
  params: FacadeParams;
  color?: string;
}) {
  const { finSpacingM, finWidthM, finDepthM } = params;
  const height = toY - fromY;

  const fins = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const midY = fromY + height / 2;

    const ccw = isCounterClockwise(polygon);
    const outSign = ccw ? 1 : -1; // outward normal = (uy,-ux) for CCW polygons (local xy)
    const spacing = Math.max(0.2, finSpacingM);
    const finW = Math.max(0.03, finWidthM);
    const finD = Math.max(0.05, finDepthM);

    for (let e = 0; e < polygon.length; e++) {
      const a = polygon[e];
      const b = polygon[(e + 1) % polygon.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (len < 0.4) continue;
      const ux = ex / len;
      const uy = ey / len;
      const nx = uy * outSign;
      const ny = -ux * outSign;
      const yaw = Math.atan2(uy, ux);
      quat.setFromAxisAngle(yAxis, yaw);

      const count = Math.max(1, Math.round(len / spacing));
      const step = len / count;
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) * step;
        // Inner face of the blade sits on the facade line; it projects outward by finD.
        const px = a.x + ux * t + nx * (finD / 2);
        const py = a.y + uy * t + ny * (finD / 2);
        pos.set(px, midY, -py);
        scale.set(finW, height, finD);
        matrices.push(new THREE.Matrix4().compose(pos, quat, scale));
      }
    }
    return matrices;
  }, [polygon, fromY, height, finSpacingM, finWidthM, finDepthM]);

  return <InstancedBoxes matrices={fins} color={color} roughness={0.5} metalness={0.25} />;
}

/* -------------------------------------------------------------------------- */
/*                          Podium roof amenities                             */
/* -------------------------------------------------------------------------- */

function boxMatrix(center: Point, y: number, sizeAlong: number, height: number, sizeAcross: number, yaw: number): THREE.Matrix4 {
  const pos = new THREE.Vector3(center.x, y, -center.y);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const scale = new THREE.Vector3(sizeAlong, height, sizeAcross);
  return new THREE.Matrix4().compose(pos, quat, scale);
}

const REAL_AMENITY: AmenityLook = { water: "#2f8a92", rim: "#d8d3c2", lounger: "#a9855f", bbq: "#3f3d38" };

export function PodiumAmenities({
  pool, lounge, toY, look = REAL_AMENITY,
}: {
  pool: PlacedAmenity | null;
  lounge: PlacedAmenity | null;
  toY: number;
  look?: AmenityLook;
}) {
  return (
    <>
      {pool && <Pool plan={pool} toY={toY} look={look} />}
      {lounge && <LoungeBbq plan={lounge} toY={toY} look={look} />}
    </>
  );
}

/** A shallow water surface on a coping rim, sized and placed by planPodiumAmenities. */
function Pool({ plan, toY, look }: { plan: PlacedAmenity; toY: number; look: AmenityLook }) {
  const { center, length, width, yaw } = plan;
  const rim = useMemo(() => [boxMatrix(center, toY + 0.06, length + 0.6, 0.12, width + 0.6, yaw)], [center, toY, length, width, yaw]);
  const water = useMemo(() => [boxMatrix(center, toY + 0.11, length, 0.06, width, yaw)], [center, toY, length, width, yaw]);
  return (
    <>
      <InstancedBoxes matrices={rim} color={look.rim} roughness={0.9} />
      <InstancedBoxes matrices={water} color={look.water} roughness={0.05} metalness={0.3} opacity={0.9} />
    </>
  );
}

/** A row of sun loungers plus a BBQ counter block at one end, laid out within the planned rectangle. */
function LoungeBbq({ plan, toY, look }: { plan: PlacedAmenity; toY: number; look: AmenityLook }) {
  const { center, length, width, yaw } = plan;

  const { loungers, bbq } = useMemo(() => {
    // "along" tracks the edge direction (maps to a box's local +X once rotated
    // by `yaw`); "across" tracks the perpendicular direction (local +Z). Both
    // derived directly from yaw so they always agree with boxMatrix's rotation.
    const along: Point = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const across: Point = { x: Math.sin(yaw), y: -Math.cos(yaw) };
    const toWorld = (alongT: number, acrossT: number): Point => ({
      x: center.x + along.x * alongT + across.x * acrossT,
      y: center.y + along.y * alongT + across.y * acrossT,
    });

    const bbqLen = Math.min(length * 0.3, 2.4);
    const bbqDepth = Math.min(width * 0.7, 0.9);
    const bbqAlong = length / 2 - bbqLen / 2; // flush against the "+along" end

    const loungeZoneLen = length - bbqLen - 1;
    const loungerThickness = 0.9; // along-axis footprint per lounger, including its gap
    const loungerCount = Math.max(0, Math.floor(loungeZoneLen / loungerThickness));
    const loungerLen = Math.min(width * 0.75, 2.0); // the lounger's long dimension, across-axis
    const loungerWidth = 0.75; // along-axis footprint before the gap
    const startAlong = -length / 2;
    const span = loungerCount * loungerThickness;
    const loungerStart = startAlong + Math.max(0, (loungeZoneLen - span) / 2);

    const loungers: THREE.Matrix4[] = [];
    for (let i = 0; i < loungerCount; i++) {
      const alongT = loungerStart + i * loungerThickness + loungerWidth / 2;
      loungers.push(boxMatrix(toWorld(alongT, 0), toY + 0.18, loungerWidth, 0.35, loungerLen, yaw));
    }
    const bbq = [boxMatrix(toWorld(bbqAlong, 0), toY + 0.48, bbqLen, 0.95, bbqDepth, yaw)];

    return { loungers, bbq };
  }, [center, length, width, yaw, toY]);

  return (
    <>
      <InstancedBoxes matrices={loungers} color={look.lounger} roughness={0.65} />
      <InstancedBoxes matrices={bbq} color={look.bbq} roughness={0.5} metalness={0.15} />
    </>
  );
}

/** Tier colours for the immersive walk (the realistic palette). */
export function colourForKind(kind?: "tower" | "ground" | "podium" | "basement") {
  const t = PALETTES.realistic.tiers[kind ?? "tower"];
  return { fill: t.fill, edge: t.edge, opacity: t.opacity, roughness: t.roughness };
}
