import { describe, it, expect } from "vitest";
import { gbBeamDetailing } from "../gbDetailing";
import { beamPingfa, beamPingfaLine, columnPingfa, columnPingfaLine, gbGradeLetter, wallPingfa } from "../pingfa";
import { foldBySector } from "../detailIssues";
import { toModelDiameter } from "../../data/rcCodePresets";
import type { SectorFormValues } from "../beamRebarForm";

const DB = "GB/T 1499.2"; // GB bar labels are lowercase d (live-verified)
const MAT = { fck: 30, fy: 400, fyt: 400 }; // C30 (ft 1.43), HRB400 (fy 360)
const dia = (l: string) => toModelDiameter(DB, l, "mm");
const sec = (p: Partial<SectorFormValues> = {}): SectorFormValues => ({
  topName: "d20", topNum: "3", botName: "d20", botNum: "3",
  shearName: "d8", shearLeg: "2", shearDist: "200", skinName: "", skinNum: "", ...p,
});
const all = (p: Partial<SectorFormValues> = {}) => ({ I: sec(p), M: sec(p), J: sec(p) });
const issues = (...a: Parameters<typeof gbBeamDetailing>) => gbBeamDetailing(...a).issues;

// 300×600, cover 40 ⇒ h0 560; 0.7·ft·b·h0 = 168.168 kN; ρmin = max(0.20, 45·1.43/360) = 0.20%.
describe("gbBeamDetailing", () => {
  it("passes a well-detailed section, and reports a complete check", () => {
    expect(gbBeamDetailing(MAT, DB, 300, 600, 40, 40, all(), {})).toEqual({ issues: [], complete: true });
  });

  it("checks ρmin only on the tension face: top at I/J, bottom at M (GB 55008 表4.4.6)", () => {
    const out = issues(MAT, DB, 300, 600, 40, 40, all({ topName: "d14", topNum: "2", botName: "d14", botNum: "2" }), {});
    const top = out.find((x) => x.kind === "rhoMinTop")!;
    const bot = out.find((x) => x.kind === "rhoMinBot")!;
    expect(top.sectors).toEqual(["I", "J"]); // 2d14 through-bars at M are not flagged
    expect(bot.sectors).toEqual(["M"]);
    expect(top.actual).toBeCloseTo(0.171, 3); // 2·153.94 / 180000
    expect(top.limit).toBeCloseTo(0.2, 3);
  });

  it("uses the stricter 表9.2.9 spacing without Vu, the looser one when V ≤ 0.7ftbh0", () => {
    expect(issues(MAT, DB, 300, 600, 40, 40, all({ shearDist: "300" }), {}).find((x) => x.kind === "sMax")).toMatchObject({ actual: 300, limit: 250, demandKnown: false });
    const low = { I: { vu: 50 }, M: { vu: 50 }, J: { vu: 50 } };
    expect(issues(MAT, DB, 300, 600, 40, 40, all({ shearDist: "300" }), low).some((x) => x.kind === "sMax")).toBe(false);
  });

  it("flags ρsv below 0.24ft/fyv when V may exceed 0.7ftbh0", () => {
    // 2-leg d6 @250: 56.55/(300·250) = 0.075% < 0.24·1.43/360 = 0.095%
    const i = issues(MAT, DB, 300, 600, 40, 40, all({ shearName: "d6", shearDist: "250" }), {}).find((x) => x.kind === "svMin")!;
    expect(i.actual).toBeCloseTo(0.075, 3);
    expect(i.limit).toBeCloseTo(0.095, 3);
  });

  it("flags small stirrup and bar diameters (9.2.9-2, 9.2.1-2)", () => {
    const out = issues(MAT, DB, 300, 900, 40, 40, all({ shearName: "d6", shearDist: "150", botName: "d8", botNum: "12" }), {});
    expect(out.find((x) => x.kind === "stirDia")).toMatchObject({ actual: 6, limit: 8 });
    expect(out.find((x) => x.kind === "barDiaBot")).toMatchObject({ actual: 8, limit: 10 });
  });

  it("outside the GB tables: still checks spacing/diameters, skips ρ rules, and says it is incomplete", () => {
    const r = gbBeamDetailing({ fck: 30, fy: 420, fyt: 400 }, DB, 300, 600, 40, 40, all({ topNum: "1", shearDist: "300" }), {});
    expect(r.complete).toBe(false);
    expect(r.issues.map((x) => x.kind)).toEqual(["sMax"]);
  });
});

describe("foldBySector", () => {
  it("folds only issues whose every field matches (incl. code-specific flags)", () => {
    const base = { kind: "sMax", actual: 300, limit: 270, demandKnown: true };
    const out = foldBySector([
      { sector: "I", issue: { ...base, halved: false } },
      { sector: "M", issue: { ...base, halved: false } },
      { sector: "J", issue: { ...base, halved: true } },
    ]);
    expect(out.map((o) => o.sectors)).toEqual([["I", "M"], ["J"]]);
  });
});

describe("beamPingfa (22G101-1)", () => {
  it("maps grades to the plain-text letters", () => {
    expect([300, 335, 400, 500, 420].map(gbGradeLetter)).toEqual(["A", "B", "C", "D", null]);
  });

  it("builds 集中标注 + 原位标注 from I/M/J", () => {
    const s = { I: sec({ topNum: "4", shearDist: "100" }), M: sec({ topNum: "2", shearDist: "200" }), J: sec({ topNum: "4", shearDist: "100" }) };
    const p = beamPingfa(s, 300, 600, 400, 400, dia)!;
    expect(p.section).toBe("300×600");
    expect(p.stirrup).toBe("C8@100/200(2)");
    expect(p.longitudinal).toBe("2C20;3C20");
    expect(p.inSitu).toEqual([
      { at: "I", face: "top", text: "4C20" },
      { at: "J", face: "top", text: "4C20" },
    ]);
    expect(beamPingfaLine(p)).toBe("C8@100/200(2)  2C20;3C20");
  });

  it("labels mid-span AND differing end bottom bars as 原位", () => {
    const s = { I: sec({ botNum: "4", botName: "d25" }), M: sec(), J: sec({ botNum: "4", botName: "d25" }) };
    expect(beamPingfa(s, 300, 600, 400, 400, dia)!.inSitu).toEqual([
      { at: "M", face: "bot", text: "3C20" },
      { at: "I", face: "bot", text: "4C25" },
      { at: "J", face: "bot", text: "4C25" },
    ]);
    const noMid = { I: sec({ botNum: "4" }), M: sec({ botNum: "" }), J: sec({ botNum: "4" }) };
    expect(beamPingfa(noMid, 300, 600, 400, 400, dia)!.inSitu.filter((x) => x.face === "bot").map((x) => x.at)).toEqual(["I", "J"]);
  });

  it("takes the dense zone from whichever end is valid, else mid-span", () => {
    const s = { I: sec({ shearDist: "" }), M: sec({ shearDist: "200" }), J: sec({ shearDist: "100" }) };
    expect(beamPingfa(s, 300, 600, 400, 400, dia)!.stirrup).toBe("C8@100/200(2)");
    const midOnly = { I: sec({ shearDist: "" }), M: sec({ shearDist: "150" }), J: sec({ shearDist: "" }) };
    expect(beamPingfa(midOnly, 300, 600, 400, 400, dia)!.stirrup).toBe("C8@150(2)");
  });

  it("writes differing legs / bars per zone", () => {
    const legs = { I: sec({ shearLeg: "4", shearDist: "100" }), M: sec({ shearLeg: "2", shearDist: "200" }), J: sec({ shearLeg: "4", shearDist: "100" }) };
    expect(beamPingfa(legs, 300, 600, 400, 400, dia)!.stirrup).toBe("C8@100(4)/200(2)");
    const bar = { I: sec({ shearName: "d10", shearLeg: "4", shearDist: "100" }), M: sec({ shearDist: "200" }), J: sec({ shearName: "d10", shearLeg: "4", shearDist: "100" }) };
    expect(beamPingfa(bar, 300, 600, 400, 400, dia)!.stirrup).toBe("C10@100(4)/C8@200(2)");
  });

  it("returns null for a non-GB grade", () => {
    expect(beamPingfa(all(), 300, 600, 420, 400, dia)).toBeNull();
  });
});

describe("columnPingfa / wallPingfa (22G101-1)", () => {
  const f = { mainName: "d20", mainNum: "12", useCorner: false, cornerName: "", endName: "d10", endLegY: "4", endLegZ: "4", endDist: "100", cenName: "d10", cenDist: "200" };
  it("column: 全部纵筋, 加密/非加密 ties, leg layout (live GB dummy C500x500)", () => {
    const p = columnPingfa(f, 500, 500, 400, 400, dia)!;
    expect(p).toEqual({ section: "500×500", longitudinal: "12C20", stirrup: "C10@100/200", legs: "4×4" });
    expect(columnPingfaLine(p)).toBe("12C20  C10@100/200");
  });
  it("column: corner bars split into 角筋 + 中部筋; HPB300 ties get A", () => {
    const p = columnPingfa({ ...f, useCorner: true, cornerName: "d25" }, 500, 500, 400, 300, dia)!;
    expect(p.longitudinal).toBe("角筋4C25 中部筋8C20");
    expect(p.stirrup).toBe("A10@100/200");
  });
  it("wall: Q(排) thickness + distribution bars; null off the GB grades", () => {
    expect(wallPingfa({ name: "d12", dist: "200" }, { name: "d10", dist: "200" }, 200, 2, 400, 400, dia)).toEqual({ body: "Q(2排) 200", horizontal: "C10@200", vertical: "C12@200" });
    expect(wallPingfa({ name: "d12", dist: "200" }, { name: "d10", dist: "200" }, 200, 2, 420, 400, dia)).toBeNull();
  });
});
