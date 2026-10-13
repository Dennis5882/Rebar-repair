import type { ModelGeometry } from "../types/geometry";

// Classify column elements from the model geometry for the GB seismic rules
// that depend on WHERE a column is — things Gen NX's API doesn't expose:
//  - corner (角柱): the beams framing into its top node come from ≤ 2 plan
//    directions that aren't opposite (an edge column has a straight-through
//    pair, an interior one four directions).
//  - base (柱根 / 底层柱下端): its bottom node is a support or sits at the
//    lowest column-bottom level.
//  - hn: clear height = length − the deepest beam framing into its top node.
// All lengths come back in mm (`toMm` converts model units). Pure + tested.

export interface ColumnClass {
  corner: boolean;
  base: boolean;
  hn: number | null; // mm
}

const EPS = 1e-6;

export function classifyColumns(geo: ModelGeometry, toMm: (v: number) => number): Record<string, ColumnClass> {
  const at = new Map(geo.nodes.map((n) => [n.id, n]));
  const supports = new Set(geo.baseNodes);
  // beams per node, with plan direction away from that node + depth
  const beamsAt = new Map<string, { dx: number; dy: number; h?: number }[]>();
  for (const b of geo.beams) {
    const A = at.get(b.a);
    const B = at.get(b.b);
    if (!A || !B) continue;
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < EPS) continue;
    const push = (id: string, dx: number, dy: number) => {
      const list = beamsAt.get(id) || [];
      list.push({ dx, dy, h: b.h });
      beamsAt.set(id, list);
    };
    push(b.a, (B.x - A.x) / L, (B.y - A.y) / L);
    push(b.b, (A.x - B.x) / L, (A.y - B.y) / L);
  }
  const ends = geo.cols
    .map((c) => {
      const A = at.get(c.a);
      const B = at.get(c.b);
      if (!A || !B || !c.id) return null;
      const [bot, top] = A.z <= B.z ? [A, B] : [B, A];
      return { id: c.id, bot, top };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const minZ = Math.min(...ends.map((e) => e.bot.z));

  const out: Record<string, ColumnClass> = {};
  for (const { id, bot, top } of ends) {
    // distinct plan directions at the top node (merge near-identical ones)
    const dirs: { dx: number; dy: number }[] = [];
    let deepest = 0;
    for (const d of beamsAt.get(top.id) || []) {
      if (d.h && d.h > deepest) deepest = d.h;
      if (!dirs.some((e) => e.dx * d.dx + e.dy * d.dy > 0.99)) dirs.push(d);
    }
    const opposite = dirs.some((a, i) => dirs.some((b, j) => j > i && a.dx * b.dx + a.dy * b.dy < -0.99));
    const corner = dirs.length > 0 && dirs.length <= 2 && !opposite;
    const base = supports.has(bot.id) || Math.abs(bot.z - minZ) < EPS;
    const len = top.z - bot.z;
    out[id] = { corner, base, hn: len > 0 ? toMm(len - deepest) : null };
  }
  return out;
}

/**
 * GB 50011 6.1.10 底部加强部位 + the storey above it (where 约束边缘构件 apply):
 * returns the indices (into the ascending `stories`) of the strengthened
 * storeys. H ≤ 24 m ⇒ the bottom storey; otherwise the larger of the bottom two
 * storeys and H/10 (H = top − bottom level). Levels in mm.
 */
export function strengthenedStories(levelsMm: number[]): number[] {
  if (levelsMm.length < 2) return levelsMm.length ? [0] : [];
  const H = levelsMm[levelsMm.length - 1] - levelsMm[0];
  const top = H <= 24000 ? levelsMm[1] : Math.max(levelsMm[Math.min(2, levelsMm.length - 1)], levelsMm[0] + H / 10);
  const out: number[] = [];
  for (let i = 0; i < levelsMm.length - 1; i++) if (levelsMm[i] < top - 1e-6) out.push(i);
  return out;
}
