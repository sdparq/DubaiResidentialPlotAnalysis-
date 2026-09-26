"use client";
import { useEffect, useMemo, useState } from "react";
import { Library, X } from "lucide-react";
import { useProject } from "@/lib/store";
import PlotTab from "@/components/plot-tab";
import SetupTab from "@/components/setup-tab";
import TypologiesTab from "@/components/typologies-tab";
import ProgramTab from "@/components/program-tab";
import CommonAreasTab from "@/components/common-areas-tab";
import ParkingTab from "@/components/parking-tab";
import MassingTab from "@/components/massing-tab";
import ZonesTab from "@/components/zones-tab";
import SummaryTab from "@/components/summary-tab";
import Sidebar, { type NavTarget } from "@/components/shell/sidebar";
import TopBar from "@/components/shell/top-bar";
import KpiStrip from "@/components/shell/kpi-strip";
import { NextStepCard, PageHeader } from "@/components/shell/page-header";
import { projectMetrics } from "@/lib/metrics";
import { STEPS, stepStatuses, type StepId } from "@/lib/workflow";
import { BRAND } from "@/lib/brand";

/** The Class Library is the shared pricing/mix database — kept out of the
 *  workflow. Set NEXT_PUBLIC_LIBRARY_PASSWORD_SHA256 at build time to
 *  admin-gate it (only the SHA-256 of the password ships in the bundle); when
 *  it is not set, the lock opens the library directly. */
const LIBRARY_PASSWORD_SHA256 = (process.env.NEXT_PUBLIC_LIBRARY_PASSWORD_SHA256 ?? "").trim().toLowerCase();
const LIBRARY_UNLOCK_KEY = "plot-analysis-library-unlock";
const ACTIVE_STEP_KEY = "plot-analysis-active-step";

async function sha256Hex(text: string): Promise<string> {
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode — the preference just isn't remembered */
  }
}

export default function Page() {
  const [tab, setTab] = useState<NavTarget>("setup");
  const [hydrated, setHydrated] = useState(false);
  const [libraryUnlocked, setLibraryUnlocked] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const project = useProject();

  const metrics = useMemo(() => projectMetrics(project), [project]);
  const statuses = useMemo(() => stepStatuses(project, metrics), [project, metrics]);

  useEffect(() => {
    const unlocked = readSession(LIBRARY_UNLOCK_KEY) === "1";
    setLibraryUnlocked(unlocked);
    const saved = readSession(ACTIVE_STEP_KEY);
    if (saved && (STEPS.some((s) => s.id === saved) || (saved === "zones" && unlocked))) {
      setTab(saved as NavTarget);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  if (!hydrated) return null;

  function go(next: NavTarget) {
    setTab(next);
    setDrawer(false);
    writeSession(ACTIVE_STEP_KEY, next);
    window.scrollTo({ top: 0 });
  }

  async function openLibrary() {
    if (libraryUnlocked) {
      go("zones");
      return;
    }
    if (!LIBRARY_PASSWORD_SHA256) {
      writeSession(LIBRARY_UNLOCK_KEY, "1");
      setLibraryUnlocked(true);
      go("zones");
      return;
    }
    const pw = window.prompt("The Class Library is restricted.\nEnter the admin password:");
    if (pw == null || pw === "") return;
    try {
      if ((await sha256Hex(pw)) !== LIBRARY_PASSWORD_SHA256) {
        window.alert("Wrong password.");
        return;
      }
    } catch {
      window.alert("Password check needs a secure (https) context — open the deployed site.");
      return;
    }
    writeSession(LIBRARY_UNLOCK_KEY, "1");
    setLibraryUnlocked(true);
    go("zones");
  }

  function lockLibrary() {
    writeSession(LIBRARY_UNLOCK_KEY, null);
    setLibraryUnlocked(false);
    if (tab === "zones") go("setup");
  }

  const step = STEPS.find((s) => s.id === tab) ?? null;
  const sidebar = (
    <Sidebar
      active={tab}
      statuses={statuses}
      onSelect={go}
      libraryUnlocked={libraryUnlocked}
      onOpenLibrary={() => void openLibrary()}
      onLockLibrary={lockLibrary}
    />
  );

  return (
    <div className="min-h-screen lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[248px] z-40">{sidebar}</aside>

      {/* Mobile / tablet drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl">
            {sidebar}
            <button
              onClick={() => setDrawer(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="min-h-screen flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 border-b border-ink-200/80">
          <TopBar onMenu={() => setDrawer(true)} />
          <div className="hidden md:block border-t border-ink-100">
            <KpiStrip metrics={metrics} onNavigate={go} />
          </div>
        </header>

        <div className="md:hidden bg-white border-b border-ink-200/80">
          <KpiStrip metrics={metrics} onNavigate={go} />
        </div>

        <main className="flex-1 min-w-0">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-w-0">
            {step ? (
              <PageHeader step={step} onGo={go} />
            ) : (
              <div className="mb-6 sm:mb-7 flex items-start gap-4">
                <div className="hidden sm:flex w-11 h-11 rounded-xl bg-ink-900 text-white items-center justify-center shrink-0">
                  <Library className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full bg-sand-100 text-sand-800 ring-1 ring-inset ring-sand-200 text-[12px] font-medium">
                    Admin
                  </span>
                  <h1 className="mt-2 text-[22px] sm:text-[26px] leading-tight font-semibold tracking-tight text-ink-900">
                    Class library
                  </h1>
                  <p className="mt-1.5 text-[14px] text-ink-500 max-w-3xl">
                    Reference matrix of UAE market classes — zones, unit mix, unit areas, prices, floor heights and
                    parking standards. Every project reads its defaults from here.
                  </p>
                </div>
              </div>
            )}

            {tab === "zones" && libraryUnlocked && <ZonesTab />}
            {tab === "plot" && <PlotTab />}
            {tab === "setup" && <SetupTab />}
            {tab === "typologies" && <TypologiesTab />}
            {tab === "program" && <ProgramTab />}
            {tab === "common" && <CommonAreasTab />}
            {tab === "summary" && <SummaryTab />}
            {tab === "parking" && <ParkingTab />}
            {tab === "massing" && <MassingTab />}

            {step && <NextStepCard step={step} onGo={(id: StepId) => go(id)} />}
          </div>
        </main>

        <footer className="border-t border-ink-200/80 bg-white/60">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-x-4 gap-y-1 flex-wrap text-[12px] text-ink-500">
            <span>
              <span className="font-semibold text-ink-700">{BRAND.wordmark}</span> · {BRAND.tagline}
            </span>
            <span className="truncate">{project.name} · auto-saved in this browser</span>
          </div>
        </footer>
      </div>

    </div>
  );
}
