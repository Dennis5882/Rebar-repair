import { describe, expect, it } from "vitest";
import { buildReportArgument, normalizeExportPath, sanitizeOutputName } from "../reportArgs";

describe("normalizeExportPath", () => {
  it("turns backslashes into forward slashes (Gen NX mangles backslashes)", () => {
    expect(normalizeExportPath("C:\\MIDAS\\Report")).toBe("C:/MIDAS/Report/");
    expect(normalizeExportPath("  D:/out/  ")).toBe("D:/out/");
    expect(normalizeExportPath("C:\\\\a\\\\b\\")).toBe("C:/a/b/");
  });
  it("rejects anything that isn't an absolute Windows path", () => {
    expect(normalizeExportPath("Report")).toBeNull();
    expect(normalizeExportPath("/home/x")).toBeNull();
    expect(normalizeExportPath("")).toBeNull();
  });
});

describe("sanitizeOutputName", () => {
  it("strips folders and forbidden characters, falls back when empty", () => {
    expect(sanitizeOutputName("..\\evil/name:1", "x")).toBe(".._evil_name_1");
    expect(sanitizeOutputName("  ", "BEAM_MEMB_Detail")).toBe("BEAM_MEMB_Detail");
  });
});

describe("buildReportArgument", () => {
  const base = { exportPath: "C:\\MIDAS\\Report\\" };

  it("beam by member, Detail: ELEMS + positions, KDS-path BC-REPORT", () => {
    const r = buildReportArgument({ ...base, member: "BEAM", by: "MEMB", mode: "Detail", elemKeys: ["4", "5"], positions: { endI: true, mid: true, endJ: false } });
    expect(r).toEqual({
      ok: true,
      path: "/DESIGN/RC/KDS-41-20-2022/BC-REPORT",
      argument: {
        REPORT_TYPE: "MEMB", CURRENT_MODE_MEMB: "Detail", ELEMS: { KEYS: [4, 5] },
        DETAIL_POSITIONS: { END_I: true, MID: true, END_J: false },
        EXPORT_PATH: "C:/MIDAS/Report/", OUTPUT_NAME: "BEAM_MEMB_Detail",
      },
    });
  });

  it("column by section uses SECTIONS and CURRENT_MODE_PROP", () => {
    const r = buildReportArgument({ ...base, member: "COLUMN", by: "PROP", mode: "Summary", sectionIds: [1, "elem:9", 3] });
    expect(r.ok && r.path).toBe("/DESIGN/RC/KDS-41-20-2022/CC-REPORT");
    expect(r.ok && r.argument).toMatchObject({ REPORT_TYPE: "PROP", CURRENT_MODE_PROP: "Summary", SECTIONS: [1, 3] });
  });

  it("rejects Detail by section (Gen NX offers only Graphic/Summary there)", () => {
    expect(buildReportArgument({ ...base, member: "BEAM", by: "PROP", mode: "Detail", sectionIds: [2] })).toEqual({ ok: false, code: "bad_mode" });
  });

  it("wall: WID+STORY mode key, optional SELECTIONS", () => {
    const one = buildReportArgument({ ...base, member: "WALL", by: "WID+STORY", mode: "PMCurve", wallIds: [101, 102] });
    expect(one.ok && one.argument).toMatchObject({ CURRENT_MODE_WID_STORY: "PMCurve", SELECTIONS: [{ WALL_IDS: { KEYS: [101, 102] } }] });
    const all = buildReportArgument({ ...base, member: "WALL", by: "WID", mode: "Graphic" });
    expect(all.ok && all.argument).toMatchObject({ CURRENT_MODE_WID: "Graphic" });
    expect(all.ok && "SELECTIONS" in all.argument).toBe(false);
  });

  it("refuses empty targets, a wall 'by' on a beam, and a relative path", () => {
    expect(buildReportArgument({ ...base, member: "BEAM", by: "MEMB", mode: "Graphic", elemKeys: [] })).toEqual({ ok: false, code: "no_targets" });
    expect(buildReportArgument({ ...base, member: "BEAM", by: "WID", mode: "Graphic" })).toEqual({ ok: false, code: "bad_mode" });
    expect(buildReportArgument({ member: "BEAM", by: "MEMB", mode: "Graphic", elemKeys: [4], exportPath: "out" })).toEqual({ ok: false, code: "bad_path" });
  });
});
