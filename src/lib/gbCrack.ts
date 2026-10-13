// GB 50010 7.1.2 maximum crack width of a flexural RC beam under the
// quasi-permanent (准永久) moment Mq, plus the BEAMFORCE parser that feeds it.
// Pure — imported by api/beam-design-result.ts (with .js) and unit-tested.
//
//   wmax = αcr·ψ·σs/Es·(1.9·cs + 0.08·deq/ρte)          (7.1.2-1)
//   ψ    = 1.1 − 0.65·ftk/(ρte·σs), 0.2 ≤ ψ ≤ 1.0      (7.1.2-2)
//   σs   = Mq/(0.87·h0·As)                              (7.1.4-3)
//   ρte  = As/(0.5·b·h), ≥ 0.01; αcr = 1.9 (flexural); cs clamped 20…65 mm
//   deq  = Σn·d² / Σn·ν·d, ν = 1.0 (ribbed bars)
// Limits (表3.4.5, RC): 0.3 mm (一类), 0.2 mm (二a/二b/三a/三b); 0.4 mm for
// 一类 when the year-average RH < 60%… the board lets the user pick.

// GB 50010 表4.1.3-2 ftk (N/mm²) by fcu,k.
const FTK: [number, number][] = [
  [20, 1.54], [25, 1.78], [30, 2.01], [35, 2.2], [40, 2.39], [45, 2.51], [50, 2.64],
  [55, 2.74], [60, 2.85], [65, 2.93], [70, 2.99], [75, 3.05], [80, 3.11],
];
export function gbFtk(fcuk: number): number | null {
  if (!(fcuk >= 20 && fcuk <= 80)) return null;
  for (let i = 1; i < FTK.length; i++) {
    const [c1, f1] = FTK[i];
    if (fcuk <= c1) {
      const [c0, f0] = FTK[i - 1];
      return f0 + ((f1 - f0) * (fcuk - c0)) / (c1 - c0);
    }
  }
  return FTK[0][1];
}

export interface CrackInput {
  mq: number; // kN·m, magnitude on the face in tension
  b: number;
  h: number; // mm
  cover: number; // mm, face → bar centroid (Gen NX DT/DB)
  n: number; // bar count
  d: number; // bar diameter, mm
  fcuk: number; // concrete grade value (C30 ⇒ 30)
  Es?: number; // N/mm², default 2.0e5 (HRB)
}
export interface CrackResult {
  w: number; // mm
  sigmaS: number; // N/mm²
  psi: number;
}

export function gbCrackWidth(x: CrackInput): CrackResult | null {
  const ftk = gbFtk(x.fcuk);
  const As = x.n * (Math.PI / 4) * x.d * x.d;
  const h0 = x.h - x.cover;
  if (!ftk || !(As > 0 && h0 > 0 && x.b > 0)) return null;
  const Es = x.Es ?? 2.0e5;
  const sigmaS = (Math.abs(x.mq) * 1e6) / (0.87 * h0 * As);
  const rhoTe = Math.max(As / (0.5 * x.b * x.h), 0.01);
  const psi = Math.min(1, Math.max(0.2, 1.1 - (0.65 * ftk) / (rhoTe * sigmaS || 1e-9)));
  const cs = Math.min(65, Math.max(20, x.cover - x.d / 2));
  const w = ((1.9 * psi * sigmaS) / Es) * (1.9 * cs + (0.08 * x.d) / rhoTe);
  return { w: Math.round(w * 1000) / 1000, sigmaS: Math.round(sigmaS * 10) / 10, psi: Math.round(psi * 1000) / 1000 };
}

// --- BEAMFORCE rows → service moment My per element and station -------------
// Requested with PARTS ["PartI","Part2/4","PartJ"]; the Part cell reads "I[7]",
// "2/4", "J[8]" (live 2026-10-13). My in kN·m, signed: negative = hogging (top
// in tension) in Gen NX's beam local axes.
export type Station = "I" | "M" | "J";
export function parseServiceMoments(head: string[], rows: string[][]): Record<string, Partial<Record<Station, number>>> {
  const eI = head.indexOf("Elem");
  const pI = head.indexOf("Part");
  const mI = head.indexOf("Moment-y");
  const out: Record<string, Partial<Record<Station, number>>> = {};
  if (eI < 0 || pI < 0 || mI < 0) return out;
  for (const r of rows) {
    const part = String(r[pI] ?? "");
    const st: Station | null = part.startsWith("I") ? "I" : part.startsWith("J") ? "J" : part === "2/4" ? "M" : null;
    const v = Number(r[mI]);
    if (!st || !Number.isFinite(v)) continue;
    const e = String(r[eI]);
    const cur = (out[e] ||= {});
    // envelope tables can repeat a station — keep the larger magnitude
    if (cur[st] == null || Math.abs(v) > Math.abs(cur[st]!)) cur[st] = v;
  }
  return out;
}
