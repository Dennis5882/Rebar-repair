import { describe, it, expect } from "vitest";
import { gbCrackWidth, gbFtk, parseServiceMoments } from "../gbCrack";

describe("gbCrackWidth (GB 50010 7.1.2)", () => {
  it("hand-computed 300×600 C30, 3d20, cover 40, Mq 100 kN·m", () => {
    // σs = 100e6/(0.87·560·942.48) = 217.8; ρte = 942.48/90000 = 0.01047
    // ψ = 1.1 − 0.65·2.01/(0.01047·217.8) = 0.527; cs = 30
    // w = 1.9·0.527·217.8/2e5·(1.9·30 + 0.08·20/0.01047) = 0.229 mm
    const r = gbCrackWidth({ mq: -100, b: 300, h: 600, cover: 40, n: 3, d: 20, fcuk: 30 })!;
    expect(r.sigmaS).toBeCloseTo(217.8, 0);
    expect(r.psi).toBeCloseTo(0.527, 2);
    expect(r.w).toBeCloseTo(0.229, 2);
  });
  it("clamps ψ to 0.2 at low stress and ρte to 0.01", () => {
    const r = gbCrackWidth({ mq: 5, b: 300, h: 600, cover: 40, n: 2, d: 14, fcuk: 30 })!;
    expect(r.psi).toBe(0.2);
  });
  it("ftk from 表4.1.3-2; null outside C20–C80 or without steel", () => {
    expect(gbFtk(30)).toBeCloseTo(2.01, 6);
    expect(gbFtk(32)).toBeCloseTo(2.01 + (0.19 * 2) / 5, 6);
    expect(gbFtk(15)).toBeNull();
    expect(gbCrackWidth({ mq: 50, b: 300, h: 600, cover: 40, n: 0, d: 20, fcuk: 30 })).toBeNull();
  });
});

describe("parseServiceMoments (BEAMFORCE, live 2026-10-13)", () => {
  it("maps I[n] / 2/4 / J[n] to I / M / J", () => {
    const head = ["Index", "Elem", "Load", "Part", "Moment-y"];
    const rows = [
      ["1", "13", "gLCB2", "I[7]", "-11.33"],
      ["2", "13", "gLCB2", "2/4", "7.27"],
      ["3", "13", "gLCB2", "J[8]", "-14.64"],
      ["4", "14", "gLCB2", "I[8]", "-15.50"],
    ];
    expect(parseServiceMoments(head, rows)).toEqual({ "13": { I: -11.33, M: 7.27, J: -14.64 }, "14": { I: -15.5 } });
  });
});
