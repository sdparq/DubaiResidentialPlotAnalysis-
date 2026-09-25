"use client";
import { useState } from "react";
import { useStore, useProject } from "@/lib/store";
import { DUBAI_ZONES } from "@/lib/standards/dubai";
import { computeProgram } from "@/lib/calc/program";
import { parseCoordinates } from "@/lib/geo-parse";
import { fmt0, fmtPct, fmtSqft } from "@/lib/format";
import NumInput from "./num-input";

export default function SetupTab() {
  const project = useProject();
  const patch = useStore((s) => s.patch);
  const program = computeProgram(project);

  const permitted = project.targetGFA ?? 0;
  const height = project.numFloors * project.floorHeight;
  const impliedFar = permitted > 0 && project.plotArea > 0 ? permitted / project.plotArea : 0;

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Project</h2>
          <p className="section-sub">Identification and plot data.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Field label="Project name">
            <input className="cell-input" value={project.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Plot number">
            <input
              className="cell-input"
              value={project.plotNumber ?? ""}
              placeholder="As on the affection plan"
              onChange={(e) => patch({ plotNumber: e.target.value || undefined })}
            />
          </Field>
          <Field label="Area / community">
            <input
              className="cell-input"
              list="dubai-zones"
              value={project.zone}
              placeholder="e.g. Jumeirah Village Circle (JVC)"
              onChange={(e) => patch({ zone: e.target.value })}
            />
            <datalist id="dubai-zones">
              {DUBAI_ZONES.map((z) => <option key={z} value={z} />)}
            </datalist>
          </Field>
          <Field label="Plot area (m²)" hint={project.plotArea > 0 ? fmtSqft(project.plotArea) : undefined}>
            <NumInput value={project.plotArea} min={0} step={10} onChange={(v) => patch({ plotArea: v })} />
          </Field>
          <Field label="Residential floors">
            <NumInput value={project.numFloors} integer min={1} max={200} onChange={(v) => patch({ numFloors: v })} />
          </Field>
          <Field label="Floor-to-floor height (m)">
            <NumInput value={project.floorHeight} min={0} step={0.1} onChange={(v) => patch({ floorHeight: v })} />
          </Field>
          <Field label="Approx. shafts per unit (m²)" hint="Deducted from GFA">
            <NumInput value={project.shaftPerUnit} min={0} step={0.1} onChange={(v) => patch({ shaftPerUnit: v })} />
          </Field>
          <Field label="Accessible (PRM) parking" hint="Share of required spaces">
            <NumInput value={project.prmPercent * 100} min={0} max={100} step={0.5} suffix="%" onChange={(v) => patch({ prmPercent: v / 100 })} />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Planning constraints</h2>
          <p className="section-sub">
            Limits from the affection plan / plot guidelines. Leave empty if not known — each one adds a pass / fail
            check to Results and ranks the massing variants.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Permitted GFA (m²)" hint={permitted > 0 ? `${fmtSqft(permitted)}${impliedFar ? ` · FAR ${impliedFar.toFixed(2)}` : ""}` : "Also the 100 % reference of Common Areas in % mode"}>
            <NumInput
              value={project.targetGFA}
              min={0}
              step={10}
              placeholder="—"
              onChange={(v) => patch({ targetGFA: v > 0 ? v : undefined })}
              onClear={() => patch({ targetGFA: undefined })}
            />
          </Field>
          <Field label="Max FAR">
            <NumInput
              value={project.maxFAR}
              min={0}
              step={0.05}
              placeholder="—"
              onChange={(v) => patch({ maxFAR: v > 0 ? v : undefined })}
              onClear={() => patch({ maxFAR: undefined })}
            />
          </Field>
          <Field label="Max height (m)">
            <NumInput
              value={project.maxHeightM}
              min={0}
              step={1}
              placeholder="—"
              onChange={(v) => patch({ maxHeightM: v > 0 ? v : undefined })}
              onClear={() => patch({ maxHeightM: undefined })}
            />
          </Field>
        </div>
        <div className="mt-4 grid sm:grid-cols-3 gap-3 text-[12px]">
          <Status
            label="Design GFA"
            value={`${fmt0(program.totalGFABuilding)} m²`}
            state={permitted > 0 ? (program.totalGFABuilding <= permitted + 0.5 ? "ok" : "bad") : undefined}
            note={permitted > 0 ? `${fmtPct(program.totalGFABuilding / permitted)} of permitted` : "No limit set"}
          />
          <Status
            label="FAR"
            value={program.far.toFixed(2)}
            state={project.maxFAR ? (program.far <= project.maxFAR + 1e-6 ? "ok" : "bad") : undefined}
            note={project.maxFAR ? `max ${project.maxFAR}` : "No limit set"}
          />
          <Status
            label="Residential stack height"
            value={`${height.toFixed(1)} m`}
            state={project.maxHeightM ? (height <= project.maxHeightM + 1e-6 ? "ok" : "bad") : undefined}
            note={project.maxHeightM ? `max ${project.maxHeightM} m` : `${project.numFloors} × ${project.floorHeight} m`}
          />
        </div>
      </div>

      <LocationCard />

      <div className="card">
        <div className="mb-5">
          <h2 className="section-title">Notes</h2>
          <p className="section-sub">Free-form observations, issues, conclusions. Printed in Results and exported to Excel.</p>
        </div>
        <textarea
          className="cell-input min-h-[140px] leading-relaxed"
          rows={6}
          value={project.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="e.g. Travel distance exceeds 61 m max — relocate parking layout..."
        />
      </div>
    </div>
  );
}

function LocationCard() {
  const project = useProject();
  const patch = useStore((s) => s.patch);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  function applyPaste(text: string) {
    setPaste(text);
    if (!text.trim()) {
      setPasteError(null);
      return;
    }
    const c = parseCoordinates(text);
    if (!c) {
      setPasteError("Couldn't read a location — paste \"25.19, 55.27\" or a Google Maps link.");
      return;
    }
    setPasteError(null);
    patch({ latitude: Number(c.lat.toFixed(6)), longitude: Number(c.lng.toFixed(6)) });
  }

  const hasGeo = !!project.latitude && !!project.longitude;
  const mapsUrl = hasGeo ? `https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}` : null;

  return (
    <div className="card">
      <div className="mb-5">
        <h2 className="section-title">Location</h2>
        <p className="section-sub">
          Unlocks the in-context 3D view (satellite basemap + neighbouring buildings) and the sun &amp; views analyses.
        </p>
      </div>
      <div className="grid gap-5">
        <Field label="Paste coordinates or a Google Maps link">
          <input
            className="cell-input"
            value={paste}
            placeholder={`25.0307, 55.1873  ·  https://maps.google.com/…  ·  25°01'50.5"N 55°11'14.3"E`}
            onChange={(e) => applyPaste(e.target.value)}
          />
          {pasteError && <span className="text-[11px] text-red-700">{pasteError}</span>}
        </Field>
        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Latitude">
            <NumInput
              value={project.latitude}
              min={-90}
              max={90}
              step={0.0001}
              placeholder="—"
              onChange={(v) => patch({ latitude: v !== 0 ? v : undefined })}
              onClear={() => patch({ latitude: undefined })}
            />
          </Field>
          <Field label="Longitude">
            <NumInput
              value={project.longitude}
              min={-180}
              max={180}
              step={0.0001}
              placeholder="—"
              onChange={(v) => patch({ longitude: v !== 0 ? v : undefined })}
              onClear={() => patch({ longitude: undefined })}
            />
          </Field>
          <Field label="North heading (° clockwise of plot +Y)" hint="0 when the drawing is north-up">
            <NumInput value={project.northHeadingDeg ?? 0} min={-360} max={360} step={1} onChange={(v) => patch({ northHeadingDeg: v })} />
          </Field>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-[11px] text-brand-700 hover:text-brand-900 underline justify-self-start">
            Check the location on Google Maps ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 content-start">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-500 -mt-1">{hint}</span>}
    </label>
  );
}

function Status({ label, value, note, state }: { label: string; value: string; note: string; state?: "ok" | "bad" }) {
  const tone = state === "ok" ? "text-emerald-700" : state === "bad" ? "text-red-700" : "text-ink-900";
  return (
    <div className="border border-ink-200 bg-bone-50 px-3 py-2.5 grid gap-0.5">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-500">{label}</span>
      <span className={`text-[15px] font-medium tabular-nums ${tone}`}>
        {value}
        {state && <span className="ml-2 text-[10.5px] uppercase tracking-[0.1em]">{state === "ok" ? "✓ within" : "✗ over"}</span>}
      </span>
      <span className="text-ink-500">{note}</span>
    </div>
  );
}
