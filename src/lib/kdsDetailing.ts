import type { SectorKey } from "../types/rebar";
import { SECTORS } from "../types/rebar";
import { barArea_mm2, flexuralCapacity, shearCapacity } from "./rcBeamCheck";
import { toModelDiameter } from "../data/rcCodePresets";
import type { SectorFormValues } from "./beamRebarForm";
import type { DemandBySector, MatProps } from "./beamBoard";
import { TENSION_FACE, foldBySector } from "./detailIssues";

// KDS beam rebar-DETAILING checks the board shows next to the verdict — rules
// that are about the bar arrangement itself, not strength vs demand. Advisory
// only: they never change the OK/NG verdict (Gen NX's check is authoritative).
// Clauses read from the KCSC original text (KDS knowledge base, 2026-10-12):
//  - sMax  KDS 14 20 22 4.3.2(1)(3): stirrup spacing ≤ d/2 and ≤ 600 mm, both
//          halved when Vs > λ(√fck/3)·bw·d.
//  - avMin KDS 14 20 22 4.3.3(1)(3) 식(4.3-1): Av ≥ max(0.0625√fck, 0.35)·bw·s/fyt,
//          required where Vu > φVc/2; exempt when h ≤ 250 mm (4.3.3(1)③).
//  - mcr   KDS 14 20 20 4.2.2 식(4.2-1): φMn ≥ 1.2·Mcr, Mcr = fr·Ig/yt
//          (KDS 14 20 30 식(4.2-2)), fr = 0.63λ√fck (식(4.2-3)); waived where
//          φMn ≥ (4/3)·Mu (식(4.2-2)).
// λ = 1 (normal-weight concrete), rectangular gross section b×h.

export type DetailKind = "sMax" | "avMin" | "mcrTop" | "mcrBot";

export interface DetailIssue {
  kind: DetailKind;
  sectors: SectorKey[]; // stations sharing this exact issue (deduped)
  actual: number; // mm (sMax), mm² (avMin), kN·m φMn (mcr*)
  limit: number; // same unit as actual
  halved?: boolean; // sMax: limit halved because Vs > (√fck/3)·bw·d
  // Whether the rule is known to apply. false = no demand loaded, so the
  // "required where Vu > φVc/2" / "waived when φMn ≥ 4/3·Mu" escape couldn't
  // be evaluated and the rule was applied conservatively.
  demandKnown: boolean;
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const round = (x: number) => Math.round(x * 10) / 10;

export function kdsBeamDetailing(
  mat: MatProps,
  materialDB: string,
  b_mm: number,
  h_mm: number,
  dt_mm: number,
  db_mm: number,
  sectors: Record<SectorKey, SectorFormValues>,
  demand: DemandBySector
): DetailIssue[] {
  const { fck, fy, fyt } = mat;
  if (!(fck > 0 && fy > 0 && b_mm > 0 && h_mm > 0)) return [];
  const sqrtFck = Math.sqrt(fck);
  const dNeg = h_mm - dt_mm;
  const dPos = h_mm - db_mm;
  const d = Math.max(dNeg, dPos) || h_mm;
  // Mcr of the gross rectangle: fr·(b·h³/12)/(h/2) = fr·b·h²/6.
  const mcr_kNm = (0.63 * sqrtFck * b_mm * h_mm * h_mm) / 6 / 1e6;

  const found: { sector: SectorKey; issue: Omit<DetailIssue, "sectors"> }[] = [];

  for (const key of SECTORS) {
    const s = sectors[key];
    const dem = demand[key];

    // --- stirrups: spacing + minimum area ---
    const sp = num(s.shearDist);
    const shearDia = toModelDiameter(materialDB, s.shearName, "mm");
    const av = shearDia && s.shearLeg ? barArea_mm2(shearDia) * num(s.shearLeg) : 0;
    if (sp > 0 && av > 0 && fyt > 0) {
      const vs = (av * Math.min(fyt, 500) * d) / sp; // 4.3.1(3): fyt ≤ 500
      const halved = vs > (sqrtFck / 3) * b_mm * d;
      const sMax = Math.min(d / 2, 600) / (halved ? 2 : 1);
      if (sp > sMax + 1e-6) found.push({ sector: key, issue: { kind: "sMax", actual: sp, limit: round(sMax), halved, demandKnown: true } });
    }
    if (h_mm > 250 && sp > 0 && fyt > 0) {
      const vc = shearCapacity("KDS", fck, fyt, b_mm, d, 0, 0);
      const needed = dem?.vu != null && vc ? Math.abs(dem.vu) > 0.5 * vc.phi * vc.Vc_kN : null;
      const avMin = (Math.max(0.0625 * sqrtFck, 0.35) * b_mm * sp) / Math.min(fyt, 500);
      if (needed !== false && av < avMin - 1e-6)
        found.push({ sector: key, issue: { kind: "avMin", actual: round(av), limit: round(avMin), demandKnown: needed != null } });
    }

    // --- flexural minimum: φMn ≥ 1.2·Mcr on the tension face (TENSION_FACE) ---
    const faces: { kind: "mcrTop" | "mcrBot"; name: string; cnt: string; dd: number; mu?: number }[] = [
      { kind: "mcrTop", name: s.topName, cnt: s.topNum, dd: dNeg, mu: dem?.muNeg },
      { kind: "mcrBot", name: s.botName, cnt: s.botNum, dd: dPos, mu: dem?.muPos },
    ];
    for (const f of faces) {
      if (!TENSION_FACE[key][f.kind === "mcrTop" ? "top" : "bot"]) continue;
      const dia = toModelDiameter(materialDB, f.name, "mm");
      const as = dia && f.cnt ? barArea_mm2(dia) * num(f.cnt) : 0;
      if (!(as > 0 && f.dd > 0)) continue;
      const cap = flexuralCapacity("KDS", fck, fy, b_mm, f.dd, as);
      if (!cap) continue;
      if (cap.phiMn_kNm >= 1.2 * mcr_kNm) continue;
      const waived = f.mu != null ? cap.phiMn_kNm >= (4 / 3) * Math.abs(f.mu) : null;
      if (waived) continue;
      found.push({ sector: key, issue: { kind: f.kind, actual: round(cap.phiMn_kNm), limit: round(1.2 * mcr_kNm), demandKnown: waived != null } });
    }
  }

  return foldBySector(found);
}
