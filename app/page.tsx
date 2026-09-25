"use client";
import { useEffect, useRef, useState } from "react";
import { useProject, whenHydrated } from "@/lib/store";
import { useSaveStatus } from "@/lib/persist-storage";
import PlotTab from "@/components/plot-tab";
import SetupTab from "@/components/setup-tab";
import TypologiesTab from "@/components/typologies-tab";
import ProgramTab from "@/components/program-tab";
import CommonAreasTab from "@/components/common-areas-tab";
import ParkingTab from "@/components/parking-tab";
import LiftsTab from "@/components/lifts-tab";
import GarbageTab from "@/components/garbage-tab";
import MassingTab from "@/components/massing-tab";
import PhysicsTab from "@/components/physics-tab";
import EconomicTab from "@/components/economic-tab";
import ResultsTab from "@/components/results-tab";
import HeaderBar from "@/components/header-bar";
import { BRAND } from "@/lib/brand";

const TABS = [
  { id: "plot", num: "00", label: "Plot" },
  { id: "setup", num: "01", label: "Setup" },
  { id: "typologies", num: "02", label: "Typologies" },
  { id: "program", num: "03", label: "Program" },
  { id: "common", num: "04", label: "Common Areas" },
  { id: "parking", num: "05", label: "Parking" },
  { id: "lifts", num: "06", label: "Lifts" },
  { id: "garbage", num: "07", label: "Waste" },
  { id: "massing", num: "08", label: "Massing" },
  { id: "physics", num: "09", label: "Sun & Views" },
  { id: "economic", num: "10", label: "Economics" },
  { id: "results", num: "11", label: "Results" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);

export default function Page() {
  const [tab, setTab] = useState<TabId>("setup");
  const [hydrated, setHydrated] = useState(false);
  const project = useProject();
  const saveError = useSaveStatus((s) => s.error);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    let alive = true;
    whenHydrated().then(() => alive && setHydrated(true));
    const fromHash = window.location.hash.replace("#", "");
    if (isTab(fromHash)) setTab(fromHash);
    return () => {
      alive = false;
    };
  }, []);

  function selectTab(id: TabId) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
    tabRefs.current[id]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <div className="eyebrow">Loading your projects…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <HeaderBar />
      <nav className="border-b border-ink-200 bg-white sticky top-0 z-20 print:hidden">
        <div className="max-w-7xl mx-auto px-2 sm:px-6">
          <div className="flex overflow-x-auto lg:flex-wrap gap-x-1 no-scrollbar">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  onClick={() => selectTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative shrink-0 whitespace-nowrap px-3 xl:px-4 py-4 text-[12.5px] xl:text-[13px] font-semibold transition-colors flex items-baseline gap-2 ${
                    active ? "text-ink-900" : "text-ink-500 hover:text-ink-900"
                  }`}
                  style={{ letterSpacing: "0.06em" }}
                >
                  <span className={`text-[10px] font-medium ${active ? "text-brand-600" : "text-ink-400"}`}>{t.num}</span>
                  <span className="uppercase">{t.label}</span>
                  {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-500" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 text-red-800 text-[12.5px] print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">{saveError}</div>
        </div>
      )}
      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 min-w-0">
          {tab === "plot" && <PlotTab />}
          {tab === "setup" && <SetupTab />}
          {tab === "typologies" && <TypologiesTab />}
          {tab === "program" && <ProgramTab />}
          {tab === "common" && <CommonAreasTab />}
          {tab === "parking" && <ParkingTab />}
          {tab === "lifts" && <LiftsTab />}
          {tab === "garbage" && <GarbageTab />}
          {tab === "massing" && <MassingTab />}
          {tab === "physics" && <PhysicsTab />}
          {tab === "economic" && <EconomicTab />}
          {tab === "results" && <ResultsTab />}
        </div>
      </main>
      <footer className="border-t border-ink-200 bg-bone-50 py-4 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-x-4 gap-y-1 flex-wrap text-[10.5px] uppercase tracking-[0.18em] text-ink-500">
          <span>{BRAND.wordmark} · {BRAND.descriptor}</span>
          <a href="/demo/" className="text-brand-700 hover:text-brand-900 transition-colors">▶ Watch demo</a>
          <span className="truncate max-w-full">{project.name} · Saved in this browser</span>
        </div>
      </footer>
    </div>
  );
}
