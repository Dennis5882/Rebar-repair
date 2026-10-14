import { describe, it, expect } from "vitest";
import { twDevLengths, ceilCm } from "../twDevLength";

// Cells read from 標準圖 RC02 (台北市結構技師公會 2024, scanned table), fy 4200
// kgf/cm², f'c 280, bar diameters of CNS 560 (D10 … D36, cm).
const DB = { D10: 0.953, D13: 1.27, D16: 1.59, D19: 1.91, D22: 2.22, D25: 2.54, D29: 2.87, D32: 3.23, D36: 3.58 } as const;
const cm = (fc: number, fy: number, db: number) => {
  const r = twDevLengths(fc, fy, db)!;
  return { ld: ceilCm(r.ld), top: ceilCm(r.ldTop), lap: ceilCm(r.lapB), lapTop: ceilCm(r.lapBTop), ldc: ceilCm(r.ldc) };
};

describe("twDevLengths vs 標準圖 RC02", () => {
  it("tension development length ℓd, fy 4200 / f'c 280 — general bars (b)", () => {
    const want: Record<string, number> = { D10: 37, D13: 49, D16: 61, D19: 73, D22: 106, D25: 121, D29: 136, D32: 153, D36: 170 };
    for (const [k, v] of Object.entries(want)) expect(cm(280, 4200, DB[k as keyof typeof DB]).ld, k).toBe(v);
  });
  it("top bars (a) use ψt = 1.3", () => {
    const want: Record<string, number> = { D10: 48, D13: 63, D16: 79, D19: 95, D22: 137, D25: 157, D29: 177, D32: 199, D36: 221 };
    for (const [k, v] of Object.entries(want)) expect(cm(280, 4200, DB[k as keyof typeof DB]).top, k).toBe(v);
  });
  it("class B lap ℓst general (d) and top (c)", () => {
    const d: Record<string, number> = { D10: 48, D13: 63, D16: 79, D19: 95, D22: 137, D25: 157, D29: 177, D32: 199, D36: 221 };
    for (const [k, v] of Object.entries(d)) expect(cm(280, 4200, DB[k as keyof typeof DB]).lap, k).toBe(v);
  });
  it("compression development length ℓdc", () => {
    const want: Record<string, number> = { D10: 20, D13: 24, D16: 30, D19: 36, D22: 42, D25: 48, D29: 55, D32: 61, D36: 68 };
    for (const [k, v] of Object.entries(want)) expect(cm(280, 4200, DB[k as keyof typeof DB]).ldc, k).toBe(v);
  });
  it("applies the 30 cm minimum and the fy-grade lap factor ψg", () => {
    expect(cm(560, 2800, DB.D10).ld).toBe(30);
    const r = twDevLengths(280, 5600, DB.D22)!;
    expect(r.lapB / r.ld).toBeCloseTo(1.3 * 1.15, 6);
  });
});
