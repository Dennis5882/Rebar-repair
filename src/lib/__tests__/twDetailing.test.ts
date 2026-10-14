import { describe, it, expect } from "vitest";
import { twBeamDetailing } from "../twDetailing";
import { shearCapacity } from "../rcBeamCheck";
import type { SectorFormValues } from "../beamRebarForm";

const DB = "CNS 560";
const MAT = { fck: 28, fy: 420, fyt: 420 };
const sec = (p: Partial<SectorFormValues>): SectorFormValues => ({
  topName: "D22", topNum: "4", botName: "D22", botNum: "4",
  shearName: "D10", shearLeg: "2", shearDist: "200",
  skinName: "", skinNum: "", ...p,
});
const all = (p: Partial<SectorFormValues>) => ({ I: sec(p), M: sec(p), J: sec(p) });

// 300×600, cover 60 ⇒ d = 540; √28 = 5.2915.
describe("twBeamDetailing (Taiwan 112)", () => {
  it("passes a well-detailed section", () => {
    expect(twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({}), {})).toEqual([]);
  });

  it("flags stirrup spacing over min(d/2, 600) and folds identical stations", () => {
    const out = twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ shearDist: "300" }), {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "sMax", actual: 300, limit: 270, sectors: ["I", "M", "J"] });
  });

  it("tightens to min(d/4, 300) once Vs > 0.33√f'c·bw·d", () => {
    // 4-leg D13 @150: Vs ≈ 766 kN > 282.9 kN ⇒ limit 540/4 = 135.
    const out = twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ shearName: "D13", shearLeg: "4", shearDist: "150" }), {});
    expect(out[0]).toMatchObject({ kind: "sMax", limit: 135 });
  });

  it("flags Av below max(0.062√f'c, 0.35)·bw·s/fyt and drops it for low Vu / shallow beams", () => {
    // 1-leg D10 (71.3 mm²) vs 0.35·500·250/420 = 104.2 mm².
    const thin = { shearLeg: "1", shearDist: "250" };
    const out = twBeamDetailing(MAT, DB, 500, 600, 60, 60, all(thin), {});
    const i = out.find((x) => x.kind === "avMin")!;
    expect(i.limit).toBeCloseTo(104.2, 1);
    expect(i.demandKnown).toBe(false);
    const low = { I: { vu: 10 }, M: { vu: 10 }, J: { vu: 10 } };
    expect(twBeamDetailing(MAT, DB, 500, 600, 60, 60, all(thin), low).some((x) => x.kind === "avMin")).toBe(false);
    expect(twBeamDetailing(MAT, DB, 500, 250, 40, 40, all({ ...thin, shearDist: "100" }), {}).some((x) => x.kind === "avMin")).toBe(false);
  });

  it("checks As,min on the tension face only (bottom at M, top at I/J)", () => {
    // 2-D13 bottom = 253.4 mm² vs max(1.323, 1.4)/420·300·540 = 540 mm².
    const out = twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ botName: "D13", botNum: "2" }), {});
    const i = out.find((x) => x.kind === "asMinBot")!;
    expect(i.sectors).toEqual(["M"]);
    expect(i.limit).toBeCloseTo(540, 0);
  });

  it("waives As,min when φMn ≥ 4/3·Mu", () => {
    const dem = { M: { muPos: 5 } };
    const out = twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ botName: "D13", botNum: "2" }), dem);
    expect(out.some((x) => x.kind === "asMinBot")).toBe(false);
  });

  describe("special moment frame (18.3)", () => {
    it("tightens end stirrups to min(d/4, 150, 6db) and mid-span to d/2", () => {
      const out = twBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ shearDist: "200" }), {}, true);
      const dense = out.find((x) => x.kind === "smfDenseS")!;
      expect(dense.sectors).toEqual(["I", "J"]);
      expect(dense.limit).toBeCloseTo(133.2, 1); // 6 × 22.2 (D22)
      expect(out.some((x) => x.kind === "smfMidS")).toBe(false); // 200 ≤ d/2 = 270
    });

    it("flags a narrow beam, too few continuous bars and a weak positive moment", () => {
      const out = twBeamDetailing(MAT, DB, 200, 700, 60, 60, {
        I: sec({ topNum: "6", botNum: "2", shearDist: "100" }),
        M: sec({ topNum: "1", shearDist: "100" }),
        J: sec({ topNum: "6", botNum: "2", shearDist: "100" }),
      }, {}, true);
      const kinds = out.map((x) => x.kind);
      expect(kinds).toContain("smfWidth"); // 200 < max(0.3·700, 250)
      expect(kinds).toContain("smfThroughTop");
      expect(kinds).toContain("smfMoment");
    });

    it("is off by default (no 18.3 kinds)", () => {
      const out = twBeamDetailing(MAT, DB, 200, 700, 60, 60, all({ topNum: "1" }), {});
      expect(out.every((x) => !x.kind.startsWith("smf"))).toBe(true);
    });
  });
});

describe("shearCapacity TWN stirrup fyt cap", () => {
  it("caps fyt at 420 MPa (表20.2.2.4(a))", () => {
    const a = shearCapacity("TWN_ACI", 28, 550, 300, 540, 142.7, 200)!;
    const b = shearCapacity("TWN_ACI", 28, 420, 300, 540, 142.7, 200)!;
    expect(a.Vs_kN).toBeCloseTo(b.Vs_kN, 6);
  });
});

import { flexuralCapacity } from "../rcBeamCheck";

describe("compression steel (doubly reinforced, KDS/TWN)", () => {
  const As = 1548; // 4×D22
  const base = flexuralCapacity("TWN_ACI", 28, 420, 300, 540, As)!;
  it("matches the singly reinforced path when no compression steel is given", () => {
    const same = flexuralCapacity("TWN_ACI", 28, 420, 300, 540, As, { As: 0, d: 60 })!;
    expect(same.Mn_kNm).toBeCloseTo(base.Mn_kNm, 6);
  });
  it("adds capacity with compression steel and keeps equilibrium sane", () => {
    const dbl = flexuralCapacity("TWN_ACI", 28, 420, 300, 540, As, { As: 774, d: 60 })!;
    expect(dbl.Mn_kNm).toBeGreaterThan(base.Mn_kNm);
    expect(dbl.Mn_kNm).toBeLessThan(base.Mn_kNm * 1.3);
    expect(dbl.c_mm).toBeLessThan(base.c_mm); // compression steel shrinks the block
  });
  it("is also available for KDS", () => {
    const k = flexuralCapacity("KDS", 24, 400, 300, 540, As)!;
    const kd = flexuralCapacity("KDS", 24, 400, 300, 540, As, { As: 774, d: 60 })!;
    expect(kd.Mn_kNm).toBeGreaterThan(k.Mn_kNm);
  });
});

describe("Taiwan Vc alternatives (表22.5.5.1)", () => {
  const f = 28, bw = 300, d = 540;
  const a = 0.17 * Math.sqrt(f) * bw * d;
  it("uses (a) at low ρw and (b) 0.68ρw^(1/3)√f'c when it is larger", () => {
    const lo = shearCapacity("TWN_ACI", f, 420, bw, d, 142.7, 200, 1548)!;
    expect(lo.Vc_kN).toBeCloseTo(a / 1000, 3);
    const As = 0.02 * bw * d;
    const hi = shearCapacity("TWN_ACI", f, 420, bw, d, 142.7, 200, As)!;
    const alt = 0.68 * Math.cbrt(0.02) * Math.sqrt(f) * bw * d;
    expect(hi.Vc_kN).toBeCloseTo(Math.min(alt, 0.42 * Math.sqrt(f) * bw * d) / 1000, 3);
    expect(hi.Vc_kN).toBeGreaterThan(lo.Vc_kN);
  });
  it("drops to (c) with the size-effect λs when Av < Av,min", () => {
    const r = shearCapacity("TWN_ACI", f, 420, bw, d, 10, 200, 1548)!;
    const lam = Math.sqrt(2 / (1 + d / 250));
    const alt = 0.68 * Math.cbrt(1548 / (bw * d)) * Math.sqrt(f) * bw * d;
    expect(r.Vc_kN).toBeCloseTo((lam * alt) / 1000, 3);
    expect(r.Vc_kN).toBeLessThan(a / 1000);
  });
});
