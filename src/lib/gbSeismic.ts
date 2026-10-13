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

// Where the column sits (from the model geometry, gbMemberClass.ts, with the
// user's overrides). Absent ⇒ the general inner/upper-storey rules.
export interface ColumnSituation {
  corner?: boolean; // 角柱
  base?: boolean; // 底层柱下端 (柱根)
  hn?: number | null; // clear height, mm ⇒ λ = Hn / (2·h0)
}

export interface ColumnSeisResult {
  issues: SeisIssue[];
  mu: number | null; // worst axial ratio across the section's elements
  muLimit: number | null; // after the λ ≤ 2 reduction
  lambda: number | null; // shear-span ratio Hn/(2h0), larger section side
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

// GB 50011 6.3.10 joint core: 一、二、三级 λv ≥ 0.12/0.10/0.08 and ρv ≥
// 0.6/0.5/0.4 %. 四级: no requirement.
const JOINT: Record<1 | 2 | 3, { lv: number; floor: number }> = { 1: { lv: 0.12, floor: 0.6 }, 2: { lv: 0.1, floor: 0.5 }, 3: { lv: 0.08, floor: 0.4 } };

/**
 * GB seismic column rules for one section. Geometry/rebar come from the board
 * form (mm), materials + axial force from the section's CC-TABLE rows (Gen NX
 * check results), so the strength-dependent rules wait for a 재검토.
 * `cover` = Gen NX DO, face → main-bar centre. `sit` adds what the geometry
 * tells: corner ⇒ 角柱 ρmin and (一、二级) full-height dense ties; base ⇒ 柱根
 * spacing 100 / 四级 Ø8; λ ≤ 2 ⇒ axial limit −0.05, full-height ties ≤ 100,
 * ρv ≥ 1.2 %, 四级 Ø8. The joint core (6.3.10) is checked with the column's end
 * ties, which Gen NX assumes continue through the joint.
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
  rows: MemberCheckRow[] | undefined,
  sit: ColumnSituation = {}
): ColumnSeisResult {
  const issues: SeisIssue[] = [];
  const area = b * h;
  const h0 = Math.max(b, h) - cover;
  const lambda = sit.hn && sit.hn > 0 && h0 > 0 ? r3(sit.hn / (2 * h0)) : null;
  const shortCol = lambda != null && lambda <= 2 + 1e-9;
  const withMat = (rows || []).filter((r) => r.fck != null);
  const fcuk = withMat[0]?.fck;
  const fyk = withMat[0]?.fy;
  const fyvk = withMat[0]?.fys ?? fyk;
  const conc = fcuk != null ? gbConcrete(fcuk) : null;
  const tableLimit = columnAxialRatioLimit(g, sys);
  // 表6.3.6 注2: λ ≤ 2 ⇒ −0.05 (注5 cap 1.05 applies regardless)
  const muLimit = tableLimit != null ? r3(tableLimit - (shortCol ? 0.05 : 0)) : null;
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
      const min = columnRhoMinSeismic(g, sit.corner ? "corner" : "inner", sys, fyk, fcuk);
      if (rho < min - 1e-9) issues.push({ kind: sit.corner ? "colRhoMinCorner" : "colRhoMin", actual: r3(rho), limit: r3(min) });
    }
    if (rho > COLUMN_RHO_MAX) issues.push({ kind: "colRhoMax", actual: r3(rho), limit: COLUMN_RHO_MAX });
  }
  // dense-zone ties
  const dense = main.dia ? columnDenseTie(g, main.dia, Math.max(b, h), !!sit.base) : null;
  if (dense && shortCol) dense.sMax = Math.min(dense.sMax, 100); // 4.4.9-2 3)
  if (dense && g === 4 && (sit.base || shortCol)) dense.dMin = Math.max(dense.dMin, 8); // 表6.3.7-2 / 6.3.7-2 2)
  const fyv = fyvk != null ? gbRebar(fyvk)?.fy : undefined;
  let rhoVHave: number | null = null;
  if (main.dia && endTie.dia && endTie.s > 0 && dense) {
    if (endTie.s > dense.sMax + 1e-9) issues.push({ kind: sit.base ? "colDenseSBase" : "colDenseS", actual: endTie.s, limit: dense.sMax });
    if (endTie.dia < dense.dMin) issues.push({ kind: "colDenseDia", actual: endTie.dia, limit: dense.dMin });
    // Tie centreline: DO is face → main-bar centre, the tie wraps the bars, so
    // it sits (d_main + d_tie)/2 further out. Core and leg lengths both use it.
    const tieY = b - 2 * cover + main.dia + endTie.dia;
    const tieZ = h - 2 * cover + main.dia + endTie.dia;
    rhoVHave = tieRhoV(barArea_mm2(endTie.dia), endTie.legY, endTie.legZ, tieY, tieZ, endTie.s);
    if (mu != null && fcuk != null && fyv) {
      let need = columnRhoVMin(g, mu, fcuk, fyv);
      if (need != null && shortCol) need = Math.max(need, 1.2); // 6.3.9-3 3)
      if (need != null && rhoVHave < need - 1e-9) issues.push({ kind: "colRhoV", actual: r3(rhoVHave), limit: r3(need) });
    }
  }
  // joint core (6.3.10), with the end ties
  if (g <= 3 && rhoVHave != null && fcuk != null && fyv) {
    const j = JOINT[g as 1 | 2 | 3];
    const c = gbConcrete(Math.max(fcuk, 35));
    if (c) {
      const need = Math.max((100 * j.lv * c.fc) / fyv, j.floor);
      if (rhoVHave < need - 1e-9) issues.push({ kind: "jointRhoV", actual: r3(rhoVHave), limit: r3(need) });
    }
  }
  // non-dense zone: full-height dense for 一、二级 corner columns (6.3.9-1 4)
  // and λ ≤ 2 columns; otherwise ≤ 10d (一、二) / 15d (三、四) (6.3.9-4)
  if (main.dia && cenTie.s > 0) {
    const fullDense = dense && (shortCol || (sit.corner && g <= 2));
    if (fullDense) {
      if (cenTie.s > dense!.sMax + 1e-9) issues.push({ kind: shortCol ? "colFullDenseShort" : "colFullDenseCorner", actual: cenTie.s, limit: dense!.sMax });
    } else {
      const lim = (g <= 2 ? 10 : 15) * main.dia;
      if (cenTie.s > lim + 1e-9) issues.push({ kind: "colCenS", actual: cenTie.s, limit: lim });
    }
  }
  return { issues, mu: mu != null ? r3(mu) : null, muLimit, lambda };
}

export interface WallSeisResult {
  issues: SeisIssue[];
  mu: number | null;
  muLimit: number | null;
  boundary?: WallBoundaryResult; // 6.4.5, when the board could evaluate it
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

// --- wall boundary elements (GB 50011 6.4.5, 暗柱 of a straight wall pier) ---

export type BoundaryType = "construct" | "constrain"; // 构造 / 约束边缘构件

// 表6.4.5-1: max bottom-pier axial ratio for 构造边缘构件 (一级 at 7/8度 assumed;
// 9度 is 0.1). 四级: always 构造.
export const BE_CONSTRUCT_MAX_MU = (g: SeismicGrade): number | null => pick(g, [0.2, 0.3, 0.3, null]);

// 表6.4.5-2 构造边缘构件: [ratio of Ac, bars, Ømin, tie Ø, tie s] for the
// 底部加强部位 and for the other storeys.
const BE_CONSTRUCT: Record<"bottom" | "other", [number, number, number, number, number][]> = {
  bottom: [[0.01, 6, 16, 8, 100], [0.008, 6, 14, 8, 150], [0.006, 6, 12, 6, 150], [0.005, 4, 12, 6, 200]],
  other: [[0.008, 6, 14, 8, 150], [0.006, 6, 12, 8, 200], [0.005, 4, 12, 6, 200], [0.004, 4, 12, 6, 250]],
};

export interface WallBoundaryInput {
  g: SeismicGrade;
  muBottom: number | null; // bottom-storey pier axial ratio
  inStrengthened: boolean; // the segment covers a 底部加强部位 storey
  inConstrainZone: boolean; // … or the storey right above it (约束 zone)
  hw: number; // pier length (mm)
  bw: number; // thickness (mm)
  fcuk: number | null;
  fyvk: number | null;
  cover: number; // DE, face → bar centre (mm)
  end: { dia: number | null; num: number } | null; // per end (REBW END_REBAR.NUM; live-verified 2026-10-13)
  tie: { dia: number | null; s: number } | null; // BE_HORIZONTAL_REBAR
  beLen: number | null; // BOUNDARY_ELEMENT_LENGTH (mm)
}

export interface WallBoundaryResult {
  type: BoundaryType;
  lc: number | null; // 约束 length along the pier (mm)
  ac: number; // boundary area used for the steel minimum (mm²)
  issues: SeisIssue[];
}

/**
 * 6.4.5: pick 构造/约束 from the bottom axial ratio, then check the end bars,
 * the boundary ties and (约束) the length lc and λv. 暗柱 only — flanges and
 * end columns aren't in REBW. 约束 applies to the 底部加强部位 + one storey
 * above; elsewhere 构造 (其他部位 row).
 */
export function gbWallBoundary(x: WallBoundaryInput): WallBoundaryResult {
  const { g } = x;
  const maxMu = BE_CONSTRUCT_MAX_MU(g);
  const constrain = maxMu != null && x.muBottom != null && x.muBottom > maxMu + 1e-9 && x.inConstrainZone;
  const issues: SeisIssue[] = [];
  let lc: number | null = null;
  let ac: number;
  let ratio: number, nMin: number, dMin: number, tieD: number, tieS: number;
  let lambdaV: number | null = null;
  if (constrain) {
    const mu = x.muBottom!;
    const high = g === 1 ? mu > 0.3 : mu > 0.4; // 表6.4.5-3 λ split (一级 7/8度)
    lc = Math.max((high ? 0.2 : 0.15) * x.hw, x.bw, 400);
    ac = x.bw * Math.max(x.bw, lc / 2, 400);
    ratio = g === 1 ? 0.012 : 0.01;
    nMin = g === 1 ? 8 : 6;
    dMin = g === 3 ? 14 : 16;
    tieD = 0; // 表6.4.5-3 gives λv, not a tie diameter
    tieS = g === 1 ? 100 : 150;
    lambdaV = high ? 0.2 : 0.12;
  } else {
    ac = x.bw * Math.max(x.bw, 400);
    [ratio, nMin, dMin, tieD, tieS] = BE_CONSTRUCT[x.inStrengthened ? "bottom" : "other"][g - 1];
  }
  const asNeed = Math.max(ratio * ac, nMin * barArea_mm2(dMin));
  if (!x.end || !x.end.dia || !(x.end.num > 0)) {
    issues.push({ kind: "beNoEnd", actual: 0, limit: Math.round(asNeed) });
  } else {
    const asHave = x.end.num * barArea_mm2(x.end.dia);
    if (asHave < asNeed - 1e-6) issues.push({ kind: "beAs", actual: Math.round(asHave), limit: Math.round(asNeed) });
    if (x.end.num < nMin) issues.push({ kind: "beNum", actual: x.end.num, limit: nMin });
    if (x.end.dia < dMin) issues.push({ kind: "beDia", actual: x.end.dia, limit: dMin });
  }
  if (x.tie && x.tie.dia && x.tie.s > 0) {
    if (tieD && x.tie.dia < tieD) issues.push({ kind: "beTieDia", actual: x.tie.dia, limit: tieD });
    if (x.tie.s > tieS + 1e-9) issues.push({ kind: "beTieS", actual: x.tie.s, limit: tieS });
    if (lambdaV != null && x.fcuk != null && x.fyvk != null) {
      const c = gbConcrete(Math.max(x.fcuk, 35));
      const fyv = gbRebar(x.fyvk)?.fy;
      if (c && fyv) {
        // one closed hoop around the hatched 暗柱 (bw × max(bw, lc/2, 400)),
        // centreline inset by the cover; distribution bars not counted (conservative)
        const len = Math.max(x.bw, lc! / 2, 400);
        const b1 = x.bw - 2 * x.cover + (x.end?.dia ?? 0) + x.tie.dia;
        const l1 = len - x.cover + ((x.end?.dia ?? 0) + x.tie.dia) / 2;
        const have = b1 > 0 && l1 > 0 ? (100 * barArea_mm2(x.tie.dia) * 2 * (b1 + l1)) / (b1 * l1 * x.tie.s) : 0;
        const need = (100 * lambdaV * c.fc) / fyv;
        if (have < need - 1e-9) issues.push({ kind: "beRhoV", actual: r3(have), limit: r3(need) });
      }
    }
  } else {
    issues.push({ kind: "beNoTie", actual: 0, limit: tieS });
  }
  if (lc != null && (x.beLen ?? 0) < lc - 1e-6) issues.push({ kind: "beLen", actual: Math.round(x.beLen ?? 0), limit: Math.round(lc) });
  return { type: constrain ? "constrain" : "construct", lc: lc != null ? Math.round(lc) : null, ac: Math.round(ac), issues };
}
