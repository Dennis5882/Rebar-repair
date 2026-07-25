import { describe, it, expect } from "vitest";
import { barArea_mm2, flexuralCapacity, formulaFamily, shearCapacity } from "../rcBeamCheck";

describe("barArea_mm2", () => {
  it("computes the nominal area of a round bar", () => {
    expect(barArea_mm2(25)).toBeCloseTo(490.87, 1); // π/4 · 25²
    expect(barArea_mm2(13)).toBeCloseTo(132.73, 1);
  });
});

describe("formulaFamily", () => {
  it("maps supported design codes to their coefficient family", () => {
    expect(formulaFamily("KDS 41 20 : 2022")).toBe("KDS");
    expect(formulaFamily("TWN-USD112")).toBe("TWN_ACI");
  });
  it("returns null for a code the check doesn't support", () => {
    expect(formulaFamily("ACI 318-19")).toBeNull();
  });
});

describe("shearCapacity", () => {
  it("uses Vc = (1/6)√fck·bw·d for KDS with no stirrups", () => {
    const r = shearCapacity("KDS", 24, 400, 300, 550, 0, 0)!;
    expect(r.Vs_kN).toBe(0);
    expect(r.Vc_kN).toBeCloseTo((Math.sqrt(24) / 6) * 300 * 550 / 1000, 1);
    expect(r.phi).toBe(0.75);
    expect(r.phiVn_kN).toBeCloseTo(0.75 * r.Vn_kN, 5);
  });

  it("uses the slightly larger 0.17 coefficient for TWN_ACI", () => {
    const kds = shearCapacity("KDS", 24, 400, 300, 550, 0, 0)!;
    const twn = shearCapacity("TWN_ACI", 24, 400, 300, 550, 0, 0)!;
    expect(twn.Vc_kN).toBeGreaterThan(kds.Vc_kN); // 0.17 > 1/6
    expect(twn.Vc_kN).toBeCloseTo(0.17 * Math.sqrt(24) * 300 * 550 / 1000, 1);
  });

  it("adds Vs = Av·fyt·d/s when stirrups are present", () => {
    const r = shearCapacity("KDS", 24, 400, 300, 550, 142, 150)!;
    expect(r.Vs_kN).toBeCloseTo((142 * 400 * 550) / 150 / 1000, 1);
  });

  it("returns null when the section is geometrically invalid", () => {
    expect(shearCapacity("KDS", 0, 400, 300, 550, 0, 0)).toBeNull();
    expect(shearCapacity("KDS", 24, 400, 0, 550, 0, 0)).toBeNull();
  });
});

describe("flexuralCapacity", () => {
  it("computes a tension-controlled KDS section (φ = 0.85)", () => {
    const r = flexuralCapacity("KDS", 24, 400, 300, 550, 2000)!;
    expect(r.zone).toBe("tension");
    expect(r.phi).toBe(0.85);
    expect(r.phiMn_kNm).toBeCloseTo(329.6, 0);
  });

  it("uses φ = 0.90 for a tension-controlled TWN_ACI section (different phi than KDS)", () => {
    const twn = flexuralCapacity("TWN_ACI", 24, 400, 300, 550, 2000)!;
    expect(twn.zone).toBe("tension");
    expect(twn.phi).toBe(0.9);
  });

  it("returns null for a grossly over-reinforced section (a ≥ 2d, no valid moment arm)", () => {
    expect(flexuralCapacity("KDS", 24, 400, 300, 200, 8000)).toBeNull();
  });

  it("returns null when any input is non-positive", () => {
    expect(flexuralCapacity("KDS", 24, 400, 300, 550, 0)).toBeNull();
    expect(flexuralCapacity("KDS", 0, 400, 300, 550, 2000)).toBeNull();
  });
});
