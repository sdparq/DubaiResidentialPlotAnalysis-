"use client";
import { useEffect, useRef, useState } from "react";
import { useStore, useProject } from "@/lib/store";
import type { Project } from "@/lib/types";
import { deleteCloudProject, useAuth } from "@/lib/cloud";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ProjectSwitcher() {
  const [open, setOpen] = useState(false);
  const project = useProject();
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeProjectId);
  const switchProject = useStore((s) => s.switchProject);
  const newProject = useStore((s) => s.newProject);
  const loadSample = useStore((s) => s.loadSample);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const { user } = useAuth();

  const sorted = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt);

  /** Cloud-aware delete. A cloud-linked project deleted only locally comes
   *  straight back on the next 30 s sync — so while signed in the cloud row
   *  goes too (with an explicit team-wide warning), and while locked the
   *  confirm says the project WILL return rather than pretending otherwise. */
  async function handleDelete(p: Project) {
    if (p.cloudId && user) {
      if (!confirm(`Delete "${p.name}" for the WHOLE TEAM?\n\nIt is synced to the cloud — this removes it from every teammate's list too. This cannot be undone.`)) return;
      try {
        await deleteCloudProject(p.cloudId);
      } catch (e) {
        alert(`Could not delete it from the cloud (${e instanceof Error ? e.message : "network error"}) — nothing was removed. Try again.`);
        return;
      }
      deleteProject(p.id);
    } else if (p.cloudId) {
      if (!confirm(`"${p.name}" is synced to the team cloud and you are not signed in.\n\nDeleting it here only hides it on this computer — it will come back on the next sync. To delete it for good, unlock the cloud first. Delete locally anyway?`)) return;
      deleteProject(p.id);
    } else {
      if (confirm(`Delete project "${p.name}"? This cannot be undone.`)) deleteProject(p.id);
    }
  }

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative leading-tight min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-2 text-left -ml-1.5 px-1.5 py-1 rounded-lg hover:bg-bone-100 transition-colors min-w-0 max-w-full"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="min-w-0">
          <div className="text-[11px] text-ink-500 leading-none mb-1">Project</div>
          <div className="text-[14.5px] font-semibold text-ink-900 truncate max-w-[150px] min-[420px]:max-w-[210px] sm:max-w-[340px] leading-tight">
            {project.name || "Untitled Project"}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="fixed sm:absolute z-50 top-16 sm:top-full left-3 right-3 sm:left-0 sm:right-auto sm:mt-2 sm:w-[440px] bg-white text-ink-900 border border-ink-200 rounded-xl shadow-lift overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13.5px] font-semibold text-ink-900">Projects</div>
              <div className="text-[11.5px] text-ink-500 mt-0.5">{sorted.length} saved · auto-saved in this browser</div>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="btn btn-secondary btn-xs" onClick={() => { loadSample(); setOpen(false); }}>
                Sample
              </button>
              <button className="btn btn-primary btn-xs" onClick={() => { newProject(); setOpen(false); }}>
                <Plus className="w-3.5 h-3.5" /> New project
              </button>
            </div>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto scroll-thin p-1.5">
            {sorted.map((p) => {
              const active = p.id === activeId;
              const units = p.program.reduce((s, c) => s + c.count, 0);
              return (
                <li key={p.id} className={`rounded-lg ${active ? "bg-brand-50" : "hover:bg-bone-50"}`}>
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <button
                      className="flex-1 min-w-0 text-left flex items-center gap-3"
                      onClick={() => { switchProject(p.id); setOpen(false); }}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-semibold ${
                          active ? "bg-brand-600 text-white" : "bg-bone-100 text-ink-600 ring-1 ring-inset ring-ink-200"
                        }`}
                        aria-hidden
                      >
                        {(p.name || "U").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-[13.5px] truncate">{p.name || "Untitled Project"}</span>
                        <span className="block text-[11.5px] text-ink-500 mt-0.5 truncate">
                          {units > 0 ? `${units.toLocaleString("en-US")} units` : "No units yet"} · {p.zone} · {relativeTime(p.updatedAt)}
                        </span>
                      </span>
                    </button>
                    <button
                      title="Duplicate"
                      aria-label={`Duplicate ${p.name}`}
                      className="p-1.5 rounded-md text-ink-400 hover:text-ink-900 hover:bg-white transition-colors"
                      onClick={() => { duplicateProject(p.id); setOpen(false); }}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      title="Delete"
                      aria-label={`Delete ${p.name}`}
                      className="p-1.5 rounded-md text-ink-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                      onClick={() => void handleDelete(p)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2.5 bg-bone-50 border-t border-ink-100 text-[11.5px] text-ink-500">
            Rename a project in Setup → Project name.
          </div>
        </div>
      )}
    </div>
  );
}
