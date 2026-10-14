import type { MemberCheckRow } from "./api";

// Taiwan 112年版 special-moment-frame COLUMN rules (18.4) — advisory like the
// GB counterpart (gbColumnSeismic): they never alter Gen NX's OK/NG. Clauses
// read from the TW knowledge base (2026-10-14); units mm / MPa / kN:
//  - minDim   18.4.2.1(a): smaller side ≥ 300 mm
//  - aspect   18.4.2.1(b): smaller / larger side ≥ 0.4
//  - rhoMin / rhoMax  18.4.4.1: 1% ≤ Ast/Ag ≤ 6%
//  - endS     18.4.5.3 within ℓo of each joint: s ≤ min(bmin/4, 6|5.5|5 db_min
//             for fy 420|490|550, so), so = 100 + (350 − hx)/3 clamped 100–150
//  - midS     18.4.5.5 outside ℓo: s ≤ min(150, 6|5.5|5 db_min)
//  - endAsh   表18.4.5.4: Ash/(s·bc) ≥ max(0.3(Ag/Ach − 1)f'c/fyt, 0.09f'c/fyt)
//             and, when Pu > 0.3·Ag·f'c, 0.2·kf·kn·Pu/(fyt·Ach)
//  - hx       18.4.5.2(e)(f): supported-bar spacing hx ≤ 350 mm (≤ 200 mm when
//             Pu > 0.3·Ag·f'c)
// ℓo (18.4.5.1) = max(section depth, clear height/6, 450 mm) is returned for
// display. Where the model has no tie-leg layout detail the legs are taken as
// total legs per direction and the SMALLER count is paired with the LARGER
// core dimension (conservative for a rectangular column).

export type TwColKind = "minDim" | "aspect" | "rhoMin" | "rhoMax" | "endS" | "midS" | "endAsh" | "hx" | "hx200";

export interface TwColIssue {
  kind: TwColKind;
  actual: number;
  limit: number;
}

export interface TwColResult {
  issues: TwColIssue[];
  lo: number | null; // plastic-hinge length ℓo, mm
  pending: boolean; // axial-force-dependent rules skipped (no Gen NX rows yet)
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const area = (d: number) => (Math.PI / 4) * d * d;

/** 6 / 5.5 / 5 × the smallest longitudinal bar diameter (fy 420 / 490 / 550). */
function dbMultiple(fy: number): number {
  return fy <= 420 ? 6 : fy <= 490 ? 5.5 : 5;
}

export function twColumnSeismic(
  b: number,
  h: number,
  doVal: number, // Gen NX "DO": face to bar centre, mm
  main: { dia: number | null; num: number },
  endTie: { dia: number | null; legY: number; legZ: number; s: number },
  cenS: number,
  rows: MemberCheckRow[] | undefined,
  hn?: number | null
): TwColResult {
  const issues: TwColIssue[] = [];
  const small = Math.min(b, h);
  const large = Math.max(b, h);
  if (!(small > 0)) return { issues, lo: null, pending: true };
  const Ag = b * h;

  if (small < 300 - 1e-6) issues.push({ kind: "minDim", actual: r1(small), limit: 300 });
  if (small / large < 0.4 - 1e-9) issues.push({ kind: "aspect", actual: r3(small / large), limit: 0.4 });

  if (main.dia && main.num > 0) {
    const rho = (main.num * area(main.dia)) / Ag;
    if (rho < 0.01 - 1e-9) issues.push({ kind: "rhoMin", actual: r3(100 * rho), limit: 1 });
    if (rho > 0.06 + 1e-9) issues.push({ kind: "rhoMax", actual: r3(100 * rho), limit: 6 });
  }

  const withMat = (rows || []).filter((r) => r.fck != null);
  const fc = withMat[0]?.fck;
  const fy = withMat[0]?.fy;
  const fyt = Math.min(withMat[0]?.fys ?? fy ?? 0, 550);
  const lo = hn && hn > 0 ? Math.max(large, hn / 6, 450) : null;

  // Supported-bar spacing from the tie legs (equal bar spacing assumed).
  const cover = doVal > 0 ? doVal : 0;
  let hx: number | null = null;
  if (cover > 0 && endTie.legY >= 2 && endTie.legZ >= 2) {
    hx = Math.max((b - 2 * cover) / (endTie.legY - 1), (h - 2 * cover) / (endTie.legZ - 1));
  }

  let Pu: number | null = null;
  for (const r of withMat) if (r.pu != null) Pu = Math.max(Pu ?? 0, r.pu);
  const highAxial = fc != null && Pu != null && Pu * 1000 > 0.3 * Ag * fc;
  if (hx != null) {
    const lim = highAxial ? 200 : 350;
    if (hx > lim + 1e-6) issues.push({ kind: highAxial ? "hx200" : "hx", actual: r1(hx), limit: lim });
  }

  // Spacing limits need the bar grade; fall back to 420 until Gen NX rows exist.
  const mult = dbMultiple(fy ?? 420);
  if (main.dia && endTie.s > 0) {
    const so = Math.min(150, Math.max(100, hx != null ? 100 + (350 - hx) / 3 : 100));
    const lim = Math.min(small / 4, mult * main.dia, so);
    if (endTie.s > lim + 1e-6) issues.push({ kind: "endS", actual: r1(endTie.s), limit: r1(lim) });
  }
  if (main.dia && cenS > 0) {
    const lim = Math.min(150, mult * main.dia);
    if (cenS > lim + 1e-6) issues.push({ kind: "midS", actual: r1(cenS), limit: r1(lim) });
  }

  // Ash/(s·bc): needs f'c and fyt (Gen NX rows), and the tie area.
  if (fc != null && fyt > 0 && endTie.dia && endTie.s > 0 && cover > 0) {
    const mainD = main.dia ?? 0;
    const cOut = Math.max(cover - mainD / 2 - endTie.dia, 0); // cover to the hoop's outside face
    const bc = large - 2 * cOut;
    const ach = (b - 2 * cOut) * (h - 2 * cOut);
    if (ach > 0 && bc > 0) {
      const legs = Math.min(endTie.legY, endTie.legZ);
      const ashProv = legs * area(endTie.dia);
      let need = Math.max(0.3 * (Ag / ach - 1) * (fc / fyt), 0.09 * (fc / fyt));
      if (highAxial && Pu != null) {
        const kf = Math.max(fc / 175 + 0.6, 1); // 18.4.5.4a [MPa form]
        const nl = Math.max(main.num, 4);
        const kn = nl / (nl - 2);
        need = Math.max(need, (0.2 * kf * kn * (Pu * 1000)) / (fyt * ach));
      }
      const have = ashProv / (endTie.s * bc);
      if (have < need - 1e-9) issues.push({ kind: "endAsh", actual: r3(have), limit: r3(need) });
    }
  }

  return { issues, lo, pending: withMat.length === 0 };
}
