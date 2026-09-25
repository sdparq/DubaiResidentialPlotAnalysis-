import type { Project } from "../types";
import { fmt0, fmtPct } from "../format";
import type { AnalysisResult } from "./index";

export type CheckStatus = "ok" | "fail" | "info";

export interface ComplianceCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/**
 * Pass / fail checks shared by the Results dashboard and the Excel export.
 * Planning checks only appear once the corresponding limit is entered in Setup.
 */
export function computeChecks(project: Project, r: AnalysisResult): ComplianceCheck[] {
  const { program: p, parking: k, lifts: l, garbage: g } = r;
  const checks: ComplianceCheck[] = [];
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt0(Math.abs(n))}`;

  const permitted = project.targetGFA ?? 0;
  if (permitted > 0) {
    const over = p.totalGFABuilding - permitted;
    checks.push({
      key: "gfa",
      label: "GFA vs permitted",
      status: over <= 0.5 ? "ok" : "fail",
      detail:
        over <= 0.5
          ? `${fmt0(p.totalGFABuilding)} of ${fmt0(permitted)} m² permitted (${fmtPct(p.totalGFABuilding / permitted)} used)`
          : `Exceeds the permitted ${fmt0(permitted)} m² by ${fmt0(over)} m²`,
    });
  }

  if (project.maxFAR && project.maxFAR > 0) {
    checks.push({
      key: "far",
      label: "FAR",
      status: p.far <= project.maxFAR + 1e-6 ? "ok" : "fail",
      detail: `FAR ${p.far.toFixed(2)} vs max ${project.maxFAR.toFixed(2)}`,
    });
  }

  if (project.maxHeightM && project.maxHeightM > 0) {
    const height = project.numFloors * project.floorHeight;
    checks.push({
      key: "height",
      label: "Building height",
      status: height <= project.maxHeightM + 1e-6 ? "ok" : "fail",
      detail: `${height.toFixed(1)} m (${project.numFloors} floors × ${project.floorHeight} m) vs max ${project.maxHeightM} m`,
    });
  }

  checks.push({
    key: "parking",
    label: "Parking total",
    status: k.grandBalance >= 0 ? "ok" : "fail",
    detail: `${fmt0(k.availableTotal)} available · ${fmt0(k.grandRequired)} required (${signed(k.grandBalance)})`,
  });
  checks.push({
    key: "prm",
    label: "Accessible (PRM) parking",
    status: k.prmBalance >= 0 ? "ok" : "fail",
    detail: `${fmt0(k.availablePRM)} available · ${fmt0(k.requiredPRM)} required (${signed(k.prmBalance)})`,
  });

  if (l.liftsRecommended > 0) {
    const okInterval = l.intervalAchievedS <= l.targetIntervalS + 1e-6;
    checks.push({
      key: "lifts",
      label: "Lift service",
      status: okInterval ? "ok" : "fail",
      detail: `${l.liftsRecommended} lifts · interval ${l.intervalAchievedS.toFixed(0)} s (target ≤ ${l.targetIntervalS} s) · ${l.governing}`,
    });
  }

  checks.push({
    key: "waste",
    label: "Waste room",
    status: "info",
    detail: `${g.containers} containers · ${g.roomWidthM.toFixed(2)} × ${g.roomDepthM.toFixed(2)} m · ${g.roomAreaM2.toFixed(2)} m²`,
  });

  return checks;
}
