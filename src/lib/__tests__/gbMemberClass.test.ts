import { describe, it, expect } from "vitest";
import { classifyColumns, strengthenedStories } from "../gbMemberClass";
import { gbColumnSeismic, gbWallBoundary } from "../gbSeismic";
import type { ModelGeometry } from "../../types/geometry";

// The live GB dummy's frame: 3×2 grid (x 0/6/12, y 0/6), storeys at 0 / 3.5 / 7 m,
// columns C500x500, beams B300x600 (h 0.6 m) both ways, supports at z = 0.
function dummy(): ModelGeometry {
  const X = [0, 6, 12], Y = [0, 6], H = 3.5;
  const nid = (k: number, j: number, i: number) => String(k * 6 + j * 3 + i + 1);
  const nodes = [];
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) nodes.push({ id: nid(k, j, i), x: X[i], y: Y[j], z: k * H });
  const cols = [], beams = [];
  let e = 1;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) cols.push({ id: String(e++), sect: "1", a: nid(k, j, i), b: nid(k + 1, j, i), w: 0.5, h: 0.5 });
  for (let k = 1; k <= 2; k++) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) beams.push({ id: String(e++), a: nid(k, j, i), b: nid(k, j, i + 1), w: 0.3, h: 0.6 });
    for (let i = 0; i < 3; i++) beams.push({ id: String(e++), a: nid(k, 0, i), b: nid(k, 1, i), w: 0.3, h: 0.6 });
  }
  return { nodes, cols, beams, braces: [], walls: [], baseNodes: ["1", "2", "3", "4", "5", "6"] };
}

describe("classifyColumns", () => {
  const c = classifyColumns(dummy(), (v) => v * 1000);
  it("corners at the 4 plan corners, edge columns in the middle of the long sides", () => {
    // ground storey: elements 1..6 = (j0: i0,i1,i2), (j1: i0,i1,i2)
    expect(["1", "2", "3", "4", "5", "6"].map((k) => c[k].corner)).toEqual([true, false, true, true, false, true]);
  });
  it("柱根 = ground-storey columns; Hn = 3500 − 600", () => {
    expect(c["1"].base).toBe(true);
    expect(c["7"].base).toBe(false);
    expect(c["1"].hn).toBeCloseTo(2900, 6);
  });
});

describe("strengthenedStories (GB 50011 6.1.10)", () => {
  it("H ≤ 24 m ⇒ bottom storey only", () => {
    expect(strengthenedStories([0, 3500, 7000])).toEqual([0]);
  });
  it("H > 24 m ⇒ max(bottom two storeys, H/10)", () => {
    const lv = Array.from({ length: 11 }, (_, i) => i * 3000); // 30 m
    expect(strengthenedStories(lv)).toEqual([0, 1]);
    const tall = Array.from({ length: 41 }, (_, i) => i * 3000); // 120 m ⇒ H/10 = 12 m
    expect(strengthenedStories(tall)).toEqual([0, 1, 2, 3]);
  });
});

describe("gbColumnSeismic with the column's position", () => {
  const live = [{ chk: "OK", pu: 137.789, fck: 30, fy: 400, fys: 400 }];
  const run = (g: 1 | 2 | 3 | 4, sit: Parameters<typeof gbColumnSeismic>[9], cen = 200, endS = 100, endD = 10) =>
    gbColumnSeismic(g, "frame", 500, 500, 50, { dia: 20, num: 12 }, { dia: endD, legY: 2, legZ: 2, s: endS }, { s: cen }, live, sit);

  it("λ = Hn/(2h0): 2900/(2·450) = 3.22 on the dummy", () => {
    expect(run(2, { hn: 2900 }).lambda).toBeCloseTo(3.222, 3);
  });
  it("corner 一、二级 ⇒ full-height dense ties and the 角柱 ρmin", () => {
    const r = run(2, { corner: true });
    expect(r.issues.map((x) => x.kind)).toContain("colFullDenseCorner");
    const thin = gbColumnSeismic(2, "frame", 500, 500, 50, { dia: 16, num: 8 }, { dia: 10, legY: 2, legZ: 2, s: 100 }, { s: 100 }, live, { corner: true });
    expect(thin.issues.find((x) => x.kind === "colRhoMinCorner")).toMatchObject({ limit: 0.95 }); // 0.9 + 0.05
  });
  it("λ ≤ 2 ⇒ axial limit −0.05, ρv ≥ 1.2 %, full-height ≤ 100", () => {
    const r = run(3, { hn: 1500 });
    expect(r.lambda).toBeCloseTo(1.667, 3);
    expect(r.muLimit).toBe(0.8);
    expect(r.issues.find((x) => x.kind === "colRhoV")).toMatchObject({ limit: 1.2 });
    expect(r.issues.find((x) => x.kind === "colFullDenseShort")).toMatchObject({ actual: 200, limit: 100 });
  });
  it("柱根 三级: 100 mm cap; 四级: Ø8", () => {
    expect(run(3, { base: true }, 200, 150).issues.find((x) => x.kind === "colDenseSBase")).toMatchObject({ actual: 150, limit: 100 });
    expect(run(4, { base: true }, 200, 100, 6).issues.find((x) => x.kind === "colDenseDia")).toMatchObject({ actual: 6, limit: 8 });
  });
  it("joint core 一级: ρv ≥ max(0.12·fc/fyv, 0.6 %)", () => {
    const r = gbColumnSeismic(1, "frame", 500, 500, 50, { dia: 20, num: 12 }, { dia: 8, legY: 2, legZ: 2, s: 100 }, { s: 100 }, live);
    expect(r.issues.find((x) => x.kind === "jointRhoV")).toMatchObject({ limit: 0.6 });
  });
});

describe("gbWallBoundary (GB 50011 6.4.5, 暗柱)", () => {
  const base = { g: 2 as const, inStrengthened: true, inConstrainZone: true, hw: 6000, bw: 200, fcuk: 30, fyvk: 400, cover: 40, beLen: null };
  it("low bottom axial ratio ⇒ 构造, Ac = 200·400; 二级 bottom needs max(0.008Ac, 6φ14)", () => {
    const r = gbWallBoundary({ ...base, muBottom: 0.05, end: { dia: 12, num: 4 }, tie: { dia: 8, s: 150 } });
    expect(r.type).toBe("construct");
    expect(r.ac).toBe(80000);
    expect(r.issues.map((x) => x.kind)).toEqual(["beAs", "beNum", "beDia"]);
    expect(r.issues[0].limit).toBe(Math.round(6 * Math.PI * 49)); // 6φ14 = 924 > 640
  });
  it("high bottom axial ratio ⇒ 约束 with lc = 0.20·hw and BE length/λv checks", () => {
    const r = gbWallBoundary({ ...base, muBottom: 0.45, end: { dia: 16, num: 6 }, tie: { dia: 8, s: 150 }, beLen: 600 });
    expect(r.type).toBe("constrain");
    expect(r.lc).toBe(1200);
    expect(r.issues.map((x) => x.kind)).toEqual(expect.arrayContaining(["beLen", "beRhoV"]));
  });
  it("above the 约束 zone ⇒ 构造 其他部位; missing end bars / ties are flagged", () => {
    const r = gbWallBoundary({ ...base, muBottom: 0.45, inStrengthened: false, inConstrainZone: false, end: null, tie: null });
    expect(r.type).toBe("construct");
    expect(r.issues.map((x) => x.kind)).toEqual(["beNoEnd", "beNoTie"]);
  });
});
