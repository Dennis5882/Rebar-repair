import { describe, it, expect } from "vitest";
import { kdsBeamDetailing } from "../kdsDetailing";
import type { SectorFormValues } from "../beamRebarForm";

const DB = "KS D 3504";
const MAT = { fck: 24, fy: 400, fyt: 400 };
const sec = (p: Partial<SectorFormValues>): SectorFormValues => ({
  topName: "D22", topNum: "4", botName: "D22", botNum: "4",
  shearName: "D10", shearLeg: "2", shearDist: "200",
  skinName: "", skinNum: "", ...p,
});
const all = (p: Partial<SectorFormValues>) => ({ I: sec(p), M: sec(p), J: sec(p) });

// 300×600, cover 60 ⇒ d = 540; √24 = 4.899.
describe("kdsBeamDetailing", () => {
  it("passes a well-detailed section", () => {
    expect(kdsBeamDetailing(MAT, DB, 300, 600, 60, 60, all({}), {})).toEqual([]);
  });

  it("flags stirrup spacing over d/2 and folds identical stations", () => {
    const out = kdsBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ shearDist: "300" }), {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "sMax", actual: 300, limit: 270, halved: false, sectors: ["I", "M", "J"] });
  });

  it("halves the spacing limit when Vs > (√fck/3)·bw·d", () => {
    // 4-leg D13 @150: Vs ≈ 730 kN > 264.5 kN ⇒ limit 270/2 = 135.
    const out = kdsBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ shearName: "D13", shearLeg: "4", shearDist: "150" }), {});
    expect(out[0]).toMatchObject({ kind: "sMax", limit: 135, halved: true });
  });

  it("caps spacing at 600 mm for deep beams", () => {
    const out = kdsBeamDetailing(MAT, DB, 400, 1600, 60, 60, all({ shearName: "D13", shearDist: "650" }), {});
    expect(out.find((i) => i.kind === "sMax")?.limit).toBe(600);
  });

  it("flags Av below max(0.0625√fck, 0.35)·bw·s/fyt", () => {
    // 1-leg D10 (71.3 mm²) vs 0.35·500·250/400 = 109.4 mm².
    const out = kdsBeamDetailing(MAT, DB, 500, 600, 60, 60, all({ shearLeg: "1", shearDist: "250" }), {});
    const i = out.find((x) => x.kind === "avMin")!;
    expect(i.limit).toBeCloseTo(109.4, 1);
    expect(i.demandKnown).toBe(false);
  });

  it("drops the Av,min rule where Vu ≤ φVc/2 and for h ≤ 250", () => {
    const thin = { shearLeg: "1", shearDist: "250" };
    const low = { I: { vu: 10 }, M: { vu: 10 }, J: { vu: 10 } };
    expect(kdsBeamDetailing(MAT, DB, 500, 600, 60, 60, all(thin), low).some((x) => x.kind === "avMin")).toBe(false);
    expect(kdsBeamDetailing(MAT, DB, 500, 250, 40, 40, all({ ...thin, shearDist: "100" }), {}).some((x) => x.kind === "avMin")).toBe(false);
  });

  it("flags φMn < 1.2·Mcr, waived when φMn ≥ 4/3·Mu", () => {
    // 2-D13 top: φMn ≈ 45.7 kN·m < 1.2·Mcr = 1.2·55.55 = 66.7 kN·m.
    const out = kdsBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ topName: "D13", topNum: "2" }), {});
    const i = out.find((x) => x.kind === "mcrTop")!;
    expect(i.limit).toBeCloseTo(66.7, 1);
    expect(i.actual).toBeLessThan(i.limit);
    const small = { I: { muNeg: -30 }, M: { muNeg: -30 }, J: { muNeg: -30 } };
    expect(kdsBeamDetailing(MAT, DB, 300, 600, 60, 60, all({ topName: "D13", topNum: "2" }), small).some((x) => x.kind === "mcrTop")).toBe(false);
  });
});
