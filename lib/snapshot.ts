"use client";
import { useSyncExternalStore } from "react";

/**
 * The latest 3D massing view, captured by the viewer after the camera, style
 * or sun settle — so the PDF report can show the model even when the 3D step
 * isn't open. Kept in memory only: a PNG data-URL is far too heavy for
 * localStorage, and a stale view must never outlive the session.
 */
export interface MassingSnapshot {
  projectId: string;
  dataUrl: string;
  caption: string;
  takenAt: number;
}

let current: MassingSnapshot | null = null;
const listeners = new Set<() => void>();

export function setMassingSnapshot(s: MassingSnapshot | null) {
  current = s;
  listeners.forEach((l) => l());
}

export function getMassingSnapshot(): MassingSnapshot | null {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The snapshot for a project, or null when none was taken this session. */
export function useMassingSnapshot(projectId: string): MassingSnapshot | null {
  const s = useSyncExternalStore(subscribe, getMassingSnapshot, () => null);
  return s && s.projectId === projectId ? s : null;
}
