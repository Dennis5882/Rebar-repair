import { describe, it, expect } from "vitest";
import { columnMn } from "../twColumnMn";
import { computeScwb, SCWB_LIMIT } from "../twScwb";
import type { ModelGeometry } from "../../types/geometry";

describe("columnMn", () => {
  const four = { b: 300, h: 300, cover: 50, nBars: 4, barArea: 500, fck: 28, fy: 400 };
  it("matches the hand value for a 4-corner-bar column at P = 0", () => {
    // T = 1000·400 = 400 kN balanced by the concrete block (a = 56 mm):
    // Mn = 400·(150 − 28) + 400·(250 − 150) = 88.8 kN·m
    const mn = columnMn(four, 0);
    expect(mn).toBeGreaterThan(87);
    expect(mn).toBeLessThan(91);
  });
  it("gains strength with moderate compression and loses it near pure compression", () => {
    const m0 = columnMn(four, 0);
    const m1 = columnMn(four, 600);
    expect(m1).toBeGreaterThan(m0);
    expect(columnMn(four, 5000)).toBe(0); // above the compression capacity
  });
  it("returns 0 for incomplete input", () => {
    expect(columnMn({ ...four, nBars: 0 }, 0)).toBe(0);
  });
});

// A 2-storey strip: base node 1 → node 2 (joint) → node 3, two collinear beams at node 2.
const geo: ModelGeometry = {
  nodes: [
    { id: "1", x: 0, y: 0, z: 0 },
    { id: "2", x: 0, y: 0, z: 3500 },
    { id: "3", x: 0, y: 0, z: 7000 },
    { id: "4", x: -6000, y: 0, z: 3500 },
    { id: "5", x: 6000, y: 0, z: 3500 },
  ],
  cols: [
    { id: "c1", sect: "C", a: "1", b: "2" },
    { id: "c2", sect: "C", a: "2", b: "3" },
  ],
  beams: [
    { id: "b1", sect: "B", a: "4", b: "2" },
    { id: "b2", sect: "B", a: "2", b: "5" },
  ],
  braces: [],
  walls: [],
  baseNodes: ["1"],
};
const beam = { b: 300, h: 600, dt: 60, db: 60, I: { topAs: 1548, botAs: 774 }, J: { topAs: 1548, botAs: 774 } };
const col = (nBars: number, barArea: number) => ({ b: 600, h: 600, cover: 60, nBars, barArea, pu: 2500 });

describe("computeScwb", () => {
  it("passes a strong column and fails a weak one against 6/5 ΣMnb", () => {
    const strong = computeScwb(geo, { B: beam }, { C: col(16, 387) }, 28, 420);
    const weak = computeScwb(geo, { B: beam }, { C: col(4, 200) }, 28, 420);
    expect(strong.bySection.C.ratio!).toBeGreaterThan(SCWB_LIMIT);
    expect(weak.bySection.C.ratio!).toBeLessThan(SCWB_LIMIT);
    expect(weak.bySection.C.failing).toBe(1);
  });
  it("skips the check where the axial force is ≤ Ag·f'c/10", () => {
    const r = computeScwb(geo, { B: beam }, { C: { ...col(16, 387), pu: 100 } }, 28, 420);
    expect(r.joints[0].exempt).toBe(true);
    expect(r.bySection.C.ratio).toBeNull();
  });
  it("returns no ratio without beam data", () => {
    const r = computeScwb(geo, {}, { C: col(16, 387) }, 28, 420);
    expect(r.bySection.C.ratio).toBeNull();
  });
});
