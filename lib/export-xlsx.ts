import ExcelJS from "exceljs";
import type { Project } from "./types";
import { commonAreaCategory, effectiveCommonAreaTotal } from "./types";
import { analyze } from "./calc";
import { computeChecks } from "./calc/compliance";
import { BRAND } from "./brand";
import { m2ToSqft, perM2ToPerSqft } from "./units";
import { safeFileName } from "./project-io";

const HDR_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF33422E" } } as const;
const SUB_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9DF" } } as const;
const HDR_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const BOLD = { bold: true };

const N0 = "#,##0";
const N2 = "#,##0.00";
const PCT = "0.0%";

type Cell = string | number | null;

function title(ws: ExcelJS.Worksheet, text: string, sub?: string) {
  ws.addRow([text]).font = { bold: true, size: 14 };
  if (sub) ws.addRow([sub]).font = { italic: true, color: { argb: "FF6B6B6B" } };
  ws.addRow([]);
}
function header(ws: ExcelJS.Worksheet, cols: string[]) {
  const row = ws.addRow(cols);
  row.eachCell((c) => {
    c.fill = HDR_FILL as ExcelJS.FillPattern;
    c.font = HDR_FONT;
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  row.height = 22;
}
function section(ws: ExcelJS.Worksheet, text: string) {
  ws.addRow([]);
  ws.addRow([text]).font = BOLD;
}
function subtotal(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = SUB_FILL as ExcelJS.FillPattern;
    c.font = BOLD;
  });
}
/** Add a row and apply number formats per column (1-based index → format). */
function add(ws: ExcelJS.Worksheet, values: Cell[], formats: Record<number, string> = {}) {
  const row = ws.addRow(values);
  for (const [col, fmt] of Object.entries(formats)) row.getCell(Number(col)).numFmt = fmt;
  return row;
}
function widths(ws: ExcelJS.Worksheet, w: number[]) {
  w.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build the multi-sheet feasibility workbook (no browser APIs — also used by the tests). */
export function buildWorkbook(project: Project): ExcelJS.Workbook {
  const r = analyze(project);
  const checks = computeChecks(project, r);
  const { program: p, parking: k, lifts: l, garbage: g, economic: e } = r;
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.productName;
  wb.created = new Date();
  const stamp = `${BRAND.productName} · exported ${new Date().toLocaleDateString("en-GB")}`;

  // ===== 0. Setup =====
  const wsS = wb.addWorksheet("0.Setup");
  title(wsS, `PROJECT: ${project.name}`, stamp);
  header(wsS, ["Field", "Value", "Unit"]);
  const setupRows: [string, Cell, string, string?][] = [
    ["Area / community", project.zone || "—", ""],
    ["Plot number", project.plotNumber ?? "—", ""],
    ["Plot area", project.plotArea, "m²", N2],
    ["Plot area", r2(m2ToSqft(project.plotArea)), "sq ft", N0],
    ["Residential floors", project.numFloors, "", N0],
    ["Floor-to-floor height", project.floorHeight, "m", N2],
    ["Shafts per unit", project.shaftPerUnit, "m²", N2],
    ["Accessible (PRM) parking", project.prmPercent, "%", PCT],
    ["Permitted GFA", project.targetGFA ?? "—", "m²", N2],
    ["Max FAR", project.maxFAR ?? "—", "", N2],
    ["Max height", project.maxHeightM ?? "—", "m", N2],
    ["Latitude", project.latitude ?? "—", "°"],
    ["Longitude", project.longitude ?? "—", "°"],
    ["Total GFA", r2(p.totalGFABuilding), "m²", N2],
    ["Total BUA", r2(p.totalBUABuilding), "m²", N2],
    ["Total sellable (incl. balconies)", r2(p.totalSellable), "m²", N2],
    ["FAR", Number(p.far.toFixed(3)), "", "0.000"],
  ];
  for (const [label, value, unit, fmt] of setupRows) add(wsS, [label, value, unit], fmt && typeof value === "number" ? { 2: fmt } : {});
  widths(wsS, [34, 22, 10]);

  // ===== 1. Typologies & mix =====
  const wsT = wb.addWorksheet("1.Typologies");
  title(wsT, `TYPOLOGIES & UNIT MIX — ${project.name.toUpperCase()}`);
  header(wsT, ["Typology", "Category", "Interior (m²)", "Balcony (m²)", "Sellable (m²)", "Sellable (sq ft)", "Occupancy", "Parking / unit", "Units", "% of units"]);
  for (const ts of p.byTypology) {
    const t = ts.typology;
    add(
      wsT,
      [t.name, t.category, t.internalArea, t.balconyArea, r2(t.internalArea + t.balconyArea), Math.round(m2ToSqft(t.internalArea + t.balconyArea)), t.occupancy, t.parkingPerUnit, ts.totalUnits, ts.pctOfTotal],
      { 3: N2, 4: N2, 5: N2, 6: N0, 9: N0, 10: PCT }
    );
  }
  subtotal(add(wsT, ["TOTAL", "", null, null, null, null, null, null, p.totalUnits, p.totalUnits > 0 ? 1 : 0], { 9: N0, 10: PCT }));
  widths(wsT, [26, 12, 14, 14, 14, 16, 12, 14, 10, 12]);

  // ===== 2. Program =====
  const wsP = wb.addWorksheet("2.Program");
  title(wsP, `BUILDING PROGRAM — ${project.name.toUpperCase()}`);
  header(wsP, ["Floor", "Typology", "Units", "Int. area (m²)", "Balcony (m²)", "Total balcony (m²)", "Sellable / unit (m²)", "Total sellable (m²)", "Total interior GFA (m²)"]);
  const tById = new Map(project.typologies.map((t) => [t.id, t]));
  for (const f of p.byFloor) {
    for (const cell of project.program.filter((c) => c.floor === f.floor && c.count > 0)) {
      const t = tById.get(cell.typologyId);
      if (!t) continue;
      add(
        wsP,
        [`Floor ${f.floor}`, t.name, cell.count, t.internalArea, t.balconyArea, r2(cell.count * t.balconyArea), r2(t.internalArea + t.balconyArea), r2(cell.count * (t.internalArea + t.balconyArea)), r2(cell.count * t.internalArea)],
        { 3: N0, 4: N2, 5: N2, 6: N2, 7: N2, 8: N2, 9: N2 }
      );
    }
    subtotal(add(wsP, [`Subtotal Floor ${f.floor}`, "", f.units, null, null, r2(f.totalBalcony), null, r2(f.totalSellable), r2(f.totalInteriorGFA)], { 3: N0, 6: N2, 8: N2, 9: N2 }));
  }
  wsP.addRow([]);
  subtotal(add(wsP, ["SHAFTS DEDUCTION", "", p.totalUnits, null, null, null, null, null, -p.shaftsDeduction], { 3: N0, 9: N2 }));
  subtotal(add(wsP, ["TOTAL RESIDENTIAL", "", p.totalUnits, null, null, r2(p.totalBalcony), null, r2(p.totalSellable), r2(p.totalInteriorGFA)], { 3: N0, 6: N2, 8: N2, 9: N2 }));

  section(wsP, "COMMON AREAS & SERVICES");
  header(wsP, ["Element", project.commonAreasInputMode === "percentage" ? "% of GFA" : "Area (m²)", "Floors", "Total (m²)", "Category", "Notes"]);
  for (const c of project.commonAreas) {
    const pctMode = project.commonAreasInputMode === "percentage";
    add(wsP, [c.name, c.area, pctMode ? null : c.floors, r2(effectiveCommonAreaTotal(c, project)), commonAreaCategory(c), c.notes ?? ""], { 2: pctMode ? PCT : N2, 3: N0, 4: N2 });
  }
  subtotal(add(wsP, ["Subtotal · GFA", null, null, r2(p.commonAreasGFA)], { 4: N2 }));
  add(wsP, ["Subtotal · BUA only", null, null, r2(p.commonAreasBUAonly)], { 4: N2 });
  add(wsP, ["Subtotal · Open air", null, null, r2(p.commonAreasOpen)], { 4: N2 });
  wsP.addRow([]);
  subtotal(add(wsP, ["TOTAL GFA BUILDING", null, null, r2(p.totalGFABuilding), `FAR ${p.far.toFixed(3)}`], { 4: N2 }));
  subtotal(add(wsP, ["TOTAL BUA BUILDING", null, null, r2(p.totalBUABuilding), "Includes balconies + BUA-only commons"], { 4: N2 }));

  section(wsP, "EFFICIENCY");
  header(wsP, ["Category", "GFA (m²)", "% of Total GFA"]);
  const eff = p.efficiency;
  const effRows: [string, number, number][] = [
    ["Residential (net of shafts)", eff.residentialNetGFA, eff.residentialNetPct],
    ["Circulation", eff.circulationGFA, eff.circulationPct],
    ["Services / MEP", eff.servicesGFA, eff.servicesPct],
    ["Amenities (GFA)", eff.amenitiesGFAarea, eff.amenitiesPct],
  ];
  for (const [label, v, pct] of effRows) add(wsP, [label, r2(v), pct], { 2: N2, 3: PCT });
  widths(wsP, [26, 26, 12, 18, 18, 22, 22, 22, 22]);

  // ===== 3. Parking =====
  const wsK = wb.addWorksheet("3.Parking");
  title(wsK, `PARKING — ${project.name.toUpperCase()}`);
  header(wsK, ["Level", "Standard", "PRM", "Total", "Notes"]);
  for (const lvl of project.parking) add(wsK, [lvl.name, lvl.standard, lvl.prm, lvl.standard + lvl.prm, lvl.notes ?? ""], { 2: N0, 3: N0, 4: N0 });
  subtotal(add(wsK, ["AVAILABLE", k.availableStandard, k.availablePRM, k.availableTotal, ""], { 2: N0, 3: N0, 4: N0 }));
  section(wsK, "REQUIREMENT");
  header(wsK, ["Typology / use", "Units or m²", "Ratio", "Required", ""]);
  for (const rt of k.requiredByTypology) add(wsK, [rt.typology.name, rt.units, `${rt.ratio} / unit`, r2(rt.required), rt.typology.category], { 2: N0, 4: N2 });
  for (const ou of k.otherUsesRequired) add(wsK, [`Other: ${ou.name}`, ou.netArea, `${ou.ratio} / 100 m²`, ou.required, ""], { 2: N2, 4: N0 });
  subtotal(add(wsK, ["TOTAL REQUIRED", null, null, k.grandRequired, ""], { 4: N0 }));
  add(wsK, [`Of which accessible / PRM (${(project.prmPercent * 100).toFixed(1)}%)`, null, null, k.requiredPRM, `PRM balance: ${k.prmBalance}`], { 4: N0 });
  subtotal(add(wsK, ["BALANCE", null, null, k.grandBalance, "Available − required"], { 4: N0 }));
  widths(wsK, [40, 14, 16, 14, 32]);

  // ===== 4. Lifts =====
  const wsL = wb.addWorksheet("4.Lifts");
  title(wsL, `LIFT CALCULATION — ${project.name.toUpperCase()}`, "CIBSE Guide D up-peak round trip: RTT = 2·H·tv + (S+1)·ts + 2·P·tp");
  header(wsL, ["Floor", "Units", "Population"]);
  for (const f of l.byFloor) add(wsL, [`Floor ${f.floor}`, f.units, r2(f.population)], { 2: N0, 3: N2 });
  subtotal(add(wsL, ["TOTAL", l.totalUnits, r2(l.totalPopulation)], { 2: N0, 3: N2 }));
  section(wsL, "ROUND TRIP");
  header(wsL, ["Parameter", "Value", "Notes"]);
  const liftRows: [string, number, string, string][] = [
    ["Cabin rated load (kg)", project.lifts.cabinKg, `${l.ratedPersons} persons rated`, N0],
    ["P — passengers per trip", l.personsPerTrip, "80 % of rated", N0],
    ["N — floors served", l.floorsServed, "above the ground-floor lobby", N0],
    ["Rated speed (m/s)", project.lifts.speed, "", N2],
    ["tv — floor transit (s)", r2(l.interfloorTimeS), `${project.floorHeight} m ÷ speed`, N2],
    ["ts — time per stop (s)", l.timePerStopS, "", N2],
    ["tp — passenger transfer (s)", l.passengerTransferS, "", N2],
    ["S — probable stops", r2(l.probableStops), "N·[1 − (1 − 1/N)^P]", N2],
    ["H — highest reversal floor", r2(l.highestReversalFloor), "N − Σ(i/N)^P", N2],
    ["RTT (s)", r2(l.rttSeconds), "", N2],
    ["Handling per lift (persons / 5 min)", l.capacityPerLift, "300·P / RTT", N0],
    ["Demand — standard", l.demandStandard, `${(project.lifts.handlingPctStandard * 100).toFixed(1)}% of population in 5 min`, N0],
    ["Demand — premium", l.demandPremium, `${(project.lifts.handlingPctPremium * 100).toFixed(1)}% of population in 5 min`, N0],
  ];
  for (const [label, v, note, fmt] of liftRows) add(wsL, [label, v, note], { 2: fmt });
  section(wsL, "LIFTS REQUIRED");
  header(wsL, ["Criterion", "Lifts", "Notes"]);
  add(wsL, ["CIBSE handling — standard", l.liftsCIBSEStandard, `ceil(${l.demandStandard} ÷ ${l.capacityPerLift})`], { 2: N0 });
  add(wsL, ["CIBSE handling — premium", l.liftsCIBSEPremium, `ceil(${l.demandPremium} ÷ ${l.capacityPerLift})`], { 2: N0 });
  add(wsL, [`CIBSE interval ≤ ${l.targetIntervalS} s`, l.liftsForInterval, `ceil(${l.rttSeconds.toFixed(1)} ÷ ${l.targetIntervalS})`], { 2: N0 });
  add(wsL, [`Rule of thumb (1 per ${project.lifts.unitsPerLiftRule} units)`, l.ruleOfThumbLifts, ""], { 2: N0 });
  add(wsL, [`Minimum (≥ ${project.lifts.dcdMinUnitsThreshold} units)`, l.dcdMinLifts, "Configured requirement"], { 2: N0 });
  subtotal(add(wsL, ["RECOMMENDED", l.liftsRecommended, l.governing], { 2: N0 }));
  add(wsL, ["Average interval (s)", r2(l.intervalAchievedS), `target ≤ ${l.targetIntervalS} s`], { 2: N2 });
  add(wsL, ["Handling capacity achieved", l.handlingAchievedPct, "of the population in 5 min"], { 2: PCT });
  widths(wsL, [38, 14, 44]);

  // ===== 5. Waste room =====
  const wsG = wb.addWorksheet("5.Waste room");
  title(wsG, `WASTE ROOM — ${project.name.toUpperCase()}`, "Dubai Municipality method — parameters as set in the app");
  header(wsG, ["Parameter", "Value", "Unit", "Notes"]);
  add(wsG, ["Residential GFA", r2(g.residentialGFA), "m²", "Sum of unit interiors"], { 2: N2 });
  add(wsG, ["Daily waste generation", g.dailyWasteKg, "kg/day", `${g.generationKgPer100sqmPerDay} kg / 100 m² / day × GFA`], { 2: N2 });
  add(wsG, [`Storage (${g.storageDays} days)`, g.storageKg, "kg", ""], { 2: N2 });
  add(wsG, ["Volume required", g.volumeRequiredM3, "m³", `÷ ${g.densityKgPerM3} kg/m³`], { 2: N2 });
  add(wsG, [`Containers (${g.containerCapacityM3} m³)`, g.containers, "units", "Volume ÷ capacity, rounded up"], { 2: N0 });
  add(wsG, ["Room width", g.roomWidthM, "m", `N × ${g.containerWidthM} + (N+1) × ${g.separationM}`], { 2: N2 });
  add(wsG, ["Room depth", g.roomDepthM, "m", `${g.containerLengthM} + ${g.frontClearanceM} clearance`], { 2: N2 });
  subtotal(add(wsG, ["TOTAL ROOM AREA", g.roomAreaM2, "m²", ""], { 2: N2 }));
  widths(wsG, [32, 16, 10, 40]);

  // ===== 6. Economics =====
  const cur = e.currency;
  if (e.totalRevenue > 0 || e.totalCost > 0) {
    const wsE = wb.addWorksheet("6.Economics");
    title(wsE, `ECONOMICS — ${project.name.toUpperCase()}`, `All amounts in ${cur}`);
    header(wsE, ["Typology", "Units", "Sellable / unit (sq ft)", `${cur} / sq ft`, `${cur} / m²`, "Price / unit", "Revenue", "% GDV"]);
    for (const row of e.perTypologyRevenue) {
      add(
        wsE,
        [row.typology.name, row.units, Math.round(m2ToSqft(row.sellablePerUnit)), r2(perM2ToPerSqft(row.pricePerM2)), Math.round(row.pricePerM2), Math.round(row.pricePerUnit), Math.round(row.totalRevenue), row.pctOfRevenue],
        { 2: N0, 3: N0, 4: N2, 5: N0, 6: N0, 7: N0, 8: PCT }
      );
    }
    subtotal(add(wsE, ["Residential", null, null, r2(perM2ToPerSqft(e.avgPricePerM2Sellable)), Math.round(e.avgPricePerM2Sellable), Math.round(e.avgPricePerUnit), Math.round(e.residentialRevenue), null], { 4: N2, 5: N0, 6: N0, 7: N0 }));
    add(wsE, ["Parking sales", null, null, null, null, null, Math.round(e.parkingRevenue), null], { 7: N0 });
    add(wsE, ["Retail / F&B", null, null, null, null, null, Math.round(e.retailRevenue), null], { 7: N0 });
    subtotal(add(wsE, ["GDV", null, null, null, null, null, Math.round(e.totalRevenue), null], { 7: N0 }));

    section(wsE, "COSTS");
    header(wsE, ["Line", "Basis", "Amount", "% TDC", "% GDV"]);
    for (const c of e.costs) add(wsE, [c.label, c.basis, Math.round(c.amount), c.pctOfTotalCost, c.pctOfRevenue], { 3: N0, 4: PCT, 5: PCT });
    subtotal(add(wsE, ["TOTAL DEVELOPMENT COST", "", Math.round(e.totalCost), 1, e.totalRevenue > 0 ? e.totalCost / e.totalRevenue : 0], { 3: N0, 4: PCT, 5: PCT }));

    section(wsE, "FEASIBILITY");
    header(wsE, ["Metric", "Value", "Notes"]);
    add(wsE, ["Profit", Math.round(e.profit), "GDV − TDC"], { 2: N0 });
    add(wsE, ["Margin on GDV", e.marginOnGDV, `target ${(e.targetMarginPct * 100).toFixed(0)}%`], { 2: PCT });
    add(wsE, ["Margin on cost", e.marginOnCost, ""], { 2: PCT });
    add(wsE, ["Land price / sq ft GFA", r2(e.landCostPerSqftGFA), `${Math.round(e.landCost).toLocaleString("en-US")} ${cur} land`], { 2: N2 });
    add(wsE, ["Residual land value", Math.round(e.residualLandValue), "Max land price (before DLD fee) for the target margin"], { 2: N0 });
    add(wsE, ["Residual land / sq ft GFA", r2(e.residualLandPerSqftGFA), ""], { 2: N2 });
    add(wsE, ["Break-even price / sq ft sellable", r2(perM2ToPerSqft(e.costPerM2Sellable)), "Total cost ÷ sellable area"], { 2: N2 });
    widths(wsE, [34, 30, 18, 14, 14, 14, 16, 10]);
  }

  // ===== 7. Conclusions =====
  const wsC = wb.addWorksheet("7.Conclusions");
  title(wsC, `PROJECT ANALYSIS — ${project.name.toUpperCase()}`, stamp);
  header(wsC, ["Check", "Status", "Detail"]);
  for (const c of checks) add(wsC, [c.label, c.status === "ok" ? "OK" : c.status === "fail" ? "REVIEW" : "INFO", c.detail]);
  if (project.notes) {
    section(wsC, "NOTES");
    project.notes.split("\n").forEach((line) => wsC.addRow([line]));
  }
  wsC.addRow([]);
  wsC.addRow(["Pre-concept feasibility figures. Verify against current Dubai Municipality, Dubai Civil Defence and RTA requirements."]).font = {
    italic: true,
    color: { argb: "FF6B6B6B" },
  };
  widths(wsC, [30, 12, 90]);

  return wb;
}

export async function exportToExcel(project: Project) {
  const buf = await buildWorkbook(project).xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(project.name)}_analysis.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
