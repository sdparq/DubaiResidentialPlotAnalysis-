"use client";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { STEPS, type Step } from "@/lib/workflow";
import { STEP_ICONS } from "./sidebar";

export function PageHeader({
  step,
  onGo,
}: {
  step: Step;
  onGo: (id: Step["id"]) => void;
}) {
  const i = STEPS.findIndex((s) => s.id === step.id);
  const prev = i > 0 ? STEPS[i - 1] : null;
  const next = i < STEPS.length - 1 ? STEPS[i + 1] : null;
  const Icon = STEP_ICONS[step.id];
  return (
    <div className="mb-6 sm:mb-7 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex items-start gap-4">
        <div className="hidden sm:flex w-11 h-11 rounded-xl bg-white ring-1 ring-ink-200 shadow-card items-center justify-center shrink-0 text-brand-600">
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
              Step {step.num} of {String(STEPS.length).padStart(2, "0")}
            </span>
            <span className="text-ink-400">{step.group}</span>
          </div>
          <h1 className="mt-2 text-[22px] sm:text-[26px] leading-tight font-semibold tracking-tight text-ink-900">
            {step.title}
          </h1>
          <p className="mt-1.5 text-[13.5px] sm:text-[14px] text-ink-500 max-w-3xl leading-relaxed">{step.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="btn btn-secondary !px-2.5"
          disabled={!prev}
          onClick={() => prev && onGo(prev.id)}
          title={prev ? `Back to ${prev.label}` : undefined}
          aria-label={prev ? `Back to ${prev.label}` : "No previous step"}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {next && (
          <button className="btn btn-dark" onClick={() => onGo(next.id)}>
            Next: {next.label}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function NextStepCard({ step, onGo }: { step: Step; onGo: (id: Step["id"]) => void }) {
  const i = STEPS.findIndex((s) => s.id === step.id);
  const next = i < STEPS.length - 1 ? STEPS[i + 1] : null;
  if (!next) return null;
  const Icon = STEP_ICONS[next.id];
  return (
    <button
      onClick={() => onGo(next.id)}
      className="group mt-8 w-full text-left rounded-xl border border-ink-200/80 bg-white shadow-card hover:border-brand-300 hover:shadow-lift transition-all p-4 sm:p-5 flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-ink-500">Next · Step {next.num}</div>
        <div className="text-[15px] font-semibold text-ink-900">{next.title}</div>
        <div className="text-[12.5px] text-ink-500 truncate">{next.description}</div>
      </div>
      <ArrowRight className="w-5 h-5 text-ink-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}
