"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, Typology, ProgramCell, CommonArea, ParkingLevel, OtherUse } from "./types";
import { PRODUCTION_CITY_SAMPLE, emptyProject, newId } from "./sample";
import { createIdbStorage } from "./persist-storage";
import { normalizeProject, parseImport } from "./project-io";

interface PersistedState {
  projects: Record<string, Project>;
  activeProjectId: string;
}

interface State extends PersistedState {
  // Multi-project management
  newProject: (name?: string) => string;
  loadSample: () => string;
  duplicateProject: (id: string, newName?: string) => string;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  /** Import a single exported project or a full backup. Returns how many projects were added. */
  importJson: (json: unknown) => number;

  // Mutations on the active project
  setProject: (p: Project) => void;
  patch: (patch: Partial<Project>) => void;

  upsertTypology: (t: Typology) => void;
  removeTypology: (id: string) => void;

  setProgramCell: (floor: number, typologyId: string, count: number) => void;
  /** Replace every cell of the given floors with the cells of `fromFloor`. */
  copyProgramFloor: (fromFloor: number, toFloors: number[]) => void;

  upsertCommonArea: (c: CommonArea) => void;
  removeCommonArea: (id: string) => void;

  upsertParking: (p: ParkingLevel) => void;
  removeParking: (id: string) => void;

  upsertOtherUse: (u: OtherUse) => void;
  removeOtherUse: (id: string) => void;
}

function freshSample(): Project {
  const now = Date.now();
  return { ...PRODUCTION_CITY_SAMPLE, id: newId("sample"), createdAt: now, updatedAt: now };
}

function initState(): PersistedState {
  const sample = freshSample();
  return { projects: { [sample.id]: sample }, activeProjectId: sample.id };
}

const mostRecent = (projects: Record<string, Project>) =>
  Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt)[0];

/** Helper: update the active project immutably and bump updatedAt */
function updateActive(state: State, mutate: (p: Project) => Project): Partial<State> {
  const id = state.activeProjectId;
  const p = state.projects[id];
  if (!p) return {};
  const next = { ...mutate(p), updatedAt: Date.now() };
  return { projects: { ...state.projects, [id]: next } };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initState(),

      newProject: (name = "Untitled Project") => {
        const p = emptyProject(name);
        set((s) => ({ projects: { ...s.projects, [p.id]: p }, activeProjectId: p.id }));
        return p.id;
      },

      loadSample: () => {
        const p = freshSample();
        set((s) => ({ projects: { ...s.projects, [p.id]: p }, activeProjectId: p.id }));
        return p.id;
      },

      duplicateProject: (id, newName) => {
        const src = get().projects[id];
        if (!src) return id;
        const now = Date.now();
        const copy: Project = { ...src, id: newId(), name: newName ?? `${src.name} (copy)`, createdAt: now, updatedAt: now };
        set((s) => ({ projects: { ...s.projects, [copy.id]: copy }, activeProjectId: copy.id }));
        return copy.id;
      },

      deleteProject: (id) => {
        set((s) => {
          const next = { ...s.projects };
          delete next[id];
          if (Object.keys(next).length === 0) {
            const blank = emptyProject();
            return { projects: { [blank.id]: blank }, activeProjectId: blank.id };
          }
          const activeId = s.activeProjectId === id ? mostRecent(next).id : s.activeProjectId;
          return { projects: next, activeProjectId: activeId };
        });
      },

      switchProject: (id) => {
        if (!get().projects[id]) return;
        set({ activeProjectId: id });
      },

      importJson: (json) => {
        const found = parseImport(json);
        if (found.length === 0) return 0;
        set((s) => {
          const projects = { ...s.projects };
          for (const p of found) projects[p.id] = p;
          return { projects, activeProjectId: found[0].id };
        });
        return found.length;
      },

      setProject: (p) => set((s) => updateActive(s, () => p)),
      patch: (patch) => set((s) => updateActive(s, (p) => ({ ...p, ...patch }))),

      upsertTypology: (t) =>
        set((s) =>
          updateActive(s, (p) => {
            const idx = p.typologies.findIndex((x) => x.id === t.id);
            const next = [...p.typologies];
            if (idx >= 0) next[idx] = t;
            else next.push(t);
            return { ...p, typologies: next };
          })
        ),
      removeTypology: (id) =>
        set((s) =>
          updateActive(s, (p) => ({
            ...p,
            typologies: p.typologies.filter((t) => t.id !== id),
            program: p.program.filter((c) => c.typologyId !== id),
          }))
        ),

      setProgramCell: (floor, typologyId, count) =>
        set((s) =>
          updateActive(s, (p) => {
            const next = p.program.filter((c) => !(c.floor === floor && c.typologyId === typologyId));
            if (count > 0) next.push({ floor, typologyId, count });
            return { ...p, program: next };
          })
        ),

      copyProgramFloor: (fromFloor, toFloors) =>
        set((s) =>
          updateActive(s, (p) => {
            const targets = new Set(toFloors.filter((f) => f !== fromFloor));
            const source = p.program.filter((c) => c.floor === fromFloor && c.count > 0);
            const kept = p.program.filter((c) => !targets.has(c.floor));
            const copies: ProgramCell[] = [];
            for (const f of Array.from(targets)) for (const c of source) copies.push({ ...c, floor: f });
            return { ...p, program: [...kept, ...copies] };
          })
        ),

      upsertCommonArea: (c) =>
        set((s) =>
          updateActive(s, (p) => {
            const idx = p.commonAreas.findIndex((x) => x.id === c.id);
            const next = [...p.commonAreas];
            if (idx >= 0) next[idx] = c;
            else next.push(c);
            return { ...p, commonAreas: next };
          })
        ),
      removeCommonArea: (id) =>
        set((s) => updateActive(s, (p) => ({ ...p, commonAreas: p.commonAreas.filter((c) => c.id !== id) }))),

      upsertParking: (pk) =>
        set((s) =>
          updateActive(s, (p) => {
            const idx = p.parking.findIndex((x) => x.id === pk.id);
            const next = [...p.parking];
            if (idx >= 0) next[idx] = pk;
            else next.push(pk);
            return { ...p, parking: next };
          })
        ),
      removeParking: (id) =>
        set((s) => updateActive(s, (p) => ({ ...p, parking: p.parking.filter((pk) => pk.id !== id) }))),

      upsertOtherUse: (u) =>
        set((s) =>
          updateActive(s, (p) => {
            const idx = p.otherUses.findIndex((x) => x.id === u.id);
            const next = [...p.otherUses];
            if (idx >= 0) next[idx] = u;
            else next.push(u);
            return { ...p, otherUses: next };
          })
        ),
      removeOtherUse: (id) =>
        set((s) => updateActive(s, (p) => ({ ...p, otherUses: p.otherUses.filter((u) => u.id !== id) }))),
    }),
    {
      name: "dubai-plot-analysis",
      version: 2,
      storage: createIdbStorage<PersistedState>(),
      migrate: (persisted: unknown, fromVersion: number) => {
        // v0/v1 shape: { project: Project (without id) }
        if (fromVersion < 2 && persisted && typeof persisted === "object" && "project" in persisted) {
          const migrated = normalizeProject((persisted as { project: unknown }).project);
          if (migrated) return { projects: { [migrated.id]: migrated }, activeProjectId: migrated.id } as unknown as State;
        }
        return persisted as State;
      },
      // Validate what comes back from storage and make sure the active id points at a real project.
      merge: (persisted, current) => {
        const p = persisted as Partial<PersistedState> | undefined;
        if (!p || typeof p.projects !== "object" || p.projects === null) return current;
        const projects: Record<string, Project> = {};
        for (const raw of Object.values(p.projects)) {
          const proj = normalizeProject(raw, true);
          if (proj) projects[proj.id] = proj;
        }
        if (Object.keys(projects).length === 0) return current;
        const activeProjectId =
          p.activeProjectId && projects[p.activeProjectId] ? p.activeProjectId : mostRecent(projects).id;
        return { ...current, projects, activeProjectId };
      },
      // Only persist data, not the action functions.
      partialize: (s) => ({ projects: s.projects, activeProjectId: s.activeProjectId }),
    }
  )
);

/** Convenience hook used by all tabs — guaranteed-non-null current project */
export function useProject(): Project {
  const project = useStore((s) => s.projects[s.activeProjectId]);
  return project ?? FALLBACK_PROJECT;
}

// Stable fallback so a (theoretically) missing active project never creates a new object per render.
const FALLBACK_PROJECT: Project = { ...PRODUCTION_CITY_SAMPLE, id: "fallback" };

/** Resolves once the persisted projects have been loaded (immediately if already done). */
export function whenHydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
