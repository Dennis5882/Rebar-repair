import { describe, it, expect } from "vitest";
import { gbBeamDetailing } from "../gbDetailing";
import {
  axialRatio,
  beamRhoMinSeismic,
  columnAxialRatioLimit,
  columnDenseTie,
  columnRhoMinSeismic,
  columnRhoVMin,
  gbColumnSeismic,
  gbWallSeismic,
  lambdaV,
  tieRhoV,
  wallAxialRatioLimit,
  wallDistRhoMin,
} from "../gbSeismic";
import type { SectorFormValues } from "../beamRebarForm";

const DB = "GB/T 1499.2";
const MAT = { fck: 30, fy: 400, fyt: 400 }; // C30 (fc 14.3, ft 1.43), HRB400 (fy 360)
const sec = (p: Partial<SectorFormValues> = {}): SectorFormValues => ({
  topName: "d20", topNum: "3", botName: "d20", botNum: "3",
  shearName: "d8", shearLeg: "2", shearDist: "200", skinName: "", skinNum: "", ...p,
});
const ends = (end: Partial<SectorFormValues>, mid: Partial<SectorFormValues> = {}) => ({ I: sec(end), M: sec(mid), J: sec(end) });
const kinds = (r: { issues: { kind: string }[] }) => r.issues.map((x) => x.kind);

// 300×600, cover 40 ⇒ h0 560.
describe("gbBeamDetailing with a seismic grade (GB 55008 4.4.8 / GB 50011 6.3.3–6.3.4)", () => {
  it("passes a 二级 beam with a 100 mm end dense zone", () => {
    expect(gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({ shearDist: "100" }), {}, 2)).toEqual({ issues: [], complete: true });
  });

  it("flags end stirrups against min(h/4, 8d, 100) and 一级's Ø10", () => {
    const g2 = gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({}), {}, 2).issues.find((x) => x.kind === "seisDenseS")!;
    expect(g2).toMatchObject({ sectors: ["I", "J"], actual: 200, limit: 100 });
    const g1 = gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({ shearDist: "100" }), {}, 1);
    expect(g1.issues.find((x) => x.kind === "seisDenseDia")).toMatchObject({ actual: 8, limit: 10 });
    expect(kinds(g1)).not.toContain("seisDenseS"); // min(150, 120, 100) = 100
  });

  it("uses 表4.4.8-1 support ρmin at the ends instead of the non-seismic floor", () => {
    // 二级 support: max(0.30, 65·1.43/360 = 0.258) = 0.30%; 2d16 = 402 mm² → 0.223%
    const r = gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({ topName: "d16", topNum: "2", shearDist: "100" }), {}, 2);
    expect(r.issues.find((x) => x.kind === "seisRhoMinTop")).toMatchObject({ sectors: ["I", "J"], limit: 0.3 });
    expect(kinds(r)).not.toContain("rhoMinTop");
  });

  it("heavy end top steel: x/h0, bottom/top ratio, +2 mm stirrup, through-bar quarter", () => {
    // I/J top 8d25 = 3927 mm² (ρ 2.34% of b·h0 > 2% ⇒ Ø ≥ 10); bottom 3d20 = 942.5 mm²
    // x = 360·(3927 − 942.5)/(14.3·300) = 250.4 ⇒ x/h0 0.447 > 0.35; bot/top 0.24 < 0.3
    // M top 2d14 = 308 mm² < 3927/4 = 982 (二级)
    const r = gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({ topName: "d25", topNum: "8", shearDist: "100" }, { topName: "d14", topNum: "2" }), {}, 2);
    expect(r.issues.find((x) => x.kind === "seisXh0")!.actual).toBeCloseTo(0.447, 2);
    expect(r.issues.find((x) => x.kind === "seisBotTop")!.actual).toBeCloseTo(0.24, 2);
    expect(r.issues.find((x) => x.kind === "seisDenseDia")).toMatchObject({ actual: 8, limit: 10 });
    expect(r.issues.find((x) => x.kind === "seisThroughTop")).toMatchObject({ actual: 308, limit: 982 });
    expect(kinds(r)).not.toContain("seisRhoMax"); // 2.34% ≤ 2.5%
  });

  it("三、四级 drop the x/h0 / bottom-top / quarter rules where the code has none", () => {
    const r = gbBeamDetailing(MAT, DB, 300, 600, 40, 40, ends({ topName: "d25", topNum: "8", shearName: "d10", shearDist: "100" }, { topName: "d14", topNum: "2" }), {}, 4);
    expect(kinds(r)).toEqual([]);
  });
});

describe("gbSeismic tables", () => {
  it("beam ρmin follows 表4.4.8-1", () => {
    expect(beamRhoMinSeismic(1, "support", 1.43, 360)).toBeCloseTo(0.4, 6);
    expect(beamRhoMinSeismic(1, "support", 2.04, 360)).toBeCloseTo((80 * 2.04) / 360, 6); // C60 ⇒ ft term governs
    expect(beamRhoMinSeismic(3, "span", 1.43, 360)).toBeCloseTo(0.2, 6);
  });

  it("column axial ratio limits (表6.3.6) and μN", () => {
    expect(columnAxialRatioLimit(1, "frame")).toBe(0.65);
    expect(columnAxialRatioLimit(4, "dual")).toBe(0.95);
    expect(columnAxialRatioLimit(3, "frameSupported")).toBeNull();
    expect(axialRatio(-2145, 500 * 500, 14.3)).toBeCloseTo(0.6, 6);
  });

  it("column ρmin (表4.4.9-1) with the bar-grade and C60 add-ons", () => {
    expect(columnRhoMinSeismic(2, "inner", "frame", 400, 30)).toBeCloseTo(0.85, 6);
    expect(columnRhoMinSeismic(2, "inner", "dual", 500, 30)).toBeCloseTo(0.7, 6);
    expect(columnRhoMinSeismic(1, "corner", "dual", 300, 65)).toBeCloseTo(1.3, 6);
  });

  it("column dense ties (表4.4.9-2)", () => {
    expect(columnDenseTie(1, 20, 600)).toEqual({ sMax: 100, dMin: 10 });
    expect(columnDenseTie(3, 16, 400)).toEqual({ sMax: 128, dMin: 6 });
    expect(columnDenseTie(3, 25, 500, true)).toEqual({ sMax: 100, dMin: 8 });
  });

  it("λv interpolates 表6.3.9 and ρv,min applies the C35 floor and grade minimum", () => {
    expect(lambdaV(2, 0.2)).toBe(0.08);
    expect(lambdaV(2, 0.65)).toBeCloseTo(0.14, 6);
    expect(lambdaV(1, 0.95)).toBeNull(); // 一级 has no column past 0.9
    // 二级 μ 0.65, C30 → fc of C35 = 16.7, fyv 360: 0.14·16.7/360 = 0.649% > 0.6%
    expect(columnRhoVMin(2, 0.65, 30, 360)).toBeCloseTo((100 * 0.14 * 16.7) / 360, 4);
    expect(columnRhoVMin(4, 0.3, 30, 360)).toBeCloseTo(0.4, 6);
  });

  it("tie volumetric ratio of a 4×4-leg set", () => {
    // d10 (78.54) 4 legs each way, core 420×420, s 100: 78.54·(4·420·2)/(420²·100)
    expect(tieRhoV(78.54, 4, 4, 420, 420, 100)).toBeCloseTo((100 * 78.54 * 3360) / (420 * 420 * 100), 6);
  });

  it("walls (4.4.7-1, 6.4.2)", () => {
    expect([1, 2, 3, 4].map((g) => wallDistRhoMin(g as 1 | 2 | 3 | 4))).toEqual([0.25, 0.25, 0.25, 0.2]);
    expect(wallAxialRatioLimit(1, true)).toBe(0.4);
    expect(wallAxialRatioLimit(2)).toBe(0.6);
    expect(wallAxialRatioLimit(4)).toBeNull();
  });
});

// Live GB dummy (2026-10-13): C500x500, 12-2-d20, DO 50, ties 2×2 d10 @100/200,
// CC-TABLE Pu 137.789 kN, fck 30, fy/fys 400.
describe("gbColumnSeismic / gbWallSeismic", () => {
  const live = [{ chk: "OK", pu: 137.789, fck: 30, fy: 400, fys: 400 }];
  const col = (g: 1 | 2 | 3 | 4, rows = live, cen = 200) =>
    gbColumnSeismic(g, "frame", 500, 500, 50, { dia: 20, num: 12 }, { dia: 10, legY: 2, legZ: 2, s: 100 }, { s: cen }, rows);

  it("passes the live dummy at 二级 and reports μN", () => {
    const r = col(2);
    expect(r.issues).toEqual([]);
    expect(r.mu).toBeCloseTo(137789 / (14.3 * 250000), 3);
    expect(r.muLimit).toBe(0.75);
  });

  it("一级: ρv floor 0.8% fails a 2×2 d10 @100 set (0.731%)", () => {
    const rv = col(1).issues.find((x) => x.kind === "colRhoV")!;
    expect(rv.actual).toBeCloseTo((100 * 78.54 * 4 * 430) / (430 * 430 * 100), 2);
    expect(rv.limit).toBe(0.8);
  });

  it("flags axial ratio over the 表6.3.6 limit and wide non-dense spacing", () => {
    const r = col(1, [{ ...live[0], pu: 2500 }], 250);
    expect(r.issues.find((x) => x.kind === "axial")).toMatchObject({ limit: 0.65 });
    expect(r.issues.find((x) => x.kind === "colCenS")).toMatchObject({ actual: 250, limit: 200 });
  });

  it("without check results only the geometric rules run", () => {
    const r = gbColumnSeismic(2, "frame", 500, 500, 50, { dia: 20, num: 4 }, { dia: 6, legY: 2, legZ: 2, s: 150 }, { s: 200 }, undefined);
    expect(r.mu).toBeNull();
    expect(r.issues.map((x) => x.kind)).toEqual(["colDenseS", "colDenseDia"]);
  });

  it("walls: worst-story distribution ρ and axial ratio", () => {
    const rows = [
      { pu: 419.291, lw: 6000, tw: 200, fck: 30, rhoV: 0.584, rhoH: 0.393 },
      { pu: 3600, lw: 6000, tw: 200, fck: 30, rhoV: 0.2, rhoH: 0.393 },
    ];
    const r = gbWallSeismic(2, rows);
    expect(r.mu).toBeCloseTo(3600000 / (14.3 * 1.2e6), 3);
    expect(r.issues.map((x) => x.kind)).toEqual(["wallRhoV"]);
    expect(gbWallSeismic(1, [{ ...rows[1], pu: 9000 }]).issues.map((x) => x.kind)).toEqual(["wallAxial", "wallRhoV"]);
  });
});
