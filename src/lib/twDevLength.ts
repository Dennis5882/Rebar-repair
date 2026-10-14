// Development / lap lengths per Taiwan 建築物混凝土結構設計規範 112年版, in the
// code's native units (kgf/cm², cm). Equations read from 25.4.2.3 表, 25.4.9.2,
// 25.5.2.1 表 and 25.4.3 (TW knowledge base, 2026-10-14) and cross-checked cell
// by cell against 台北市結構技師公會 標準圖 RC02 (2024) — the drawing's tables are
// these equations, rounded UP to whole cm, for:
//   ℓd  (a) top bars ψt = 1.3, (b) other bars — "good" branch of 表25.4.2.3
//       (clear spacing ≥ 2db and cover ≥ db): fy/(6.6√f'c)·db for ≤D19,
//       fy/(5.3√f'c)·db for ≥D22; ≥ 30 cm
//   ℓst class B lap (c)(d) = 1.3·ψg·ℓd, ≥ 30 cm
//   ℓdc compression = max(0.075·fy/√f'c, 0.0044·fy)·db, ≥ 20 cm
//   ℓdh 90° standard hook (basic case ψe=ψr=ψo=1) = fy·ψc/(23√f'c)·db^1.5,
//       ≥ max(8db, 15 cm), ψc = f'c/1050 + 0.6 for f'c < 420 kgf/cm²
// Adjustments (epoxy ψe, lightweight λ, tight spacing → the "other" branch) are
// not applied — the caller shows these as the standard-condition values.

export interface TwDevLengths {
  /** tension development length, bars with ≤ 30 cm fresh concrete below (cm) */
  ld: number;
  /** same for top bars, ψt = 1.3 (cm) */
  ldTop: number;
  /** class B tension lap, general / top (cm) */
  lapB: number;
  lapBTop: number;
  /** compression development length (cm) */
  ldc: number;
  /** 90° standard-hook tension development length (cm) */
  ldh: number;
}

/** ψg of 25.5.2.1 表註[1]. */
function psiG(fy: number): number {
  if (fy <= 4200) return 1.0;
  if (fy <= 5000) return 1.08;
  if (fy <= 5600) return 1.15;
  return 1.3;
}

export function twDevLengths(fcKgf: number, fyKgf: number, dbCm: number): TwDevLengths | null {
  if (!(fcKgf > 0 && fyKgf > 0 && dbCm > 0)) return null;
  const root = Math.sqrt(fcKgf);
  const k = dbCm <= 1.95 ? 6.6 : 5.3; // ≤ D19 / ≥ D22 (CNS 560 D19 = 1.91 cm, D22 = 2.22 cm)
  const base = (fyKgf / (k * root)) * dbCm;
  const ld = Math.max(base, 30);
  const ldTop = Math.max(base * 1.3, 30);
  const g = psiG(fyKgf);
  const ldc = Math.max(Math.max((0.075 * fyKgf * dbCm) / root, 0.0044 * fyKgf * dbCm), 20);
  const psiC = fcKgf < 420 ? fcKgf / 1050 + 0.6 : 1;
  const ldh = Math.max((fyKgf * psiC * Math.pow(dbCm, 1.5)) / (23 * root), 8 * dbCm, 15);
  return { ld, ldTop, lapB: Math.max(1.3 * g * ld, 30), lapBTop: Math.max(1.3 * g * ldTop, 30), ldc, ldh };
}

/** Whole centimetres, rounded up like the 標準圖 tables. */
export const ceilCm = (x: number): number => Math.ceil(x - 1e-9);
