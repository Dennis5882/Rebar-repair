import type { ModelGeometry } from "../types/geometry";
import { flexuralCapacity } from "./rcBeamCheck";
import { columnMn } from "./twColumnMn";

// Strong-column / weak-beam check, Taiwan 112年版 18.4.3.2:
//   ΣMnc ≥ (6/5)·ΣMnb   at every beam–column joint of a special moment frame,
// exempt where the factored axial force incl. E is ≤ Ag·f'c/10 (18.4.3.2 lead-in).
// Built from the model geometry (which beams meet each column top node and which
// column sits above) + the beam/column REBB/REBC data the boards already load.
// Approximations (stated in the UI): column Mn assumes bars evenly spread on the
// perimeter; Pu is the governing axial force of the Gen NX column check; beam
// slab bars are ignored (T-beam flange steel only adds to ΣMnb, i.e. this can
// be unconservative for tension-flange slab steel); beams are treated as
// rectangular. Pure + tested.

export interface ScwbBeam {
  b: number; // mm
  h: number;
  dt: number; // top cover → bar centre
  db: number;
  I: { topAs: number; botAs: number };
  J: { topAs: number; botAs: number };
  maxBarDia?: number; // largest longitudinal bar, mm (joint depth rule 18.5.2.3)
}
export interface ScwbColumn {
  b: number;
  h: number;
  cover: number;
  nBars: number;
  barArea: number;
  pu?: number; // kN, governing compression (≥ 0)
}

export interface JointResult {
  node: string;
  below: string | null; // column element ids
  above: string | null;
  sumMnc: number; // kN·m
  sumMnb: number;
  ratio: number | null; // null when exempt or no beams
  exempt: boolean;
  maxBeamDia: number;
}

export interface ScwbResult {
  joints: JointResult[];
  // worst ratio per column section id (min over its top-node joints), null = no applicable joint
  bySection: Record<string, { ratio: number | null; failing: number; checked: number; maxBeamDia: number }>;
}

export const SCWB_LIMIT = 1.2;

function mnBeam(fck: number, fy: number, bm: ScwbBeam, end: "I" | "J", sign: "neg" | "pos"): number {
  const e = bm[end];
  const asT = sign === "neg" ? e.topAs : e.botAs;
  const asC = sign === "neg" ? e.botAs : e.topAs;
  const d = bm.h - (sign === "neg" ? bm.dt : bm.db);
  const dC = sign === "neg" ? bm.db : bm.dt;
  if (!(asT > 0 && d > 0)) return 0;
  const cap = flexuralCapacity("TWN_ACI", fck, fy, bm.b, d, asT, asC > 0 ? { As: asC, d: dC } : undefined);
  return cap ? cap.Mn_kNm : 0;
}

export function computeScwb(
  geo: ModelGeometry,
  beamBySect: Record<string, ScwbBeam>,
  colBySect: Record<string, ScwbColumn>,
  fck: number,
  fy: number
): ScwbResult {
  const at = new Map(geo.nodes.map((n) => [n.id, n]));
  const colsBelow = new Map<string, string[]>(); // node id → column members whose TOP is that node
  const colsAbove = new Map<string, string[]>(); // node id → column members whose BOTTOM is that node
  const colById = new Map(geo.cols.filter((c) => c.id).map((c) => [c.id as string, c]));
  for (const c of geo.cols) {
    const A = at.get(c.a);
    const B = at.get(c.b);
    if (!A || !B || !c.id) continue;
    const [bot, top] = A.z <= B.z ? [c.a, c.b] : [c.b, c.a];
    colsBelow.set(top, [...(colsBelow.get(top) || []), c.id]);
    colsAbove.set(bot, [...(colsAbove.get(bot) || []), c.id]);
  }
  const beamsAt = new Map<string, { dx: number; dy: number; bm: ScwbBeam; end: "I" | "J" }[]>();
  for (const bm of geo.beams) {
    const A = at.get(bm.a);
    const B = at.get(bm.b);
    const data = bm.sect ? beamBySect[bm.sect] : undefined;
    if (!A || !B || !data) continue;
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-9) continue;
    const add = (id: string, dx: number, dy: number, end: "I" | "J") => beamsAt.set(id, [...(beamsAt.get(id) || []), { dx, dy, bm: data, end }]);
    add(bm.a, (B.x - A.x) / L, (B.y - A.y) / L, "I");
    add(bm.b, (A.x - B.x) / L, (A.y - B.y) / L, "J");
  }

  const colMn = (id: string | null): { mn: number; sect: string | null; pu: number } => {
    const c = id ? colById.get(id) : undefined;
    const d = c?.sect ? colBySect[c.sect] : undefined;
    if (!c || !d) return { mn: 0, sect: c?.sect ?? null, pu: 0 };
    const input = { b: d.b, h: d.h, cover: d.cover, nBars: d.nBars, barArea: d.barArea, fck, fy };
    const pu = d.pu ?? 0;
    // minimum over the plausible axial range: zero and the governing compression
    return { mn: Math.min(columnMn(input, 0), columnMn(input, pu)), sect: c.sect ?? null, pu };
  };

  const joints: JointResult[] = [];
  const bySection: ScwbResult["bySection"] = {};
  for (const [node, belows] of colsBelow) {
    const beams = beamsAt.get(node) || [];
    const below = belows[0] ?? null;
    const above = (colsAbove.get(node) || [])[0] ?? null;
    const cb = colMn(below);
    const ca = colMn(above);
    const sumMnc = cb.mn + ca.mn;

    // ΣMnb: for each plan axis present among the beams, the larger of the two
    // opposite-sign pairings (left⁻+right⁺ or left⁺+right⁻); worst axis governs.
    const axes: { dx: number; dy: number }[] = [];
    for (const b of beams) if (!axes.some((a) => Math.abs(a.dx * b.dx + a.dy * b.dy) > 0.9)) axes.push(b);
    let sumMnb = 0;
    for (const ax of axes) {
      const side = (sgn: 1 | -1) =>
        beams.filter((b) => Math.abs(ax.dx * b.dx + ax.dy * b.dy) > 0.9 && Math.sign(ax.dx * b.dx + ax.dy * b.dy) === sgn);
      const neg = (list: ReturnType<typeof side>) => list.reduce((s, b) => s + mnBeam(fck, fy, b.bm, b.end, "neg"), 0);
      const pos = (list: ReturnType<typeof side>) => list.reduce((s, b) => s + mnBeam(fck, fy, b.bm, b.end, "pos"), 0);
      const L = side(-1);
      const R = side(1);
      sumMnb = Math.max(sumMnb, Math.max(neg(L) + pos(R), pos(L) + neg(R)));
    }

    // 18.4.3.2: no check where Pu ≤ Ag·f'c/10 for the columns at the joint.
    const colAxial = [cb, ca].map((c, i) => {
      const id = i === 0 ? below : above;
      const cd = id ? colById.get(id)?.sect : undefined;
      const d = cd ? colBySect[cd] : undefined;
      return d && c.pu > 0 ? c.pu * 1000 > (d.b * d.h * fck) / 10 : false;
    });
    const exempt = !colAxial.some(Boolean);
    const ratio = !exempt && sumMnb > 0 && sumMnc > 0 ? sumMnc / sumMnb : null;
    const maxBeamDia = beams.reduce((m, b) => Math.max(m, b.bm.maxBarDia ?? 0), 0);
    joints.push({ node, below, above, sumMnc, sumMnb, ratio, exempt, maxBeamDia });

    const sect = cb.sect ?? ca.sect;
    if (sect) {
      const cur = bySection[sect] || { ratio: null, failing: 0, checked: 0, maxBeamDia: 0 };
      cur.maxBeamDia = Math.max(cur.maxBeamDia, maxBeamDia);
      if (ratio != null) {
        cur.checked++;
        cur.ratio = cur.ratio == null ? ratio : Math.min(cur.ratio, ratio);
        if (ratio < SCWB_LIMIT - 1e-9) cur.failing++;
      }
      bySection[sect] = cur;
    }
  }
  return { joints, bySection };
}
