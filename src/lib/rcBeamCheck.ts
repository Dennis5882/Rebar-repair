// Instant (no Gen NX re-analysis) flexural/shear capacity check for BEAM
// rebar edits. Only covers design codes whose phi/beta1/Vc coefficients have
// been verified against the actual code text (not just inferred from ACI
// similarity) — see memory/genxn-api-schema-findings.md and the 2026-07-23
// session notes for the KDS 14 20 10/14 20 20/14 20 22 and Taiwan 112-nian
// (建築物混凝土結構設計規範) source citations behind these numbers. GB/T
// 50010-2010 (2024年版) was added 2026-10-12 — a design-strength code with no
// phi; see the GB section below for its clause references.
//
// Demand (Mu/Vu) is NOT fetched from Gen NX here — BC-TABLE's real response
// shape hasn't been live-verified yet, so the check panel takes Mu/Vu as
// manual input instead of guessing at an unverified endpoint.

// Which design codes this module has coefficients for lives as data on
// DESIGN_CODES in rcCodePresets.ts (the `rcCheckFamily` field), not as a
// second map here — a design-code label edited in one place used to be able
// to silently desync from this file's own copy of the same string.
export type { RcFormulaFamily } from "../data/rcCodePresets";
export { rcCheckFamily as formulaFamily } from "../data/rcCodePresets";
import type { RcFormulaFamily } from "../data/rcCodePresets";

const Es_MPa = 200000;

// KDS 14 20 20 표 4.1-2 (등가직사각형 응력분포 변수 값) — 40MPa 이하 구간은
// 표가 상수이고, 그 위는 표에 준 점들 사이를 선형보간한다(코드 관례).
const KDS_STRESS_BLOCK_TABLE = [
  { fck: 40, eta: 1.0, beta1: 0.8 },
  { fck: 50, eta: 0.97, beta1: 0.8 },
  { fck: 60, eta: 0.95, beta1: 0.76 },
  { fck: 70, eta: 0.91, beta1: 0.74 },
  { fck: 80, eta: 0.87, beta1: 0.72 },
  { fck: 90, eta: 0.84, beta1: 0.7 },
] as const;

function interpolateTable(fck: number, key: "eta" | "beta1"): number {
  const t = KDS_STRESS_BLOCK_TABLE;
  if (fck <= t[0].fck) return t[0][key];
  if (fck >= t[t.length - 1].fck) return t[t.length - 1][key];
  for (let i = 1; i < t.length; i++) {
    if (fck <= t[i].fck) {
      const a = t[i - 1];
      const b = t[i];
      const frac = (fck - a.fck) / (b.fck - a.fck);
      return a[key] + frac * (b[key] - a[key]);
    }
  }
  return t[t.length - 1][key];
}

// Taiwan 112-nian code 22.2.2.4.3 (identical to ACI 318-19's beta1 table,
// confirmed by section-numbering match — see session notes).
function twnAciBeta1(fck: number): number {
  if (fck <= 28) return 0.85;
  if (fck >= 56) return 0.65;
  return 0.85 - (0.05 * (fck - 28)) / 7;
}

// ── GB/T 50010-2010 (2024年版) ─────────────────────────────────────────────
// GB is NOT a phi-factor code: it checks M ≤ resistance computed with DESIGN
// strengths (fc, fy) that already carry the material partial factors. So the
// GB branch reports phi = 1 and "phiMn" = the design resistance, which keeps
// the board's demand/capacity ratio meaning the same thing.
//
// Inputs keep Gen NX's own meaning for a GB model (what Modify Concrete
// Material shows): `fck` = concrete grade = cube strength fcu,k (C30 → 30),
// `fy`/`fyt` = rebar characteristic yield fyk (HRB400 → 400). They are mapped
// to design values from the code tables below. All numbers checked against
// the code text in COde/CN/knowledge/gb50010-2010 (2010 original + 2024
// 局部修订, which only drops the C15 column and the HRB335 row).

// 表 4.1.4-1 / 4.1.4-2 — fc, ft by grade (C20–C80; C15 dropped in 2024).
const GB_CONCRETE = [
  { fcuk: 20, fc: 9.6, ft: 1.1 },
  { fcuk: 25, fc: 11.9, ft: 1.27 },
  { fcuk: 30, fc: 14.3, ft: 1.43 },
  { fcuk: 35, fc: 16.7, ft: 1.57 },
  { fcuk: 40, fc: 19.1, ft: 1.71 },
  { fcuk: 45, fc: 21.1, ft: 1.8 },
  { fcuk: 50, fc: 23.1, ft: 1.89 },
  { fcuk: 55, fc: 25.3, ft: 1.96 },
  { fcuk: 60, fc: 27.5, ft: 2.04 },
  { fcuk: 65, fc: 29.7, ft: 2.09 },
  { fcuk: 70, fc: 31.8, ft: 2.14 },
  { fcuk: 75, fc: 33.8, ft: 2.18 },
  { fcuk: 80, fc: 35.9, ft: 2.22 },
] as const;

// 表 4.2.3-1 — fyk → design fy (HRB335 row removed in 2024, kept here only so
// an existing older model still gets a number; 4.2.5 Es: HPB300 2.1e5).
const GB_REBAR: Record<number, { fy: number; Es: number }> = {
  300: { fy: 270, Es: 210000 }, // HPB300
  335: { fy: 300, Es: 200000 }, // HRB335 (deleted in 2024版)
  400: { fy: 360, Es: 200000 }, // HRB400 / HRBF400 / RRB400
  500: { fy: 435, Es: 200000 }, // HRB500 / HRBF500
};

/** Linear interpolation inside the code table; null outside C20–C80. */
export function gbConcrete(fcuk: number): { fc: number; ft: number } | null {
  const t = GB_CONCRETE;
  if (!(fcuk >= t[0].fcuk && fcuk <= t[t.length - 1].fcuk)) return null;
  for (let i = 1; i < t.length; i++) {
    if (fcuk <= t[i].fcuk) {
      const a = t[i - 1];
      const b = t[i];
      const k = (fcuk - a.fcuk) / (b.fcuk - a.fcuk);
      return { fc: a.fc + k * (b.fc - a.fc), ft: a.ft + k * (b.ft - a.ft) };
    }
  }
  return { fc: t[0].fc, ft: t[0].ft };
}

/** Exact grades only — an unknown fyk gets no estimate rather than a guess. */
export function gbRebar(fyk: number): { fy: number; Es: number } | null {
  return GB_REBAR[fyk] ?? null;
}

// 6.2.6 α1/β1, 6.3.1 βc: constant up to C50, linear to the C80 value.
function gbHighStrength(fcuk: number, atC50: number, atC80: number): number {
  if (fcuk <= 50) return atC50;
  if (fcuk >= 80) return atC80;
  return atC50 + ((atC80 - atC50) * (fcuk - 50)) / 30;
}

export type StrainZone = "tension" | "transition" | "compression";

export interface FlexuralCapacity {
  phi: number;
  zone: StrainZone;
  a_mm: number;
  c_mm: number;
  epsT: number;
  Mn_kNm: number;
  phiMn_kNm: number;
}

// Singly-reinforced rectangular section, Whitney stress block. Compression
// steel contribution is ignored (a simplification worth flagging — see the
// 2026-07-23 discussion — not a doubly-reinforced capacity).
export function flexuralCapacity(
  family: RcFormulaFamily,
  fck: number,
  fy: number,
  b: number,
  d: number,
  As: number
): FlexuralCapacity | null {
  if (!(fck > 0 && fy > 0 && b > 0 && d > 0 && As > 0)) return null;
  if (family === "GB") return gbFlexuralCapacity(fck, fy, b, d, As);

  const beta1 = family === "KDS" ? interpolateTable(fck, "beta1") : twnAciBeta1(fck);
  const eta = family === "KDS" ? interpolateTable(fck, "eta") : 1;

  const a = (As * fy) / (0.85 * eta * fck * b);
  // a >= 2d means the internal moment arm (d - a/2) is zero or negative —
  // physically invalid (grossly over-reinforced for this section), not just
  // a low-phi compression-controlled case. Report "no valid capacity"
  // instead of a nonsense negative Mn.
  if (a >= 2 * d) return null;
  const c = a / beta1;
  const epsT = (0.003 * (d - c)) / c;
  const epsTy = fy / Es_MPa;

  const phiTension = family === "KDS" ? 0.85 : 0.9;
  const phiCompression = 0.65; // tied (non-spiral) — beams don't use spiral ties
  let phi: number;
  let zone: StrainZone;
  if (family === "KDS") {
    // KDS 14 20 10 4.2.3(2)다: linear from phiCompression at epsTy to
    // phiTension at the tension-controlled limit (0.005).
    if (epsT >= 0.005) {
      phi = phiTension;
      zone = "tension";
    } else if (epsT <= epsTy) {
      phi = phiCompression;
      zone = "compression";
    } else {
      phi = phiCompression + ((phiTension - phiCompression) * (epsT - epsTy)) / (0.005 - epsTy);
      zone = "transition";
    }
  } else {
    // Taiwan/ACI Table 21.2.2: transition width is a fixed 0.003 strain band
    // above epsTy, not "up to 0.005" — different transition shape than KDS.
    const upper = epsTy + 0.003;
    if (epsT >= upper) {
      phi = phiTension;
      zone = "tension";
    } else if (epsT <= epsTy) {
      phi = phiCompression;
      zone = "compression";
    } else {
      phi = 0.65 + (0.25 * (epsT - epsTy)) / 0.003;
      zone = "transition";
    }
  }

  const Mn_kNm = (As * fy * (d - a / 2)) / 1e6;
  return { phi, zone, a_mm: a, c_mm: c, epsT, Mn_kNm, phiMn_kNm: phi * Mn_kNm };
}

// GB 6.2.10 (singly reinforced: A's = Ap = 0): α1·fc·b·x = fy·As and
// Mu = α1·fc·b·x·(h0 − x/2), subject to x ≤ ξb·h0 (6.2.10-3) with ξb from
// 6.2.7-1 and εcu from 6.2.1-5. When x would exceed ξb·h0 the section is
// over-reinforced; the code's resistance is then capped at x = ξb·h0 (extra
// steel adds nothing), reported as zone "compression".
function gbFlexuralCapacity(fcuk: number, fyk: number, b: number, h0: number, As: number): FlexuralCapacity | null {
  const conc = gbConcrete(fcuk);
  const bar = gbRebar(fyk);
  if (!conc || !bar) return null;
  const alpha1 = gbHighStrength(fcuk, 1.0, 0.94);
  const beta1 = gbHighStrength(fcuk, 0.8, 0.74);
  const epsCu = Math.min(0.0033, 0.0033 - (fcuk - 50) * 1e-5);
  const xiB = beta1 / (1 + bar.fy / (bar.Es * epsCu));

  const xFree = (bar.fy * As) / (alpha1 * conc.fc * b);
  const xMax = xiB * h0;
  const over = xFree > xMax;
  const x = over ? xMax : xFree;
  const c = x / beta1;
  const Mu_kNm = (alpha1 * conc.fc * b * x * (h0 - x / 2)) / 1e6;
  return {
    phi: 1,
    zone: over ? "compression" : "tension",
    a_mm: x,
    c_mm: c,
    epsT: (epsCu * (h0 - c)) / c,
    Mn_kNm: Mu_kNm,
    phiMn_kNm: Mu_kNm,
  };
}

export interface ShearCapacity {
  phi: number;
  Vc_kN: number;
  Vs_kN: number;
  Vn_kN: number;
  phiVn_kN: number;
}

// KDS 14 20 22 식(4.2-1): Vc=(1/6)λ√fck·bw·d. Taiwan 112-nian 22.5.5.1(a):
// Vc=0.17λ√fck·bw·d — same coefficient (1/6≈0.167), verified independently
// per code rather than assumed shared.
export function shearCapacity(
  family: RcFormulaFamily,
  fck: number,
  fyt: number,
  bw: number,
  d: number,
  Av: number,
  s: number
): ShearCapacity | null {
  if (!(fck > 0 && bw > 0 && d > 0)) return null;
  if (family === "GB") return gbShearCapacity(fck, fyt, bw, d, Av, s);
  const coeff = family === "KDS" ? 1 / 6 : 0.17;
  const Vc_N = coeff * Math.sqrt(fck) * bw * d;
  const Vs_N = Av > 0 && s > 0 && fyt > 0 ? (Av * fyt * d) / s : 0;
  const Vn_N = Vc_N + Vs_N;
  const phi = 0.75;
  return { phi, Vc_kN: Vc_N / 1000, Vs_kN: Vs_N / 1000, Vn_kN: Vn_N / 1000, phiVn_kN: (phi * Vn_N) / 1000 };
}

// GB 6.3.4 (stirrups only, general beam, no prestress): Vcs = 0.7·ft·b·h0 +
// fyv·(Asv/s)·h0, with fyv capped at 360 (4.2.3). Capped by the 6.3.1 section
// limit 0.25·βc·fc·b·h0 (hw/b ≤ 4) → 0.2·βc·fc·b·h0 (hw/b ≥ 6), linear between;
// hw = h0 for a rectangular section. The concentrated-load αcv = 1.75/(λ+1)
// case isn't modelled (needs the shear span, which the board doesn't have).
function gbShearCapacity(fcuk: number, fyk: number, b: number, h0: number, Asv: number, s: number): ShearCapacity | null {
  const conc = gbConcrete(fcuk);
  if (!conc) return null;
  const Vc_N = 0.7 * conc.ft * b * h0;
  let Vs_N = 0;
  if (Asv > 0 && s > 0) {
    const bar = gbRebar(fyk);
    if (!bar) return null;
    Vs_N = (Math.min(bar.fy, 360) * Asv * h0) / s;
  }
  const ratio = h0 / b;
  const k = ratio <= 4 ? 0.25 : ratio >= 6 ? 0.2 : 0.25 - (0.05 * (ratio - 4)) / 2;
  const Vmax_N = k * gbHighStrength(fcuk, 1.0, 0.8) * conc.fc * b * h0;
  const Vn_N = Math.min(Vc_N + Vs_N, Vmax_N);
  return { phi: 1, Vc_kN: Vc_N / 1000, Vs_kN: Vs_N / 1000, Vn_kN: Vn_N / 1000, phiVn_kN: Vn_N / 1000 };
}

export function barArea_mm2(diaMm: number): number {
  return (Math.PI / 4) * diaMm * diaMm;
}
