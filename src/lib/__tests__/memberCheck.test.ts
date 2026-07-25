import { describe, it, expect } from "vitest";
import { memberVerdictFromRows, parseColumnRows, parseWallRows, parseBraceRows } from "../memberCheck";
import type { MemberCheckRow } from "../api";

// HEAD rows captured live from Gen NX (2026-07-25) — the column-name mapping
// these tests guard is the part most likely to silently break on a Gen NX update.
const CC_HEAD = ["MEMB", "SECT", "CHK_STR", "Rat_P", "Rat_M", "Rat_My", "Rat_Mz", "Rat_V_end", "Rat_V_mid"];
const WC_HEAD = ["WID", "Story", "CHK_STR", "CHK_RBR", "Rat-Py", "Rat-Pz", "Rat-My", "Rat-Mz", "Rat-V"];
const BRC_HEAD = ["MEMB", "SECT", "CHK_STR", "Rat-P", "Rat-M", "Rat-My", "Rat-Mz", "Rat-V"];

describe("parseColumnRows", () => {
  it("groups by SECT and takes the governing P-M / shear ratios per element", () => {
    const rows = [
      ["242", "213", "OK-", "0.251", "0.123", "0.30", "0.123", "0.061", "0.061"],
      ["243", "213", "OK-", "0.269", "0.10", "0.10", "0.10", "0.045", "0.045"],
      ["300", "214", "OK", "0.40", "0.20", "0.20", "0.20", "0.10", "0.10"],
    ];
    const out = parseColumnRows(CC_HEAD, rows);
    expect(Object.keys(out).sort()).toEqual(["213", "214"]);
    expect(out["213"]).toHaveLength(2);
    // element 242: ratPM = max(0.251,0.123,0.30,0.123) = 0.30, ratShear = 0.061
    expect(out["213"][0].ratPM).toBeCloseTo(0.3, 6);
    expect(out["213"][0].ratShear).toBeCloseTo(0.061, 6);
    expect(out["213"][0].chk).toBe("OK-");
    // The column parser never emits chkRbr — CC-TABLE's CHK_RBR is a position
    // code ("M"), not a verdict, so it must not reach the reducer.
    expect(out["213"][0].chkRbr).toBeUndefined();
  });

  it("returns {} when the SECT column is absent (mismatched HEAD)", () => {
    expect(parseColumnRows(["MEMB", "CHK_STR"], [["1", "OK"]])).toEqual({});
  });
});

describe("parseBraceRows", () => {
  it("groups by SECT with hyphenated ratio columns, no chkRbr (mode code)", () => {
    // Live: passing brace CHK_STR="OK-#"; failing brace CHK_STR="PM-".
    const rows = [
      ["6584", "32", "OK-#", "0.102", "0.101", "0.101", "0.101", "0.002"],
      ["6585", "32", "OK-#", "0.104", "0.104", "0.104", "0.104", "0.002"],
    ];
    const out = parseBraceRows(BRC_HEAD, rows);
    expect(Object.keys(out)).toEqual(["32"]);
    expect(out["32"]).toHaveLength(2);
    expect(out["32"][0].chk).toBe("OK-#");
    expect(out["32"][0].chkRbr).toBeUndefined();
    expect(out["32"][1].ratPM).toBeCloseTo(0.104, 6);
    expect(out["32"][0].ratShear).toBeCloseTo(0.002, 6);
  });
});

describe("parseWallRows", () => {
  it("groups by WID with hyphenated ratio columns and both CHK strings", () => {
    const rows = [["1", "1F", "OK", "OK", "0.115", "0.000", "0.094", "0.000", "0.007"]];
    const out = parseWallRows(WC_HEAD, rows);
    expect(Object.keys(out)).toEqual(["1"]);
    const r = out["1"][0];
    expect(r.chk).toBe("OK");
    expect(r.chkRbr).toBe("OK");
    expect(r.ratPM).toBeCloseTo(0.115, 6); // max(Rat-Py,Rat-Pz,Rat-My,Rat-Mz)
    expect(r.ratShear).toBeCloseTo(0.007, 6); // Rat-V
  });

  it("leaves ratios undefined for '----'/'-' placeholder cells", () => {
    const rows = [["2", "2F", "OK", "OK", "----", "-", "----", "-", "-"]];
    const r = parseWallRows(WC_HEAD, rows)["2"][0];
    expect(r.ratPM).toBeUndefined();
    expect(r.ratShear).toBeUndefined();
  });
});

// memberVerdictFromRows reduces a column/brace's per-element rows (or a wall's
// per-story rows) to one verdict: OK only if every row passed, worst-case
// ratios. A checked member's CHK_STR reads "OK…" on pass and a governing-mode
// code ("PM-", "V-") on FAIL — never literal "NG" — so the rule is
// "OK-prefix ⇒ pass, else fail", with pure placeholders ("-", "N/A") ignored.
describe("memberVerdictFromRows", () => {
  it("returns null for no rows / empty / no verdict field", () => {
    expect(memberVerdictFromRows(undefined)).toBeNull();
    expect(memberVerdictFromRows([])).toBeNull();
    expect(memberVerdictFromRows([{ ratPM: 0.3, ratShear: 0.2 }])).toBeNull();
  });

  it("is OK across elements with worst-case ratios (incl. 'OK-#' suffix)", () => {
    const rows: MemberCheckRow[] = [
      { chk: "OK-", ratPM: 0.25, ratShear: 0.06 },
      { chk: "OK-#", ratPM: 0.27, ratShear: 0.05 },
      { chk: "OK", ratPM: 0.11, ratShear: 0.04 },
    ];
    const v = memberVerdictFromRows(rows)!;
    expect(v.ok).toBe(true);
    expect(v.ratPM).toBeCloseTo(0.27, 6);
    expect(v.ratShear).toBeCloseTo(0.06, 6);
  });

  it("is NG on a literal 'NG'", () => {
    const v = memberVerdictFromRows([{ chk: "OK", ratPM: 0.4 }, { chk: "NG", ratPM: 1.2 }])!;
    expect(v.ok).toBe(false);
    expect(v.ratPM).toBeCloseTo(1.2, 6);
  });

  it("is NG on a governing-mode failure code ('PM-') — not just literal 'NG'", () => {
    // A failing brace/column reads its governing mode, e.g. "PM-". This must be
    // treated as NG, not ignored (the bug the old '/ng/ only' rule had).
    const v = memberVerdictFromRows([{ chk: "PM-", ratPM: 5019.7, ratShear: 0.11 }])!;
    expect(v.ok).toBe(false);
  });

  it("is NG when a wall's rebar-detail (CHK_RBR) fails even if strength is OK", () => {
    const v = memberVerdictFromRows([{ chk: "OK", chkRbr: "NG", ratPM: 0.5, ratShear: 0.1 }])!;
    expect(v.ok).toBe(false);
  });

  it("ignores '----'/'-'/'N/A' placeholder verdict cells", () => {
    const rows: MemberCheckRow[] = [
      { chk: "OK", chkRbr: "OK", ratPM: 0.12, ratShear: 0.01 },
      { chk: "----", chkRbr: "-", ratPM: 0.0, ratShear: 0.0 },
      { chk: "N/A", ratPM: 0.0 },
    ];
    expect(memberVerdictFromRows(rows)!.ok).toBe(true);
  });
});
