import type { Project } from "../types";
import { DUBAI_STANDARDS } from "../standards/dubai";

export interface LiftsResult {
  byFloor: { floor: number; units: number; population: number }[];
  totalUnits: number;
  totalPopulation: number;
  demandStandard: number;
  demandPremium: number;
  /** Rated persons for the cabin (kg ÷ 75). */
  ratedPersons: number;
  /** P — average passengers per up-peak trip (80 % of rated, rounded down). */
  personsPerTrip: number;
  /** N — floors served above the main terminal. */
  floorsServed: number;
  totalTravelHeight: number;
  /** t_v — time to travel one floor-to-floor distance at rated speed, s. */
  interfloorTimeS: number;
  /** S — probable number of stops per round trip. */
  probableStops: number;
  /** H — highest reversal floor. */
  highestReversalFloor: number;
  /** t_s and t_p actually used, s. */
  timePerStopS: number;
  passengerTransferS: number;
  rttSeconds: number;
  tripsPer5Min: number;
  /** Up-peak handling capacity of one lift, persons per 5 minutes (rounded down). */
  capacityPerLift: number;
  liftsCIBSEStandard: number;
  liftsCIBSEPremium: number;
  targetIntervalS: number;
  liftsForInterval: number;
  liftsCIBSE: number;
  ruleOfThumbLifts: number;
  dcdMinLifts: number;
  liftsPractical: number;
  liftsRecommended: number;
  /** Average interval with the recommended number of lifts, s. */
  intervalAchievedS: number;
  /** 5-minute handling capacity with the recommended lifts, as a fraction of the population. */
  handlingAchievedPct: number;
  governing: string;
}

const DEFAULT_TRANSFER_S = 1.2;
const DEFAULT_INTERVAL_S = 60;

function roundTo(n: number, digits: number) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * Up-peak traffic analysis following the classical round-trip-time method of CIBSE Guide D:
 *
 *   S   = N · [1 − (1 − 1/N)^P]                       probable stops
 *   H   = N − Σ_{i=1}^{N−1} (i/N)^P                   highest reversal floor
 *   RTT = 2·H·t_v + (S + 1)·t_s + 2·P·t_p
 *   HC  = 300 · P / RTT                                persons per lift per 5 minutes
 *
 * Lifts are sized on both handling capacity (5 % / 7 % of the population in 5 minutes) and on the
 * target average interval (RTT / L), then compared with the rule of thumb and the configured minimum.
 */
export function computeLifts(project: Project): LiftsResult {
  const cfg = project.lifts;
  const std = DUBAI_STANDARDS.lifts;
  const tById = new Map(project.typologies.map((t) => [t.id, t]));

  const floors = Array.from({ length: project.numFloors }, (_, i) => i + 1);
  const byFloor = floors.map((floor) => {
    const cells = project.program.filter((c) => c.floor === floor);
    let units = 0,
      population = 0;
    for (const cell of cells) {
      const t = tById.get(cell.typologyId);
      if (!t || !cell.count) continue;
      units += cell.count;
      population += cell.count * t.occupancy;
    }
    return { floor, units, population };
  });

  const totalUnits = byFloor.reduce((s, f) => s + f.units, 0);
  const totalPopulation = byFloor.reduce((s, f) => s + f.population, 0);

  const demandStandard = Math.ceil(totalPopulation * cfg.handlingPctStandard);
  const demandPremium = Math.ceil(totalPopulation * cfg.handlingPctPremium);

  const ratedPersons = Math.floor(cfg.cabinKg / std.weightPerPerson);
  const P = Math.floor(ratedPersons * std.capacityFactor);
  const N = Math.max(1, project.numFloors);
  const df = Math.max(0, project.floorHeight);
  const speed = cfg.speed > 0 ? cfg.speed : 1;
  const ts = Math.max(0, cfg.timePerStop);
  const tp = cfg.passengerTransferS ?? DEFAULT_TRANSFER_S;
  const targetIntervalS = cfg.targetIntervalS && cfg.targetIntervalS > 0 ? cfg.targetIntervalS : DEFAULT_INTERVAL_S;

  const totalTravelHeight = N * df;
  const tv = df / speed;
  const S = P > 0 ? N * (1 - Math.pow(1 - 1 / N, P)) : 0;
  let sumReversal = 0;
  for (let i = 1; i < N; i++) sumReversal += Math.pow(i / N, P);
  const H = P > 0 ? N - sumReversal : 0;
  const rtt = P > 0 ? 2 * H * tv + (S + 1) * ts + 2 * P * tp : 0;

  const tripsPer5Min = rtt > 0 ? std.handlingWindowSec / rtt : 0;
  const capacityPerLift = Math.floor(tripsPer5Min * P);

  const liftsCIBSEStandard = capacityPerLift > 0 ? Math.ceil(demandStandard / capacityPerLift) : 0;
  const liftsCIBSEPremium = capacityPerLift > 0 ? Math.ceil(demandPremium / capacityPerLift) : 0;
  const liftsForInterval = totalUnits > 0 && rtt > 0 ? Math.ceil(rtt / targetIntervalS) : 0;
  const liftsCIBSE = Math.max(liftsCIBSEStandard, liftsCIBSEPremium, liftsForInterval);

  const ruleOfThumbLifts = cfg.unitsPerLiftRule > 0 ? Math.ceil(totalUnits / cfg.unitsPerLiftRule) : 0;
  const dcdMinLifts = totalUnits > 0 && totalUnits >= cfg.dcdMinUnitsThreshold ? cfg.dcdMinLifts : 0;
  const liftsPractical = Math.max(ruleOfThumbLifts, dcdMinLifts);
  const liftsRecommended = Math.max(liftsCIBSE, liftsPractical);

  const pct = (x: number) => `${roundTo(x * 100, 1)}%`;
  let governing: string;
  if (liftsRecommended === 0) {
    governing = "No units in the program";
  } else if (liftsPractical > liftsCIBSE) {
    governing =
      liftsPractical === ruleOfThumbLifts
        ? `Rule of thumb (1 per ${cfg.unitsPerLiftRule} units)`
        : `Minimum ${cfg.dcdMinLifts} lifts (≥ ${cfg.dcdMinUnitsThreshold} units)`;
  } else if (liftsForInterval >= Math.max(liftsCIBSEStandard, liftsCIBSEPremium)) {
    governing = `CIBSE interval ≤ ${targetIntervalS} s`;
  } else {
    governing =
      liftsCIBSEPremium >= liftsCIBSEStandard
        ? `CIBSE handling ${pct(cfg.handlingPctPremium)}`
        : `CIBSE handling ${pct(cfg.handlingPctStandard)}`;
  }

  const intervalAchievedS = liftsRecommended > 0 ? rtt / liftsRecommended : 0;
  const handlingAchievedPct =
    totalPopulation > 0 && rtt > 0 ? (liftsRecommended * std.handlingWindowSec * P) / rtt / totalPopulation : 0;

  return {
    byFloor,
    totalUnits,
    totalPopulation,
    demandStandard,
    demandPremium,
    ratedPersons,
    personsPerTrip: P,
    floorsServed: N,
    totalTravelHeight,
    interfloorTimeS: tv,
    probableStops: S,
    highestReversalFloor: H,
    timePerStopS: ts,
    passengerTransferS: tp,
    rttSeconds: rtt,
    tripsPer5Min,
    capacityPerLift,
    liftsCIBSEStandard,
    liftsCIBSEPremium,
    targetIntervalS,
    liftsForInterval,
    liftsCIBSE,
    ruleOfThumbLifts,
    dcdMinLifts,
    liftsPractical,
    liftsRecommended,
    intervalAchievedS,
    handlingAchievedPct,
    governing,
  };
}
