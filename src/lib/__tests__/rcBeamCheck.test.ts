import { describe, it, expect } from "vitest";
import { barArea_mm2, flexuralCapacity, formulaFamily, gbConcrete, gbRebar, shearCapacity } from "../rcBeamCheck";

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

// GB/T 50010-2010 (2024年版). Inputs use Gen NX's meaning: fck = grade fcu,k,
// fy = fyk. Expected values hand-computed from the code tables/formulas.
describe("GB/T 50010-2010", () => {
  it("is wired only for the current GB code", () => {
    expect(formulaFamily("GB/T50010-10")).toBe("GB");
    expect(formulaFamily("GB50010-02")).toBeNull();
  });

  it("maps grade → design strengths from 表4.1.4 / 表4.2.3", () => {
    expect(gbConcrete(30)).toEqual({ fc: 14.3, ft: 1.43 });
    expect(gbConcrete(32)!.fc).toBeCloseTo(15.26, 2); // linear between C30/C35
    expect(gbConcrete(15)).toBeNull(); // C15 dropped in 2024版
    expect(gbRebar(400)!.fy).toBe(360);
    expect(gbRebar(300)).toEqual({ fy: 270, Es: 210000 }); // HPB300
    expect(gbRebar(600)).toBeNull(); // no 表4.2.3 value → no estimate
  });

  it("flexure, under-reinforced: C30/HRB400, 250×(h0 465), 3d20", () => {
    const r = flexuralCapacity("GB", 30, 400, 250, 465, 942)!;
    expect(r.phi).toBe(1);
    expect(r.zone).toBe("tension");
    expect(r.a_mm).toBeCloseTo(94.86, 1); // x = 360·942 / (1.0·14.3·250)
    expect(r.phiMn_kNm).toBeCloseTo(141.6, 1); // α1·fc·b·x·(h0 − x/2)
  });

  it("flexure, over-reinforced: capped at x = ξb·h0", () => {
    const r = flexuralCapacity("GB", 30, 400, 250, 465, 6000)!;
    const xiB = 0.8 / (1 + 360 / (200000 * 0.0033)); // 0.5176
    expect(r.zone).toBe("compression");
    expect(r.a_mm).toBeCloseTo(xiB * 465, 1);
    // adding more steel past the limit adds no resistance
    expect(flexuralCapacity("GB", 30, 400, 250, 465, 9000)!.phiMn_kNm).toBeCloseTo(r.phiMn_kNm, 6);
  });

  it("shear: 0.7·ft·b·h0 + fyv·Asv/s·h0", () => {
    const asv = 2 * barArea_mm2(8);
    const r = shearCapacity("GB", 30, 400, 250, 465, asv, 200)!;
    expect(r.Vc_kN).toBeCloseTo(116.36, 1);
    expect(r.Vs_kN).toBeCloseTo((360 * asv * 465) / 200 / 1000, 3);
    expect(r.phiVn_kN).toBeCloseTo(r.Vc_kN + r.Vs_kN, 6); // below the 6.3.1 cap
  });

  it("shear: fyv capped at 360 and total capped by 0.25·βc·fc·b·h0", () => {
    const asv = 2 * barArea_mm2(16);
    const hrb500 = shearCapacity("GB", 30, 500, 250, 465, asv, 50)!;
    const hrb400 = shearCapacity("GB", 30, 400, 250, 465, asv, 50)!;
    expect(hrb500.Vs_kN).toBeCloseTo(hrb400.Vs_kN, 6); // 435 → 360 for shear
    expect(hrb400.phiVn_kN).toBeCloseTo((0.25 * 14.3 * 250 * 465) / 1000, 2);
  });
});
