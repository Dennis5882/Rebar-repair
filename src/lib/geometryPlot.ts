import type { GeoNode, MemberPair, ModelGeometry } from "../types/geometry";
import type { TFn } from "../i18n/types";

function lineTrace(byId: Map<string, GeoNode>, pairs: MemberPair[], name: string, color: string, width: number) {
  if (!pairs.length) return null;
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const z: (number | null)[] = [];
  for (const [a, b] of pairs) {
    const A = byId.get(a);
    const B = byId.get(b);
    if (!A || !B) continue;
    x.push(A.x, B.x, null);
    y.push(A.y, B.y, null);
    z.push(A.z, B.z, null);
  }
  return { type: "scatter3d", mode: "lines", name, x, y, z, line: { color, width }, hoverinfo: "skip" };
}

export function buildGeometryTraces(geo: ModelGeometry, t: TFn): any[] {
  const byId = new Map(geo.nodes.map((n) => [n.id, n]));
  const traces: any[] = [];

  const colTrace = lineTrace(byId, geo.cols, t("geo3d.legendCol"), "#2a78d6", 5);
  const beamTrace = lineTrace(byId, geo.beams, t("geo3d.legendBeam"), "#38b6d6", 3);
  const braceTrace = lineTrace(byId, geo.braces, t("geo3d.legendBrace"), "#9b8cff", 3);
  for (const tr of [colTrace, beamTrace, braceTrace]) if (tr) traces.push(tr);

  if (geo.walls.length) {
    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    const ii: number[] = [];
    const jj: number[] = [];
    const kk: number[] = [];
    let base = 0;
    for (const w of geo.walls) {
      const ns = w.nodes.map((id) => byId.get(id)).filter((n): n is GeoNode => !!n);
      if (ns.length < 3) continue;
      const corners = ns.slice(0, 4);
      for (const n of corners) {
        vx.push(n.x);
        vy.push(n.y);
        vz.push(n.z);
      }
      if (corners.length >= 4) {
        ii.push(base, base);
        jj.push(base + 1, base + 2);
        kk.push(base + 2, base + 3);
      } else {
        ii.push(base);
        jj.push(base + 1);
        kk.push(base + 2);
      }
      base += corners.length;
    }
    if (base) {
      traces.push({
        type: "mesh3d",
        name: t("geo3d.legendWall"),
        // Plotly's mesh3d traces default to no legend entry (unlike
        // scatter3d), so without this the wall mesh renders but is
        // impossible to find/toggle — it was actually there all along,
        // just an invisible-in-the-legend, easy-to-miss faint patch.
        showlegend: true,
        x: vx,
        y: vy,
        z: vz,
        i: ii,
        j: jj,
        k: kk,
        color: "#9b8cff",
        opacity: 0.55,
        flatshading: true,
        hoverinfo: "skip",
      });
    }
  }

  // All nodes: shown only on demand (Plotly's legend click toggles a
  // "legendonly" trace on/off) — with a real model's node count they'd
  // clutter the default view, but hiding them outright removes a useful
  // debugging aid, so they're one click away instead of gone.
  if (geo.nodes.length) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: t("geo3d.legendNode"),
      visible: "legendonly",
      x: geo.nodes.map((n) => n.x),
      y: geo.nodes.map((n) => n.y),
      z: geo.nodes.map((n) => n.z),
      marker: { size: 3, color: "#898781" },
      hoverinfo: "skip",
    });
  }

  const baseSet = new Set(geo.baseNodes);
  const supports = geo.nodes.filter((n) => baseSet.has(n.id));

  if (supports.length) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: t("geo3d.legendSupport"),
      x: supports.map((n) => n.x),
      y: supports.map((n) => n.y),
      z: supports.map((n) => n.z),
      marker: { size: 5, color: "#e34948", symbol: "diamond", line: { color: "#fff", width: 1 } },
      hoverinfo: "skip",
    });
  }

  return traces;
}
