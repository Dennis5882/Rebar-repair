// Instant (no Gen NX re-analysis) flexural/shear capacity check for BEAM
// rebar edits. Only covers design codes whose phi/beta1/Vc coefficients have
// been verified against the actual code text (not just inferred from ACI
// similarity) — see memory/genxn-api-schema-findings.md and the 2026-07-23
// session notes for the KDS 14 20 10/14 20 20/14 20 22 and Taiwan 112-nian
// (建築物混凝土結構設計規範) source citations behind these numbers.
//
// Demand (Mu/Vu) is NOT fetched from Gen NX here — BC-TABLE's real response
// shape hasn't been live-verified yet, so the check panel takes Mu/Vu as
// manual input instead of guessing at an unverified endpoint.

export type RcFormulaFamily = "KDS" | "TWN_ACI";

const FAMILY_BY_DESIGN_CODE: Record<string, RcFormulaFamily> = {
  "KDS 41 20 : 2022": "KDS",
  "TWN-USD112": "TWN_ACI",
};

export function formulaFamily(designCode: string): RcFormulaFamily | null {
  return FAMILY_BY_DESIGN_CODE[designCode] || null;
}

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

  const beta1 = family === "KDS" ? interpolateTable(fck, "beta1") : twnAciBeta1(fck);
  const eta = family === "KDS" ? interpolateTable(fck, "eta") : 1;

  const a = (As * fy) / (0.85 * eta * fck * b);
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
  const coeff = family === "KDS" ? 1 / 6 : 0.17;
  const Vc_N = coeff * Math.sqrt(fck) * bw * d;
  const Vs_N = Av > 0 && s > 0 && fyt > 0 ? (Av * fyt * d) / s : 0;
  const Vn_N = Vc_N + Vs_N;
  const phi = 0.75;
  return { phi, Vc_kN: Vc_N / 1000, Vs_kN: Vs_N / 1000, Vn_kN: Vn_N / 1000, phiVn_kN: (phi * Vn_N) / 1000 };
}

export function barArea_mm2(diaMm: number): number {
  return (Math.PI / 4) * diaMm * diaMm;
}
