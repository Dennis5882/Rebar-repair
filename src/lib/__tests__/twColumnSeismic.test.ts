import { describe, it, expect } from "vitest";
import { twColumnSeismic } from "../twColumnSeismic";

const rows = [{ fck: 28, fy: 420, fys: 420, pu: 1000 }];
const main = { dia: 22.2, num: 12 };
const tie = (s: number, legs = 3) => ({ dia: 12.7, legY: legs, legZ: legs, s });

describe("twColumnSeismic (Taiwan 112 18.4)", () => {
  it("passes a typical 600×600 SMF column", () => {
    const r = twColumnSeismic(600, 600, 60, main, tie(100), 130, rows, 3000);
    expect(r.issues).toEqual([]);
    expect(r.lo).toBe(600);
  });
  it("flags size and aspect ratio", () => {
    const r = twColumnSeismic(250, 900, 50, main, tie(100), 150, rows, 3000);
    const k = r.issues.map((i) => i.kind);
    expect(k).toContain("minDim");
    expect(k).toContain("aspect");
  });
  it("flags steel ratio outside 1–6%", () => {
    const lo = twColumnSeismic(600, 600, 60, { dia: 16, num: 4 }, tie(100), 150, rows, 3000);
    expect(lo.issues.some((i) => i.kind === "rhoMin")).toBe(true);
    const hi = twColumnSeismic(400, 400, 60, { dia: 32, num: 24 }, tie(100), 150, rows, 3000);
    expect(hi.issues.some((i) => i.kind === "rhoMax")).toBe(true);
  });
  it("limits end-zone tie spacing by bmin/4, 6db and so", () => {
    // 6·22.2 = 133.2 ; bmin/4 = 150 ; so ≤ 150 ⇒ 133.2 governs
    const r = twColumnSeismic(600, 600, 60, main, tie(150), 150, rows, 3000);
    const e = r.issues.find((i) => i.kind === "endS")!;
    expect(e.limit).toBeCloseTo(133.2, 1);
  });
  it("limits spacing outside ℓo to min(150, 6db)", () => {
    const r = twColumnSeismic(600, 600, 60, main, tie(100), 200, rows, 3000);
    expect(r.issues.find((i) => i.kind === "midS")!.limit).toBeCloseTo(133.2, 1);
  });
  it("tightens hx to 200 mm above 0.3·Ag·f'c", () => {
    // 0.3·360000·28 = 3024 kN threshold; use 4000
    const r = twColumnSeismic(600, 600, 60, main, tie(100, 3), 130, [{ fck: 28, fy: 420, fys: 420, pu: 4000 }], 3000);
    expect(r.issues.some((i) => i.kind === "hx200")).toBe(true);
  });
  it("flags too little confinement steel (Ash/s·bc)", () => {
    const r = twColumnSeismic(600, 600, 60, main, { dia: 9.53, legY: 2, legZ: 2, s: 100 }, 150, rows, 3000);
    expect(r.issues.some((i) => i.kind === "endAsh")).toBe(true);
  });
  it("marks pending without Gen NX material rows", () => {
    expect(twColumnSeismic(600, 600, 60, main, tie(100), 150, undefined, 3000).pending).toBe(true);
  });
});
