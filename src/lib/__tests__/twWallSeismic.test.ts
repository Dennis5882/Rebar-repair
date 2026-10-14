import { describe, it, expect } from "vitest";
import { twWallSeismic } from "../twWallSeismic";

const dia = (l: string) => ({ d10: 9.53, d12: 11.5, d16: 15.9 } as Record<string, number>)[l] ?? null;
const row = (p: object) => ({ lw: 6000, tw: 200, layers: 2, vRebar: "d12 @200", hRebar: "d10 @200", rhoV: 0, rhoH: 0, ...p });

describe("twWallSeismic (Taiwan 112 18.7.2)", () => {
  it("passes ρ ≥ 0.25 % with 450 mm spacing and two curtains", () => {
    // d12 @200 ×2 on 200 mm: 2·104/(200·200)=0.52 %; d10 @200: 0.36 %
    const r = twWallSeismic([row({})], dia, 7000);
    expect(r.issues).toEqual([]);
    expect(r.rhoV).toBeGreaterThan(0.5);
  });
  it("flags ρ below 0.25 % and spacing over 450 mm", () => {
    const r = twWallSeismic([row({ vRebar: "d10 @400", hRebar: "d10 @500", layers: 1 })], dia, 3000);
    const k = r.issues.map((i) => i.kind);
    expect(k).toContain("rhoH");
    expect(k).toContain("spaceH");
  });
  it("needs two curtains when hw/ℓw ≥ 2", () => {
    const r = twWallSeismic([row({ layers: 1 })], dia, 14000);
    expect(r.issues.some((i) => i.kind === "curtains")).toBe(true);
  });
  it("requires ρℓ ≥ ρt for squat walls", () => {
    const r = twWallSeismic([row({ vRebar: "d10 @200", hRebar: "d12 @200" })], dia, 3000);
    expect(r.issues.some((i) => i.kind === "rhoOrder")).toBe(true);
  });
});
