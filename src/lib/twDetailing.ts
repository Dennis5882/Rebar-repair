import type { SectorKey } from "../types/rebar";
import { SECTORS } from "../types/rebar";
import { barArea_mm2, flexuralCapacity, shearCapacity } from "./rcBeamCheck";
import { toModelDiameter } from "../data/rcCodePresets";
import type { SectorFormValues } from "./beamRebarForm";
import type { DemandBySector, MatProps } from "./beamBoard";
import { TENSION_FACE, foldBySector } from "./detailIssues";

// Taiwan beam rebar-DETAILING checks (建築物混凝土結構設計規範 112年版) — the TW
// counterpart of kdsDetailing.ts / gbDetailing.ts, same advisory role: never
// folded into OK/NG (Gen NX's check is authoritative). Clauses read from the
// code text (TW knowledge base, 2026-10-14; the bracketed [MPa] forms are used,
// the code's kgf/cm² forms are the same numbers ×10.197):
//  - asMinTop/Bot 9.6.1.2: As,min = max(0.25√f'c/fy, 1.4/fy)·bw·d on the TENSION
//                 face; waived when the provided steel is ≥ 4/3 of what analysis
//                 needs (9.6.1.3) — approximated by φMn ≥ 4/3·Mu.
//  - avMin        9.6.3.4 表(a)(b): Av/s ≥ max(0.062√f'c, 0.35)·bw/fyt, required
//                 where Vu > φλ0.083√f'c·bw·d (9.6.3.1); exempt for h ≤ 25 cm
//                 when Vu ≤ φVc (表9.6.3.1).
//  - sMax         表9.7.6.2.2 (non-prestressed, along the length): min(d/2, 600)
//                 and, once Vs > 0.33√f'c·bw·d, min(d/4, 300) mm.
// With `smf` (特殊抗彎矩構架, 18.3) the special-moment-frame beam rules apply:
//  - smfWidth     18.3.2.1(b): bw ≥ max(0.3h, 250 mm)
//  - smfRhoMax    18.3.3.1: tension ρ ≤ min((f'c+10)/(4fy), 0.025)
//  - smfMoment    18.3.3.2: positive Mn at the joint face ≥ ½ the negative Mn
//  - smfThrough   18.3.3.1: ≥ 2 continuous bars top and bottom (M station)
//  - smfDenseS    18.3.4.4: closed stirrups within 2h of the support face at
//                 s ≤ min(d/4, 150, 6db|5.5db|5db for fy 420|490|550); replaces
//                 表9.7.6.2.2 at I/J
//  - smfMidS      18.3.4.6: s ≤ d/2 along the rest of the span
// λ = 1 (normal-weight concrete), rectangular gross section b×h.

export type TwDetailKind =
  | "asMinTop" | "asMinBot" | "avMin" | "sMax"
  | "smfWidth" | "smfRhoMaxTop" | "smfRhoMaxBot" | "smfMoment" | "smfThroughTop" | "smfThroughBot" | "smfDenseS" | "smfMidS";

export interface TwDetailIssue {
  kind: TwDetailKind;
  sectors: SectorKey[];
  actual: number; // mm (spacing/width), mm² (As/Av), ratio ρ (as %), kN·m (moment)
  limit: number;
  // false = the demand-dependent branch (Vu / Mu) couldn't be evaluated, so the
  // rule was applied conservatively.
  demandKnown: boolean;
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const round = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function twBeamDetailing(
  mat: MatProps,
  materialDB: string,
  b_mm: number,
  h_mm: number,
  dt_mm: number,
  db_mm: number,
  sectors: Record<SectorKey, SectorFormValues>,
  demand: DemandBySector,
  smf = false
): TwDetailIssue[] {
  const { fck, fy, fyt } = mat;
  if (!(fck > 0 && fy > 0 && b_mm > 0 && h_mm > 0)) return [];
  const sqrtFck = Math.sqrt(fck);
  const dNeg = h_mm - dt_mm;
  const dPos = h_mm - db_mm;
  const d = Math.max(dNeg, dPos) || h_mm;
  const fytEff = Math.min(fyt, smf ? 550 : 420); // 表20.2.2.4(a): stirrups ≤ 420 (550 special seismic)
  const dia = (label: string) => (label ? toModelDiameter(materialDB, label, "mm") : null);
  const area = (name: string, cnt: string) => {
    const dd = dia(name);
    const n = num(cnt);
    return dd && n > 0 ? barArea_mm2(dd) * n : 0;
  };

  const found: { sector: SectorKey; issue: Omit<TwDetailIssue, "sectors"> }[] = [];

  if (smf) {
    const bMin = Math.max(0.3 * h_mm, 250);
    if (b_mm < bMin - 1e-6) found.push({ sector: "M", issue: { kind: "smfWidth", actual: round(b_mm), limit: round(bMin), demandKnown: true } });
  }

  for (const key of SECTORS) {
    const s = sectors[key];
    const dem = demand[key];
    const isEnd = key !== "M";

    // --- flexural minimum As,min on the tension face (9.6.1.2 / 9.6.1.3) ---
    const faces: { kind: "asMinTop" | "asMinBot"; name: string; cnt: string; dd: number; mu?: number }[] = [
      { kind: "asMinTop", name: s.topName, cnt: s.topNum, dd: dNeg, mu: dem?.muNeg },
      { kind: "asMinBot", name: s.botName, cnt: s.botNum, dd: dPos, mu: dem?.muPos },
    ];
    for (const f of faces) {
      if (!TENSION_FACE[key][f.kind === "asMinTop" ? "top" : "bot"]) continue;
      const as = area(f.name, f.cnt);
      if (!(as > 0 && f.dd > 0)) continue;
      const asMin = (Math.max(0.25 * sqrtFck, 1.4) / fy) * b_mm * f.dd;
      if (as >= asMin - 1e-6) continue;
      const cap = flexuralCapacity("TWN_ACI", fck, fy, b_mm, f.dd, as);
      const waived = f.mu != null && cap ? cap.phiMn_kNm >= (4 / 3) * Math.abs(f.mu) : null;
      if (waived) continue;
      found.push({ sector: key, issue: { kind: f.kind, actual: round(as), limit: round(asMin), demandKnown: waived != null } });
    }

    // --- smf longitudinal: ρ ≤ min((f'c+10)/(4fy), 0.025) on each face (18.3.3.1) ---
    if (smf) {
      const rhoMax = Math.min((fck + 10) / (4 * fy), 0.025);
      for (const [face, nm, ct, dd] of [["Top", s.topName, s.topNum, dNeg], ["Bot", s.botName, s.botNum, dPos]] as const) {
        const as = area(nm, ct);
        if (!(as > 0 && dd > 0)) continue;
        const rho = as / (b_mm * dd);
        if (rho > rhoMax + 1e-9)
          found.push({ sector: key, issue: { kind: `smfRhoMax${face}` as TwDetailKind, actual: r3(100 * rho), limit: r3(100 * rhoMax), demandKnown: true } });
      }
    }

    // --- stirrups ---
    const sp = num(s.shearDist);
    const shearDia = dia(s.shearName);
    const av = shearDia && s.shearLeg ? barArea_mm2(shearDia) * num(s.shearLeg) : 0;
    if (sp > 0 && av > 0 && fytEff > 0) {
      const vs = (av * fytEff * d) / sp;
      const high = vs > 0.33 * sqrtFck * b_mm * d;
      const sMax = high ? Math.min(d / 4, 300) : Math.min(d / 2, 600);
      if (smf && isEnd) {
        // 18.3.4.4: smallest main flexural bar governs the 6db / 5.5db / 5db limb.
        const longDias = [area(s.topName, s.topNum) > 0 ? dia(s.topName) : null, area(s.botName, s.botNum) > 0 ? dia(s.botName) : null].filter((x): x is number => !!x);
        const db = longDias.length ? Math.min(...longDias) : Infinity;
        const mult = fy <= 420 ? 6 : fy <= 490 ? 5.5 : 5;
        const dense = Math.min(d / 4, 150, mult * db);
        if (sp > dense + 1e-6) found.push({ sector: key, issue: { kind: "smfDenseS", actual: sp, limit: round(dense), demandKnown: true } });
      } else if (smf && !isEnd) {
        const mid = d / 2;
        if (sp > mid + 1e-6) found.push({ sector: key, issue: { kind: "smfMidS", actual: sp, limit: round(mid), demandKnown: true } });
      } else if (sp > sMax + 1e-6) {
        found.push({ sector: key, issue: { kind: "sMax", actual: sp, limit: round(sMax), demandKnown: true } });
      }
    }
    if (sp > 0 && fytEff > 0 && b_mm > 0) {
      const vc = shearCapacity("TWN_ACI", fck, fytEff, b_mm, d, 0, 0);
      const vu = dem?.vu != null ? Math.abs(dem.vu) : null;
      // 9.6.3.1 threshold φλ0.083√f'c·bw·d, plus the 表9.6.3.1 shallow-beam exemption.
      const thresh = (0.75 * 0.083 * sqrtFck * b_mm * d) / 1000;
      const needed = vu != null ? vu > thresh : null;
      const exempt = h_mm <= 250 && (vu == null || (vc != null && vu <= vc.phiVn_kN));
      const avMin = (Math.max(0.062 * sqrtFck, 0.35) * b_mm * sp) / fytEff;
      if (needed !== false && !exempt && av < avMin - 1e-6)
        found.push({ sector: key, issue: { kind: "avMin", actual: round(av), limit: round(avMin), demandKnown: needed != null } });
    }
  }

  // --- smf: ≥ 2 continuous bars top and bottom (M station), 18.3.3.1 ---
  if (smf) {
    const m = sectors.M;
    for (const [face, ct] of [["Top", m.topNum], ["Bot", m.botNum]] as const) {
      const n = num(ct);
      if (n > 0 && n < 2) found.push({ sector: "M", issue: { kind: `smfThrough${face}` as TwDetailKind, actual: n, limit: 2, demandKnown: true } });
    }
    // --- smf: positive Mn at the joint face ≥ ½ negative Mn (18.3.3.2) ---
    for (const key of ["I", "J"] as const) {
      const s = sectors[key];
      const asTop = area(s.topName, s.topNum);
      const asBot = area(s.botName, s.botNum);
      if (!(asTop > 0 && asBot > 0)) continue;
      const neg = flexuralCapacity("TWN_ACI", fck, fy, b_mm, dNeg, asTop);
      const pos = flexuralCapacity("TWN_ACI", fck, fy, b_mm, dPos, asBot);
      if (neg && pos && pos.Mn_kNm < 0.5 * neg.Mn_kNm - 1e-6)
        found.push({ sector: key, issue: { kind: "smfMoment", actual: round(pos.Mn_kNm), limit: round(0.5 * neg.Mn_kNm), demandKnown: true } });
    }
  }

  return foldBySector(found);
}
