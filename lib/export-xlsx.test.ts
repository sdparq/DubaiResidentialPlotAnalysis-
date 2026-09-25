import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { PRODUCTION_CITY_SAMPLE, emptyProject } from "./sample";
import { buildWorkbook } from "./export-xlsx";

const findRow = (ws: ExcelJS.Worksheet, label: string) => {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((row) => {
    if (!found && row.getCell(1).value === label) found = row;
  });
  return found;
};

describe("Excel export", () => {
  it("writes every sheet for the sample, economics included", async () => {
    const wb = buildWorkbook(PRODUCTION_CITY_SAMPLE);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "0.Setup", "1.Typologies", "2.Program", "3.Parking", "4.Lifts", "5.Waste room", "6.Economics", "7.Conclusions",
    ]);
    const lifts = wb.getWorksheet("4.Lifts")!;
    expect(findRow(lifts, "RECOMMENDED")?.getCell(2).value).toBe(5);
    expect(findRow(lifts, "RTT (s)")?.getCell(2).value).toBeCloseTo(124, 0);
    const parking = wb.getWorksheet("3.Parking")!;
    expect(findRow(parking, "BALANCE")?.getCell(4).value).toBe(15);
    // Serialises to a real .xlsx buffer and reads back.
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    expect(back.worksheets).toHaveLength(8);
  });

  it("uses the edited waste parameters in the notes", () => {
    const wb = buildWorkbook({ ...PRODUCTION_CITY_SAMPLE, garbage: { storageDays: 3, densityKgPerM3: 120 } });
    const ws = wb.getWorksheet("5.Waste room")!;
    expect(findRow(ws, "Storage (3 days)")).toBeDefined();
    expect(findRow(ws, "Volume required")?.getCell(4).value).toBe("÷ 120 kg/m³");
  });

  it("skips the economics sheet when nothing is priced", () => {
    const wb = buildWorkbook(emptyProject("Blank"));
    expect(wb.getWorksheet("6.Economics")).toBeUndefined();
  });
});
