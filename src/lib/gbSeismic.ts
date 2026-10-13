// GB seismic (抗震等级) tables shared by the GB detailing checks — pure lookups,
// no UI. Clause text read from the CN knowledge base (2026-10-13). GB 55008-2021
// 4.4.7–4.4.9 (mandatory, current) is the primary source; GB 50011-2010 (2016)
// 6.3/6.4 fills what 55008 leaves out (axial-ratio limits, λv, the +2 mm stirrup
// rule, through-bar minimums). Seismic grade 1–4 = 一级…四级 (特一级 not covered).
import type { MemberCheckRow } from "./api";
import { barArea_mm2, gbConcrete, gbRebar } from "./rcBeamCheck";

export type SeismicGrade = 1 | 2 | 3 | 4;
// Structure type rows of GB 50011 表6.3.6: 框架结构 / 框架-抗震墙·板柱-抗震墙·
// 框架-核心筒·筒中筒 / 部分框支抗震墙.
export type GbSystem = "frame" | "dual" | "frameSupported";

const pick = <T>(g: SeismicGrade, t: [T, T, T, T]): T => t[g - 1];

// --- beams: GB 55008 4.4.8 + GB 50011 6.3.3/6.3.4 ---

// 表4.4.8-1, % of b·h: [floor, k] → max(floor, k·ft/fy). Support = end (I/J top),
// span = mid-span (M bottom).
export function beamRhoMinSeismic(g: SeismicGrade, at: "support" | "span", ft: number, fy: number): number {
  const [floor, k] =
    at === "support"
      ? pick<[number, number]>(g, [[0.4, 80], [0.3, 65], [0.25, 55], [0.25, 55]])
      : pick<[number, number]>(g, [[0.3, 65], [0.25, 55], [0.2, 45], [0.2, 45]]);
  return Math.max(floor, (k * ft) / fy);
}

// 4.4.8-1: x/h0 at the beam end, compression steel included (三级 shares 二级's 0.35;
// 四级 has no limit).
export const beamXh0Max = (g: SeismicGrade): number | null => pick(g, [0.25, 0.35, 0.35, null]);
// 4.4.8-3: As,bottom / As,top at the beam end (四级: none).
export const beamBotTopMin = (g: SeismicGrade): number | null => pick(g, [0.5, 0.3, 0.3, null]);

// 表4.4.8-2: end dense-zone stirrups. s ≤ min(hb/4, k·d, cap); Ø ≥ dMin
// (+2 mm when the end tension ρ > 2%, GB 50011 6.3.3-3).
export function beamDenseStirrup(g: SeismicGrade, hb: number, dLong: number, rhoEndPct: number): { sMax: number; dMin: number } {
  const k = g === 1 ? 6 : 8;
  const cap = g <= 2 ? 100 : 150;
  const dMin = pick(g, [10, 8, 8, 6]) + (rhoEndPct > 2 ? 2 : 0);
  return { sMax: Math.min(hb / 4, k * dLong, cap), dMin };
}
// 4.4.8-2 table: 加密区 length ≥ max(k·hb, 500).
export const beamDenseLength = (g: SeismicGrade, hb: number): number => Math.max((g === 1 ? 2 : 1.5) * hb, 500);

// GB 50011 6.3.4-1: full-length top/bottom bars ≥ 2φ14 (一、二级) / 2φ12 (三、四级),
// and for 一、二级 also ≥ 1/4 of the larger end area on that face.
export const beamThroughMinDia = (g: SeismicGrade): number => (g <= 2 ? 14 : 12);
export const BEAM_END_RHO_MAX = 2.5; // 6.3.4-1 (宜), % of b·h0

// --- columns: GB 55008 4.4.9 + GB 50011 6.3.6/6.3.9 ---

// GB 50011 表6.3.6 (λ > 2, ≤ C60). null = not permitted / no row (部分框支 三、四级).
export function columnAxialRatioLimit(g: SeismicGrade, sys: GbSystem): number | null {
  if (sys === "frame") return pick(g, [0.65, 0.75, 0.85, 0.9]);
  if (sys === "dual") return pick(g, [0.75, 0.85, 0.9, 0.95]);
  return pick(g, [0.6, 0.7, null, null]);
}

// μN = N / (fc·A); N in kN (compression positive), mm, fc design N/mm².
export const axialRatio = (nKN: number, areaMm2: number, fc: number): number => (Math.abs(nKN) * 1000) / (fc * areaMm2);

// 表4.4.9-1 total ρ (%); "frame" uses the bracketed 纯框架 value. +0.05 for a
// 400 MPa bar (55008), +0.10 below 400 (GB 50011 注2), +0.10 above C60. Each side
// ≥ 0.20% separately (COLUMN_SIDE_RHO_MIN); max total 5% (GB 50011 6.3.8-3).
export function columnRhoMinSeismic(g: SeismicGrade, at: "inner" | "corner", sys: GbSystem, fyk: number, fcuk: number): number {
  const base =
    at === "corner"
      ? pick(g, [1.1, 0.9, 0.8, 0.7])
      : sys === "frame"
        ? pick(g, [1.0, 0.8, 0.7, 0.6])
        : pick(g, [0.9, 0.7, 0.6, 0.5]);
  const bar = fyk < 400 ? 0.1 : fyk === 400 ? 0.05 : 0;
  return base + bar + (fcuk > 60 ? 0.1 : 0);
}
export const COLUMN_SIDE_RHO_MIN = 0.2;
export const COLUMN_RHO_MAX = 5;

// 表4.4.9-2: dense-zone ties. s ≤ min(k·d, cap) — 三、四级 150 except 柱根 100
// (we can't tell the base storey, so `atBase` is the caller's call). Ø: 三、四级
// may drop to 6 mm when the section is ≤ 400 mm (4.4.9-2 2)).
export function columnDenseTie(g: SeismicGrade, dLongMin: number, maxSide: number, atBase = false): { sMax: number; dMin: number } {
  const k = g === 1 ? 6 : 8;
  const cap = g <= 2 || atBase ? 100 : 150;
  const dMin = g === 1 ? 10 : g === 2 ? 8 : maxSide <= 400 ? 6 : 8;
  return { sMax: Math.min(k * dLongMin, cap), dMin };
}

// GB 50011 表6.3.9 (普通箍/复合箍 rows), linear between the listed μN.
const LV_MU = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.05];
const LV: Record<1 | 2 | 3, (number | null)[]> = {
  1: [0.1, 0.11, 0.13, 0.15, 0.17, 0.2, 0.23, null, null],
  2: [0.08, 0.09, 0.11, 0.13, 0.15, 0.17, 0.19, 0.22, 0.24],
  3: [0.06, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17, 0.2, 0.22],
};
/** λv for ordinary/compound ties; null beyond the table (μN above its last column). */
export function lambdaV(g: SeismicGrade, mu: number): number | null {
  const row = LV[g === 4 ? 3 : (g as 1 | 2 | 3)];
  if (mu <= LV_MU[0]) return row[0];
  for (let i = 1; i < LV_MU.length; i++) {
    if (mu <= LV_MU[i] + 1e-9) {
      const a = row[i - 1];
      const b = row[i];
      if (a == null || b == null) return null;
      return a + ((b - a) * (mu - LV_MU[i - 1])) / (LV_MU[i] - LV_MU[i - 1]);
    }
  }
  return null;
}

/**
 * GB 50011 6.3.9-3 required volumetric tie ratio (%): max(λv·fc/fyv, floor),
 * fc no lower than C35's, floor 0.8/0.6/0.4/0.4 %. null when λv is off-table
 * or fcuk is outside the GB concrete table.
 */
export function columnRhoVMin(g: SeismicGrade, mu: number, fcuk: number, fyv: number): number | null {
  const lv = lambdaV(g, mu);
  const c = gbConcrete(Math.max(fcuk, 35));
  if (lv == null || !c || !(fyv > 0)) return null;
  return Math.max((100 * lv * c.fc) / fyv, pick(g, [0.8, 0.6, 0.4, 0.4]));
}

/**
 * Volumetric ratio (%) of a rectangular tie set: legs in each direction
 * running across the core. coreY/coreZ = core dimensions (mm) measured
 * along Y/Z; legsY = legs parallel to Y (each coreY long), legsZ likewise.
 */
export function tieRhoV(barAreaMm2: number, legsY: number, legsZ: number, coreY: number, coreZ: number, s: number): number {
  if (!(coreY > 0 && coreZ > 0 && s > 0)) return 0;
  return (100 * barAreaMm2 * (legsY * coreY + legsZ * coreZ)) / (coreY * coreZ * s);
}

// --- walls: GB 55008 4.4.7-1, GB 50011 6.4.2 ---

export const wallDistRhoMin = (g: SeismicGrade): number => (g === 4 ? 0.2 : 0.25);
/** 6.4.2: wall-pier axial ratio under gravity-representative load. 四级: no limit. */
export function wallAxialRatioLimit(g: SeismicGrade, intensity9 = false): number | null {
  if (g === 1) return intensity9 ? 0.4 : 0.5;
  return g <= 3 ? 0.6 : null;
}

// --- per-member evaluators used by the column / wall boards ----------------


export interface SeisIssue {
  kind: string;
  actual: number;
  limit: number;
}
export interface ColumnSeisResult {
  issues: SeisIssue[];
  mu: number | null; // worst axial ratio across the section's elements
  muLimit: number | null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * GB seismic column rules for one section. Geometry/rebar come from the board
 * form (mm), materials + axial force from the section's CC-TABLE rows (Gen NX
 * check results), so everything except tie geometry waits for a 재검토.
 * `cover` = Gen NX DO, face → main-bar centre. Corner columns, 柱根 and λ ≤ 2
 * are not identifiable from the API, so the inner-column / general rows apply.
 */
export function gbColumnSeismic(
  g: SeismicGrade,
  sys: GbSystem,
  b: number,
  h: number,
  cover: number,
  main: { dia: number | null; num: number },
  endTie: { dia: number | null; legY: number; legZ: number; s: number },
  cenTie: { s: number },
  rows: MemberCheckRow[] | undefined
): ColumnSeisResult {
  const issues: SeisIssue[] = [];
  const area = b * h;
  const withMat = (rows || []).filter((r) => r.fck != null);
  const fcuk = withMat[0]?.fck;
  const fyk = withMat[0]?.fy;
  const fyvk = withMat[0]?.fys ?? fyk;
  const conc = fcuk != null ? gbConcrete(fcuk) : null;
  const muLimit = columnAxialRatioLimit(g, sys);
  let mu: number | null = null;
  if (conc && area > 0) {
    for (const r of withMat) if (r.pu != null) mu = Math.max(mu ?? 0, axialRatio(r.pu, area, conc.fc));
  }
  if (mu != null) {
    const lim = Math.min(muLimit ?? 1.05, 1.05);
    if (mu > lim + 1e-9) issues.push({ kind: "axial", actual: r3(mu), limit: lim });
  }
  // longitudinal ρ
  if (main.dia && main.num > 0 && area > 0) {
    const rho = (100 * barArea_mm2(main.dia) * main.num) / area;
    if (fyk != null && fcuk != null) {
      const min = columnRhoMinSeismic(g, "inner", sys, fyk, fcuk);
      if (rho < min - 1e-9) issues.push({ kind: "colRhoMin", actual: r3(rho), limit: r3(min) });
    }
    if (rho > COLUMN_RHO_MAX) issues.push({ kind: "colRhoMax", actual: r3(rho), limit: COLUMN_RHO_MAX });
  }
  // dense-zone ties
  if (main.dia && endTie.dia && endTie.s > 0) {
    const dense = columnDenseTie(g, main.dia, Math.max(b, h));
    if (endTie.s > dense.sMax + 1e-9) issues.push({ kind: "colDenseS", actual: endTie.s, limit: dense.sMax });
    if (endTie.dia < dense.dMin) issues.push({ kind: "colDenseDia", actual: endTie.dia, limit: dense.dMin });
    // volumetric ratio vs λv (needs μN + materials)
    // Tie centreline: DO is face → main-bar centre, the tie wraps the bars, so
    // it sits (d_main + d_tie)/2 further out. Core and leg lengths both use it.
    const tieY = b - 2 * cover + main.dia + endTie.dia;
    const tieZ = h - 2 * cover + main.dia + endTie.dia;
    const fyv = fyvk != null ? gbRebar(fyvk)?.fy : undefined;
    if (mu != null && fcuk != null && fyv) {
      const need = columnRhoVMin(g, mu, fcuk, fyv);
      const have = tieRhoV(barArea_mm2(endTie.dia), endTie.legY, endTie.legZ, tieY, tieZ, endTie.s);
      if (need != null && have < need - 1e-9) issues.push({ kind: "colRhoV", actual: r3(have), limit: r3(need) });
    }
  }
  // non-dense zone spacing (GB 50011 6.3.9-4): ≤ 10d (一、二) / 15d (三、四)
  if (main.dia && cenTie.s > 0) {
    const lim = (g <= 2 ? 10 : 15) * main.dia;
    if (cenTie.s > lim + 1e-9) issues.push({ kind: "colCenS", actual: cenTie.s, limit: lim });
  }
  return { issues, mu: mu != null ? r3(mu) : null, muLimit };
}

export interface WallSeisResult {
  issues: SeisIssue[];
  mu: number | null;
  muLimit: number | null;
}

// ρ (%) of a distribution-bar string "d10 @200" over thickness t (mm), `layers`
// curtains. null when the string doesn't parse or the bar is unknown.
export function distRho(bar: string | undefined, t: number | undefined, layers: number | undefined, dia: (label: string) => number | null): number | null {
  const m = bar?.match(/^\s*(\S+)\s*@\s*([\d.]+)/);
  if (!m || !t || !layers) return null;
  const d = dia(m[1]);
  const s = Number(m[2]);
  return d && s > 0 ? (100 * layers * barArea_mm2(d)) / (t * s) : null;
}

/**
 * GB seismic wall rules for one Wall ID from its WC-TABLE rows (worst story).
 * Gen NX's rhoV/rhoH.use read 0.000 when it didn't compute them (seen for
 * rhoH on the live GB dummy), so a non-positive value falls back to the bar
 * string + BarLayer + thickness.
 */
export function gbWallSeismic(g: SeismicGrade, rows: MemberCheckRow[] | undefined, dia: (label: string) => number | null = () => null): WallSeisResult {
  const issues: SeisIssue[] = [];
  const muLimit = wallAxialRatioLimit(g);
  let mu: number | null = null;
  let rv: number | null = null;
  let rh: number | null = null;
  for (const r of rows || []) {
    const c = r.fck != null ? gbConcrete(r.fck) : null;
    if (c && r.pu != null && r.lw && r.tw) mu = Math.max(mu ?? 0, axialRatio(r.pu, r.lw * r.tw, c.fc));
    const v = r.rhoV != null && r.rhoV > 0 ? r.rhoV : distRho(r.vRebar, r.tw, r.layers, dia);
    const h = r.rhoH != null && r.rhoH > 0 ? r.rhoH : distRho(r.hRebar, r.tw, r.layers, dia);
    if (v != null) rv = Math.min(rv ?? Infinity, v);
    if (h != null) rh = Math.min(rh ?? Infinity, h);
  }
  if (mu != null && muLimit != null && mu > muLimit + 1e-9) issues.push({ kind: "wallAxial", actual: r3(mu), limit: muLimit });
  const min = wallDistRhoMin(g);
  if (rv != null && rv < min - 1e-9) issues.push({ kind: "wallRhoV", actual: r3(rv), limit: min });
  if (rh != null && rh < min - 1e-9) issues.push({ kind: "wallRhoH", actual: r3(rh), limit: min });
  return { issues, mu: mu != null ? r3(mu) : null, muLimit };
}
