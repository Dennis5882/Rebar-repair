import { describe, it, expect } from "vitest";
import { EMPTY_COLUMN_FORM, buildColumnPayload, fillColumnForm, type FormState } from "../columnRebarForm";
import type { ColumnLikePayload } from "../../types/rebar";

function form(overrides: Partial<FormState> = {}): FormState {
  return { ...EMPTY_COLUMN_FORM, ...overrides };
}

describe("buildColumnPayload", () => {
  it("includes corner bar + hook type only for columns (isColumn=true)", () => {
    const col = buildColumnPayload(form({ mainName: "D25", mainNum: "8", useCorner: true, cornerName: "D29", hookType: "1" }), true);
    const item = col.ITEMS[0];
    expect(item.MAIN_BAR).toMatchObject({ NAME: "D25", NUM: 8, USE_CORNER: true, NAME_CORNER: "D29" });
    expect(item.HOOK_TYPE).toBe(1);
  });

  it("omits corner bar + hook type for braces (isColumn=false)", () => {
    const brace = buildColumnPayload(form({ mainName: "D22", mainNum: "6", useCorner: true, cornerName: "D29", hookType: "1" }), false);
    const item = brace.ITEMS[0];
    expect(item.MAIN_BAR?.USE_CORNER).toBeUndefined();
    expect(item.MAIN_BAR?.NAME_CORNER).toBeUndefined();
    expect(item.HOOK_TYPE).toBeUndefined();
  });

  it("does not attach NAME_CORNER when useCorner is off, even if a name lingers", () => {
    const item = buildColumnPayload(form({ useCorner: false, cornerName: "D29" }), true).ITEMS[0];
    expect(item.MAIN_BAR?.USE_CORNER).toBe(false);
    expect(item.MAIN_BAR?.NAME_CORNER).toBeUndefined();
  });

  it("maps end/center hoop leg + dist fields", () => {
    const item = buildColumnPayload(
      form({ endName: "D13", endLegY: "3", endLegZ: "3", endDist: "100", cenName: "D13", cenLegY: "2", cenLegZ: "2", cenDist: "200" }),
      true
    ).ITEMS[0];
    expect(item.SHEAR_BAR_END).toEqual({ NAME: "D13", LEG_Y: 3, LEG_Z: 3, DIST: 100 });
    expect(item.SHEAR_BAR_CEN).toEqual({ NAME: "D13", LEG_Y: 2, LEG_Z: 2, DIST: 200 });
  });
});

describe("fillColumnForm", () => {
  it("round-trips a column payload back to the same form", () => {
    const original = form({
      mainName: "D25",
      mainNum: "8",
      mainRow: "2",
      useCorner: true,
      cornerName: "D29",
      endName: "D13",
      endLegY: "3",
      endLegZ: "3",
      endDist: "100",
      cenName: "D13",
      cenLegY: "2",
      cenLegZ: "2",
      cenDist: "200",
      doVal: "40",
      hoopType: "Ties",
      hookType: "1",
    });
    const back = fillColumnForm(buildColumnPayload(original, true), true, "Ties");
    expect(back).toEqual(original);
  });

  it("falls back to the provided hoopType when the payload omits HOOP_TYPE", () => {
    const payload: ColumnLikePayload = { ITEMS: [{ MAIN_BAR: { NAME: "D25" } }] };
    expect(fillColumnForm(payload, true, "Spirals").hoopType).toBe("Spirals");
  });

  it("ignores corner/hook fields when reading as a brace (isColumn=false)", () => {
    const payload: ColumnLikePayload = { ITEMS: [{ MAIN_BAR: { NAME: "D22", USE_CORNER: true, NAME_CORNER: "D29" }, HOOK_TYPE: 1 }] };
    const back = fillColumnForm(payload, false, "Ties");
    expect(back.useCorner).toBe(false);
    expect(back.hookType).toBe("0");
  });
});

// Live 2026-10-13: Gen NX rejects MAIN_BAR.ROW 1 ("Unknown Error") and a missing
// ROW ("Wrong Field"), so bare sections default to 2 and the save is pre-checked.
describe("column ROW guard", () => {
  it("defaults ROW to 2 only for a bare section; a stored record without ROW stays blank", () => {
    expect(fillColumnForm({ ITEMS: [{ MAIN_BAR: { NAME: "d20", NUM: 12 } }] }, true, "Ties").mainRow).toBe("");
    expect(fillColumnForm({ ITEMS: [{}] }, true, "Ties").mainRow).toBe("2");
    expect(fillColumnForm({ ITEMS: [{ MAIN_BAR: { NAME: "d20", NUM: 12, ROW: 3 } }] }, true, "Ties").mainRow).toBe("3");
  });
  it("flags ROW blank, 1, or non-integer; accepts ≥ 2", async () => {
    const { columnFormIssue } = await import("../columnRebarForm");
    expect(columnFormIssue(form({ mainRow: "" }))).toBe("rowMin");
    expect(columnFormIssue(form({ mainRow: "1" }))).toBe("rowMin");
    expect(columnFormIssue(form({ mainRow: "2.5" }))).toBe("rowMin");
    expect(columnFormIssue(form({ mainRow: "2" }))).toBeNull();
    expect(columnFormIssue(form({ mainRow: "4" }))).toBeNull();
  });
});
