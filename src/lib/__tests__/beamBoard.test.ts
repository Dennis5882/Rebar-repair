import { describe, it, expect } from "vitest";
import { genVerdictFromDemand, type DemandBySector } from "../beamBoard";

// genVerdictFromDemand reduces Gen NX's per-station (I/M/J) BC-TABLE verdict to
// one section verdict: OK only if every station's strength AND rebar-detail
// check passed, worst (max) ratio across stations. Returns null when there is
// no Gen NX verdict at all, so the board can fall back to the formula estimate.
describe("genVerdictFromDemand", () => {
  it("returns null when no Gen NX check data is present (demand-only)", () => {
    const d: DemandBySector = { I: { muNeg: 100, muPos: 50, vu: 80 } };
    expect(genVerdictFromDemand(d)).toBeNull();
  });

  it("returns null for an empty demand map", () => {
    expect(genVerdictFromDemand({})).toBeNull();
  });

  it("is OK when every station's CHK_STR is OK, with worst-case ratios", () => {
    const d: DemandBySector = {
      I: { chk: "OK", chkRbr: "OK", ratN: 0.22, ratP: 0.1, ratV: 0.27 },
      M: { chk: "OK", chkRbr: "OK", ratN: 0.0, ratP: 0.18, ratV: 0.16 },
      J: { chk: "OK", chkRbr: "OK", ratN: 0.21, ratP: 0.11, ratV: 0.26 },
    };
    const v = genVerdictFromDemand(d)!;
    expect(v.ok).toBe(true);
    expect(v.ratFlex).toBeCloseTo(0.22, 6); // max of all ratN/ratP
    expect(v.ratShear).toBeCloseTo(0.27, 6); // max of all ratV
  });

  it("treats a suffixed status like 'OK-' as OK", () => {
    const v = genVerdictFromDemand({ M: { chk: "OK-", ratN: 0.5, ratV: 0.3 } })!;
    expect(v.ok).toBe(true);
  });

  it("ignores non-OK/NG placeholders like '-' (does not flag NG)", () => {
    // A station Gen NX didn't govern reads "-"/"N/A", not a verdict — it must not
    // turn an otherwise-OK section into NG.
    const d: DemandBySector = {
      I: { chk: "OK", chkRbr: "OK", ratN: 0.3, ratV: 0.2 },
      M: { chk: "-", chkRbr: "N/A", ratP: 0.1, ratV: 0.15 },
    };
    const v = genVerdictFromDemand(d)!;
    expect(v.ok).toBe(true);
  });

  it("returns null when every station is a placeholder (falls back to formula)", () => {
    expect(genVerdictFromDemand({ M: { chk: "-", ratN: 0.4 } })).toBeNull();
  });

  it("is NG when any station's strength check fails", () => {
    const d: DemandBySector = {
      I: { chk: "OK", ratN: 0.9, ratV: 0.5 },
      M: { chk: "NG", ratP: 1.35, ratV: 0.5 },
    };
    const v = genVerdictFromDemand(d)!;
    expect(v.ok).toBe(false);
    expect(v.ratFlex).toBeCloseTo(1.35, 6);
  });

  it("is NG when the rebar-detail check fails even though strength is OK", () => {
    const v = genVerdictFromDemand({ M: { chk: "OK", chkRbr: "NG", ratN: 0.4, ratV: 0.2 } })!;
    expect(v.ok).toBe(false);
  });
});
