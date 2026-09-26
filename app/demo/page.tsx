"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_SAMPLE } from "@/lib/sample";
import { computeProgram } from "@/lib/calc/program";
import { computeParking } from "@/lib/calc/parking";
import { computeLifts } from "@/lib/calc/lifts";
import { computeTowerYield } from "@/lib/calc/tower-yield";
import { residentialSubPct } from "@/lib/calc/gfa";
import { projectMetrics, type ProjectMetrics } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { offsetPolygon, rectanglePlotPolygon, type Point } from "@/lib/geom";
import type { Volume } from "@/lib/massing";
import type { Project } from "@/lib/types";
import type { FacadeParams } from "@/components/massing-scene";
import { dubaiSun, formatClock } from "@/lib/sun";
import { BrandMark } from "@/components/shell/brand-mark";

const MassingScene = dynamic(() => import("@/components/massing-scene"), { ssr: false });

/**
 * Scripted promo of the app, played on the demo scheme that ships with it
 * (lib/sample.ts). Every figure is computed live from that project with the
 * same calculation modules the app uses, and the 3D scene is the real viewer —
 * nothing here is mocked up. Record the page with any screen recorder.
 */

type SceneData = {
  project: Project;
  program: ReturnType<typeof computeProgram>;
  parking: ReturnType<typeof computeParking>;
  lifts: ReturnType<typeof computeLifts>;
  tower: ReturnType<typeof computeTowerYield>;
  metrics: ProjectMetrics;
};
type Render = (p: { t: number; data: SceneData }) => React.ReactElement | null;
interface Scene {
  id: string;
  durationMs: number;
  caption: string;
  render: Render;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const reveal = (t: number, start: number, span = 0.2) => ease(clamp01((t - start) / span));

/* -------------------------------------------------------------------------- */
/*                                 Building                                   */
/* -------------------------------------------------------------------------- */

/** The demo's 3D model — same stratification rules as the 3D Massing step. */
function demoModel(p: Project) {
  const plot = rectanglePlotPolygon(p.plotFrontage ?? 50, p.plotDepth ?? 50);
  const inset = (d: number): Point[] => (d > 0 ? offsetPolygon(plot, plot.map(() => d)) : plot);
  const tiers = {
    basement: p.basements ?? { count: 0, heightM: 3 },
    ground: p.ground ?? { count: 1, heightM: 4.5 },
    podium: p.podium ?? { count: 0, heightM: 4 },
    tower: p.typeFloors ?? { count: p.numFloors, heightM: p.floorHeight },
  };
  const volumes: Volume[] = [];
  if (tiers.basement.count > 0) {
    volumes.push({ polygon: plot, fromY: -tiers.basement.count * tiers.basement.heightM, toY: 0, kind: "basement" });
  }
  let y = 0;
  for (const [kind, setback] of [
    ["ground", p.groundSetbackM ?? 0],
    ["podium", p.podiumSetbackM ?? 0],
    ["tower", p.towerSetbackM ?? 0],
  ] as const) {
    const h = tiers[kind].count * tiers[kind].heightM;
    if (h <= 0) continue;
    volumes.push({ polygon: inset(setback), fromY: y, toY: y + h, kind });
    y += h;
  }
  const f = p.facade ?? {};
  const facade: FacadeParams = {
    mode: f.mode ?? "massing",
    panelWidthM: f.panelWidthM ?? 3.2,
    balconyDepthM: f.balconyDepthM ?? 1.8,
    balconyEveryNBays: f.balconyEveryNBays ?? 2,
    solidPanelRatio: f.solidPanelRatio ?? 0.25,
    balconyLayout: f.balconyLayout ?? "rhythm",
    patternSeed: f.patternSeed ?? 1,
    groundPodiumTreatment: f.groundPodiumTreatment ?? "massing",
    finSpacingM: f.finSpacingM ?? 1,
    finWidthM: f.finWidthM ?? 0.15,
    finDepthM: f.finDepthM ?? 0.35,
    podiumPool: f.podiumPool ?? false,
    podiumLoungeBbq: f.podiumLoungeBbq ?? false,
  };
  return { plot, tower: inset(p.towerSetbackM ?? 0), volumes, facade, floorHeight: tiers.tower.heightM };
}

/* -------------------------------------------------------------------------- */
/*                                  Pieces                                    */
/* -------------------------------------------------------------------------- */

function StepTag({ n, label }: { n: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-[13px] font-medium">
      <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">Step {n}</span>
      <span className="text-ink-500">{label}</span>
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bone-50 to-bone-200 p-10">
      {children}
    </div>
  );
}

function Tile({ label, value, sub, t, delay }: { label: string; value: string; sub?: string; t: number; delay: number }) {
  const k = reveal(t, delay, 0.18);
  return (
    <div
      className="rounded-xl bg-white ring-1 ring-inset ring-ink-200/80 shadow-card p-4"
      style={{ opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}
    >
      <div className="text-[13px] font-medium text-ink-500">{label}</div>
      <div className="text-[28px] font-semibold tracking-tight text-ink-900 mt-0.5">{value}</div>
      {sub && <div className="text-[12.5px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Scenes                                    */
/* -------------------------------------------------------------------------- */

function HeroScene({ t, data }: { t: number; data: SceneData }) {
  const k = ease(t * 1.6);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-900 text-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(0deg, transparent 96%, #2a9d84 96%), linear-gradient(90deg, transparent 96%, #2a9d84 96%)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative text-center" style={{ opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
        <BrandMark className="w-16 h-16 mx-auto mb-6" />
        <div className="wordmark text-[15px] text-brand-200 mb-4">{BRAND.wordmark}</div>
        <h1 className="text-[56px] leading-[1.05] font-semibold tracking-tight">
          A residential plot,
          <br />
          fully studied in minutes.
        </h1>
        <p className="text-[18px] text-white/65 mt-5">{BRAND.tagline}</p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[13px] text-white/80">
          Live example · {data.project.name}
        </div>
      </div>
    </div>
  );
}

function PlotScene({ t, data }: { t: number; data: SceneData }) {
  const p = data.project;
  const W = 620;
  const H = 400;
  const fw = p.plotFrontage ?? 64;
  const fd = p.plotDepth ?? 50;
  const s = Math.min((W - 160) / fw, (H - 120) / fd);
  const x0 = (W - fw * s) / 2;
  const y0 = (H - fd * s) / 2;
  const verts: [number, number][] = [[x0, y0], [x0 + fw * s, y0], [x0 + fw * s, y0 + fd * s], [x0, y0 + fd * s]];
  const draw = ease(t * 1.6);
  const shown = Math.min(4, Math.floor(draw * 5));
  let d = "";
  for (let i = 0; i < shown; i++) d += (i === 0 ? "M" : "L") + verts[i].join(",");
  const closed = draw >= 1;
  if (closed) d += " Z";
  const sb = (p.towerSetbackM ?? 0) * s;
  const k = reveal(t, 0.55, 0.3);
  return (
    <Stage>
      <div className="grid grid-cols-[1fr_300px] gap-8 items-center w-full max-w-[1000px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl bg-white shadow-lift ring-1 ring-ink-200/60">
          <defs>
            <pattern id="demo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="#eef1f5" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#demo-grid)" />
          <path d={d} fill={closed ? "rgba(235,104,52,0.10)" : "none"} stroke="#e34948" strokeWidth="2.5" strokeLinejoin="round" />
          {verts.slice(0, shown).map((v, i) => (
            <circle key={i} cx={v[0]} cy={v[1]} r={5} fill="#fff" stroke="#e34948" strokeWidth="2" />
          ))}
          {closed && (
            <g style={{ opacity: k }}>
              <rect
                x={x0 + sb}
                y={y0 + sb}
                width={fw * s - 2 * sb}
                height={fd * s - 2 * sb}
                fill="rgba(13,127,105,0.12)"
                stroke="#0d7f69"
                strokeDasharray="6 4"
                strokeWidth="1.8"
              />
              <text x={W / 2} y={y0 - 14} textAnchor="middle" fontSize="13" fill="#5a6479">{fw.toFixed(2)} m</text>
              <text x={x0 - 12} y={H / 2} textAnchor="end" fontSize="13" fill="#5a6479">{fd.toFixed(2)} m</text>
              <text x={W / 2} y={H / 2 + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill="#0b1324">{n0(p.plotArea)} m²</text>
            </g>
          )}
        </svg>
        <div className="grid gap-4">
          <StepTag n="01" label="Site" />
          <h2 className="text-[34px] leading-tight font-semibold tracking-tight text-ink-900">Drop the affection plan</h2>
          <ul className="grid gap-2 text-[15px] text-ink-600">
            {["Parcel boundary detected from the plan colours", "Scale read from the printed dimensions", "Plot area and footprints for the 3D model"].map((x, i) => (
              <li key={x} className="flex items-start gap-2" style={{ opacity: reveal(t, 0.2 + i * 0.15) }}>
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Stage>
  );
}

function SetupScene({ t, data }: { t: number; data: SceneData }) {
  const p = data.project;
  const m = data.metrics;
  const lines: [string, string][] = [
    ["Zone", `${p.zone} · market class C`],
    ["Plot area", `${n0(p.plotArea)} m²`],
    ["Target GFA", `${n0(p.targetGFA ?? 0)} m² · FAR ${m.far?.toFixed(1) ?? "—"}`],
    ["Uses", "95% residential · 5% retail"],
    ["Base", `${m.basements} basements · ground · ${m.podium} podium levels`],
  ];
  return (
    <Stage>
      <div className="w-full max-w-[760px] grid gap-5">
        <StepTag n="02" label="Project setup" />
        <div className="rounded-2xl bg-white shadow-lift ring-1 ring-ink-200/60 divide-y divide-ink-100">
          {lines.map(([k, v], i) => {
            const local = clamp01((t - 0.06 - i * 0.13) / 0.16);
            const chars = Math.floor(local * v.length);
            return (
              <div key={k} className="grid grid-cols-[170px_1fr] px-6 py-4 items-baseline">
                <span className="text-[14px] font-medium text-ink-500">{k}</span>
                <span className="text-[19px] font-semibold text-ink-900">
                  {v.slice(0, chars)}
                  {chars > 0 && chars < v.length && <span className="opacity-50">▍</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
}

function DistributionScene({ t, data }: { t: number; data: SceneData }) {
  const y = data.tower;
  const floors = Math.round(y.towerFloors * ease(clamp01((t - 0.35) / 0.4)));
  const apt = residentialSubPct(data.project, "apartments");
  const amen = residentialSubPct(data.project, "amenities");
  const circ = Math.max(0, 100 - apt - amen);
  return (
    <Stage>
      <div className="w-full max-w-[900px] grid gap-7">
        <StepTag n="03" label="GFA distribution" />
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 text-center">
          <Tile label="Residential GFA" value={`${n0(y.towerTargetGFA)} m²`} t={t} delay={0.05} />
          <span className="text-[34px] text-ink-300">÷</span>
          <Tile label="Tower floor plate" value={`${n0(y.towerFootprintM2)} m²`} t={t} delay={0.18} />
          <span className="text-[34px] text-ink-300">=</span>
          <div className="rounded-xl bg-brand-600 text-white shadow-lift p-4" style={{ opacity: reveal(t, 0.3) }}>
            <div className="text-[13px] font-medium text-white/70">Tower floors</div>
            <div className="text-[44px] font-semibold tracking-tight leading-tight">{floors}</div>
          </div>
        </div>
        <div style={{ opacity: reveal(t, 0.55) }}>
          <div className="flex h-4 gap-[2px]">
            <div className="rounded-l-full" style={{ flexGrow: apt, background: "#1baf7a" }} />
            <div style={{ flexGrow: amen, background: "#eb6834" }} />
            <div className="rounded-r-full" style={{ flexGrow: circ, background: "#2a78d6" }} />
          </div>
          <div className="mt-3 flex gap-6 text-[14px] text-ink-600">
            <span><b className="text-ink-900">Apartments</b> {apt.toFixed(0)}%</span>
            <span><b className="text-ink-900">Amenities</b> {amen.toFixed(0)}%</span>
            <span><b className="text-ink-900">Circulation</b> {circ.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

const MIX_COLORS = ["#5fbaa4", "#2a9d84", "#0d7f69", "#0a584a", "#0a473d"];

function TypologiesScene({ t, data }: { t: number; data: SceneData }) {
  const rows = data.program.byTypology;
  return (
    <Stage>
      <div className="w-full max-w-[900px] grid gap-5">
        <StepTag n="04" label="Typologies & unit mix" />
        <div className="rounded-2xl bg-white shadow-lift ring-1 ring-ink-200/60 overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px_120px] px-6 py-3 bg-bone-50 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500">
            <div>Typology</div>
            <div className="text-right">Interior</div>
            <div className="text-right">Balcony</div>
            <div className="text-right">Share</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.typology.id}
              className="grid grid-cols-[1fr_120px_120px_120px] px-6 py-3 border-t border-ink-100 text-[16px] items-center"
              style={{ opacity: reveal(t, 0.08 + i * 0.1, 0.15) }}
            >
              <div className="flex items-center gap-3 font-semibold text-ink-900">
                <span className="w-3 h-3 rounded-sm" style={{ background: MIX_COLORS[i % MIX_COLORS.length] }} />
                {r.typology.name}
              </div>
              <div className="text-right text-ink-600 tabular-nums">{r.typology.internalArea} m²</div>
              <div className="text-right text-ink-600 tabular-nums">{r.typology.balconyArea} m²</div>
              <div className="text-right font-semibold tabular-nums">{(r.pctOfTotal * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
        <div className="flex h-4 gap-[2px]" style={{ opacity: reveal(t, 0.6) }}>
          {rows.map((r, i) => (
            <div
              key={r.typology.id}
              className={`${i === 0 ? "rounded-l-full" : ""} ${i === rows.length - 1 ? "rounded-r-full" : ""}`}
              style={{ flexGrow: r.totalUnits, background: MIX_COLORS[i % MIX_COLORS.length] }}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

function ApartmentsScene({ t, data }: { t: number; data: SceneData }) {
  const ts = data.project.typologies;
  // Consecutive floors with the same mix read as one band.
  const bands: { from: number; to: number; counts: number[] }[] = [];
  for (let f = 1; f <= data.project.numFloors; f++) {
    const counts = ts.map((ty) => data.project.program.find((c) => c.floor === f && c.typologyId === ty.id)?.count ?? 0);
    const last = bands[bands.length - 1];
    if (last && last.counts.join() === counts.join()) last.to = f;
    else bands.push({ from: f, to: f, counts });
  }
  const shownUnits = Math.round(data.program.totalUnits * ease(clamp01((t - 0.2) / 0.55)));
  const cols = `140px repeat(${ts.length}, 1fr) 90px`;
  return (
    <Stage>
      <div className="grid grid-cols-[1fr_260px] gap-8 items-center w-full max-w-[1000px]">
        <div className="rounded-2xl bg-white shadow-lift ring-1 ring-ink-200/60 overflow-hidden">
          <div className="grid px-6 py-3 bg-bone-50 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-500" style={{ gridTemplateColumns: cols }}>
            <div>Floors</div>
            {ts.map((ty) => (
              <div key={ty.id} className="text-right">{ty.name.replace(" Bedrooms", " BR").replace(" Bedroom", " BR")}</div>
            ))}
            <div className="text-right">Per floor</div>
          </div>
          {[...bands].reverse().map((b, i) => (
            <div
              key={b.from}
              className="grid px-6 py-4 border-t border-ink-100 text-[17px] tabular-nums items-center"
              style={{ gridTemplateColumns: cols, opacity: reveal(t, 0.1 + i * 0.15, 0.15) }}
            >
              <div className="font-semibold text-ink-900">{b.from === b.to ? b.from : `${b.from}–${b.to}`}</div>
              {b.counts.map((c, j) => (
                <div key={j} className={`text-right ${c ? "text-ink-800" : "text-ink-300"}`}>{c || "·"}</div>
              ))}
              <div className="text-right font-semibold">{b.counts.reduce((a, c) => a + c, 0)}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4">
          <StepTag n="05" label="Apartments" />
          <div>
            <div className="text-[15px] text-ink-500">Total units</div>
            <div className="text-[64px] font-semibold tracking-tight leading-none text-ink-900">{shownUnits}</div>
          </div>
          <p className="text-[15px] text-ink-600">Auto-filled from the apartments GFA and the unit mix — every cell stays editable.</p>
        </div>
      </div>
    </Stage>
  );
}

function ServicesScene({ t, data }: { t: number; data: SceneData }) {
  const m = data.metrics;
  const pk = data.parking;
  const spare = m.parkingProvided - m.parkingRequired;
  return (
    <Stage>
      <div className="w-full max-w-[900px] grid gap-6">
        <StepTag n="06–07" label="Parking & lifts" />
        <div className="grid grid-cols-3 gap-4">
          <Tile label="Spaces required" value={n0(m.parkingRequired)} sub={`${n0(pk.grandRequired)} standard + ${n0(pk.requiredPOD)} POD`} t={t} delay={0.05} />
          <Tile label="Planned capacity" value={n0(m.parkingProvided)} sub={`${m.basements} basements + ${m.podium} podium levels`} t={t} delay={0.2} />
          <Tile label="Passenger lifts" value={m.lifts !== null ? String(m.lifts) : "—"} sub={`Dubai Building Code D.8.8 · ${n0(data.lifts.totalPopulation)} people`} t={t} delay={0.35} />
        </div>
        {spare >= 0 && (
          <div className="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-5 py-3 text-[15px] text-emerald-800" style={{ opacity: reveal(t, 0.55) }}>
            Parking fits with {n0(spare)} spaces to spare — no extra basement needed.
          </div>
        )}
      </div>
    </Stage>
  );
}

function MassingSlide({ t, data }: { t: number; data: SceneData }) {
  const model = useMemo(() => demoModel(data.project), [data.project]);
  const hour = 8 + t * 9.5;
  const year = new Date().getFullYear();
  const sun = useMemo(() => dubaiSun(year, 3, 21, hour), [year, hour]);
  return (
    <div className="absolute inset-0 bg-ink-950">
      <MassingScene
        plot={model.plot}
        buildable={model.tower}
        volumes={model.volumes}
        floorHeight={model.floorHeight}
        facade={model.facade}
        style="realistic"
        sun={sun}
        autoRotate
        showAnnotations={false}
        quality="high"
        frameKey="demo"
      />
      <div className="absolute top-6 left-6 rounded-xl bg-white/85 backdrop-blur-md ring-1 ring-black/10 px-4 py-3">
        <StepTag n="08" label="3D massing" />
        <div className="text-[20px] font-semibold text-ink-900 mt-2">
          {data.metrics.heightCode} · {data.metrics.heightM.toFixed(0)} m
        </div>
        <div className="text-[13px] text-ink-500">Dubai sun · 21 March · {formatClock(hour)}</div>
      </div>
    </div>
  );
}

function ResultsScene({ t, data }: { t: number; data: SceneData }) {
  const m = data.metrics;
  const tiles: [string, string, string][] = [
    ["GFA", `${n0(m.totalGFA)} m²`, `${Math.round((m.gfaOfTarget ?? 0) * 100)}% of target`],
    ["FAR", m.far?.toFixed(2) ?? "—", "GFA ÷ plot"],
    ["Units", n0(m.units), `avg ${n0(m.avgUnitM2 ?? 0)} m² sellable`],
    ["Sellable (GSA)", `${n0(m.gsa)} m²`, `${n0(m.gsa * 10.7639)} sqft`],
    ["Efficiency", m.efficiency !== null ? `${(m.efficiency * 100).toFixed(1)}%` : "—", "GSA ÷ BUA"],
    ["Height", `${m.heightM.toFixed(0)} m`, m.heightCode],
  ];
  return (
    <Stage>
      <div className="w-full max-w-[940px] grid gap-5">
        <StepTag n="09" label="Areas & report" />
        <div className="grid grid-cols-3 gap-4">
          {tiles.map(([l, v, s], i) => (
            <Tile key={l} label={l} value={v} sub={s} t={t} delay={0.05 + i * 0.08} />
          ))}
        </div>
        <p className="text-[15px] text-ink-600" style={{ opacity: reveal(t, 0.65) }}>
          Every figure recomputes as you edit — and exports as a branded PDF report with the 3D view.
        </p>
      </div>
    </Stage>
  );
}

function OutroScene({ t, onLoadSample }: { t: number; onLoadSample: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-900 text-white">
      <div className="text-center" style={{ opacity: ease(t * 1.8) }}>
        <BrandMark className="w-14 h-14 mx-auto mb-5" />
        <h2 className="text-[44px] font-semibold tracking-tight">Your next plot, in minutes — not weeks.</h2>
        <p className="text-[17px] text-white/60 mt-3">{BRAND.tagline}</p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={onLoadSample} className="btn btn-primary !px-5 !py-2.5 !text-[14px]">Open this sample in the app</button>
          <Link href="/" className="btn !px-5 !py-2.5 !text-[14px] bg-white/10 text-white hover:bg-white/20">Start a new study</Link>
        </div>
      </div>
    </div>
  );
}

const SCENES: Scene[] = [
  { id: "hero", durationMs: 4500, caption: `${BRAND.wordmark} — ${BRAND.tagline.toLowerCase()}`, render: HeroScene },
  { id: "plot", durationMs: 6500, caption: "Drop the affection plan — parcel and scale are read automatically.", render: PlotScene },
  { id: "setup", durationMs: 6500, caption: "Zone, market class, target GFA and the floor breakdown.", render: SetupScene },
  { id: "distribution", durationMs: 6000, caption: "Tower floors derived from the residential GFA.", render: DistributionScene },
  { id: "typologies", durationMs: 6500, caption: "Unit types and the market-class mix for the zone.", render: TypologiesScene },
  { id: "apartments", durationMs: 7000, caption: "Units floor by floor — auto-filled, fully editable.", render: ApartmentsScene },
  { id: "services", durationMs: 6500, caption: "Parking (incl. POD) and lifts to Dubai Building Code D.8.8.", render: ServicesScene },
  { id: "massing", durationMs: 11000, caption: "3D massing with a real Dubai sun & shadow study.", render: MassingSlide },
  { id: "results", durationMs: 6500, caption: "Areas, efficiency ratios and a one-click PDF report.", render: ResultsScene },
  { id: "outro", durationMs: 5000, caption: "Open the sample and explore it yourself.", render: () => null },
];
const TOTAL_MS = SCENES.reduce((s, sc) => s + sc.durationMs, 0);

/* -------------------------------------------------------------------------- */
/*                                 Demo page                                  */
/* -------------------------------------------------------------------------- */

export default function DemoPage() {
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  const idxRef = useRef(idx);
  const tRef = useRef(t);
  idxRef.current = idx;
  tRef.current = t;

  // Real numbers, computed once from the shipped demo scheme.
  const data: SceneData = useMemo(() => {
    const project = DEMO_SAMPLE;
    return {
      project,
      program: computeProgram(project),
      parking: computeParking(project),
      lifts: computeLifts(project),
      tower: computeTowerYield(project),
      metrics: projectMetrics(project),
    };
  }, []);

  const loadSample = useStore((s) => s.loadSample);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const dur = SCENES[idxRef.current].durationMs;
      const next = tRef.current + dt / dur;
      if (next >= 1) {
        if (idxRef.current < SCENES.length - 1) {
          setIdx(idxRef.current + 1);
          setT(0);
        } else {
          setT(1);
          setPlaying(false);
          setDone(true);
          return;
        }
      } else {
        setT(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const elapsedSec = useMemo(() => {
    let ms = 0;
    for (let i = 0; i < idx; i++) ms += SCENES[i].durationMs;
    ms += SCENES[idx].durationMs * t;
    return ms / 1000;
  }, [idx, t]);

  function restart() {
    setIdx(0);
    setT(0);
    setDone(false);
    setPlaying(true);
  }
  function jumpTo(i: number) {
    setIdx(i);
    setT(0);
    setDone(false);
    setPlaying(true);
  }

  function handleLoadSample() {
    loadSample();
    if (typeof window !== "undefined") window.location.href = "/";
  }

  const scene = SCENES[idx];
  // Rendered as a component (not called as a function) so scenes can use hooks.
  const SceneView = scene.render;

  return (
    <main className="min-h-screen bg-ink-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[1180px] grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="w-8 h-8" />
            <div>
              <div className="wordmark text-[13px]">{BRAND.wordmark}</div>
              <div className="text-[12px] text-white/50">Product demo · {data.project.name}</div>
            </div>
          </div>
          <Link href="/" className="btn btn-xs bg-white/10 text-white hover:bg-white/20">Skip to the app →</Link>
        </div>

        <div className="relative aspect-[16/9] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 text-ink-900">
          {scene.id === "outro" ? <OutroScene t={t} onLoadSample={handleLoadSample} /> : <SceneView t={t} data={data} />}
          {scene.id !== "hero" && scene.id !== "outro" && (
            <div className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-gradient-to-t from-ink-950/80 to-transparent pointer-events-none">
              <div className="text-white text-[17px] font-medium">{scene.caption}</div>
            </div>
          )}
          {done && (
            <button onClick={restart} className="absolute top-3 right-3 btn btn-secondary btn-xs">↻ Replay</button>
          )}
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <button
            onClick={() => (done ? restart() : setPlaying((p) => !p))}
            className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
          >{done ? "↻" : playing ? "❚❚" : "▶"}</button>
          <div className="grid gap-1 h-1.5" style={{ gridTemplateColumns: `repeat(${SCENES.length}, 1fr)` }}>
            {SCENES.map((s, i) => {
              const filled = i < idx ? 1 : i === idx ? t : 0;
              return (
                <button
                  key={s.id}
                  onClick={() => jumpTo(i)}
                  className="relative rounded-full bg-white/15 hover:bg-white/25 overflow-hidden"
                  title={s.caption}
                  aria-label={`Jump to scene ${i + 1}: ${s.caption}`}
                >
                  <span className="absolute inset-y-0 left-0 bg-brand-400" style={{ width: `${filled * 100}%` }} />
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-white/50 tabular-nums w-[72px] text-right">
            {elapsedSec.toFixed(1)}s / {(TOTAL_MS / 1000).toFixed(0)}s
          </div>
        </div>
        <p className="text-[12px] text-white/40 leading-relaxed">
          Tip — to record a video, open this page full-screen, press play and capture the screen with Loom, OBS,
          <kbd className="mx-1 px-1.5 py-0.5 rounded bg-white/10 text-[11px]">⌘⇧5</kbd> on macOS or
          <kbd className="mx-1 px-1.5 py-0.5 rounded bg-white/10 text-[11px]">Win+G</kbd> on Windows.
        </p>
      </div>
    </main>
  );
}
