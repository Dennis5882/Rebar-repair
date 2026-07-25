import { describe, it, expect } from "vitest";
import { memberVerdictFromRows } from "../memberCheck";
import type { MemberCheckRow } from "../api";

// memberVerdictFromRows reduces a column's per-element rows (or a wall's per-story
// rows) to one verdict: OK only if every row's strength + rebar-detail passed,
// worst-case ratios. Null when no recognizable OK/NG is present.
describe("memberVerdictFromRows", () => {
  it("returns null for no rows / empty", () => {
    expect(memberVerdictFromRows(undefined)).toBeNull();
    expect(memberVerdictFromRows([])).toBeNull();
  });

  it("returns null when no row carries an OK/NG verdict", () => {
    const rows: MemberCheckRow[] = [{ ratPM: 0.3, ratShear: 0.2 }];
    expect(memberVerdictFromRows(rows)).toBeNull();
  });

  it("is OK across column elements with worst-case ratios", () => {
    const rows: MemberCheckRow[] = [
      { chk: "OK-", ratPM: 0.25, ratShear: 0.06 },
      { chk: "OK-", ratPM: 0.27, ratShear: 0.05 },
      { chk: "OK", ratPM: 0.11, ratShear: 0.04 },
    ];
    const v = memberVerdictFromRows(rows)!;
    expect(v.ok).toBe(true);
    expect(v.ratPM).toBeCloseTo(0.27, 6);
    expect(v.ratShear).toBeCloseTo(0.06, 6);
  });

  it("is NG when any element's strength check fails", () => {
    const rows: MemberCheckRow[] = [
      { chk: "OK", ratPM: 0.4, ratShear: 0.2 },
      { chk: "NG", ratPM: 1.2, ratShear: 0.3 },
    ];
    const v = memberVerdictFromRows(rows)!;
    expect(v.ok).toBe(false);
    expect(v.ratPM).toBeCloseTo(1.2, 6);
  });

  it("ignores a column CHK_RBR position code ('M') — not a verdict", () => {
    // Columns put "M"/"I"/"J" in CHK_RBR; it must not flag NG.
    const v = memberVerdictFromRows([{ chk: "OK-", chkRbr: "M", ratPM: 0.3, ratShear: 0.2 }])!;
    expect(v.ok).toBe(true);
  });

  it("is NG when a wall's rebar-detail (CHK_RBR) fails even if strength is OK", () => {
    const v = memberVerdictFromRows([{ chk: "OK", chkRbr: "NG", ratPM: 0.5, ratShear: 0.1 }])!;
    expect(v.ok).toBe(false);
  });

  it("ignores '----'/'-' placeholders (wall) as neither OK nor NG", () => {
    const rows: MemberCheckRow[] = [
      { chk: "OK", chkRbr: "OK", ratPM: 0.12, ratShear: 0.01 },
      { chk: "----", chkRbr: "-", ratPM: 0.0, ratShear: 0.0 },
    ];
    const v = memberVerdictFromRows(rows)!;
    expect(v.ok).toBe(true);
  });
});
