import type { GeoNode, ModelGeometry, WallPanel } from "../types/geometry";

// Three.js is Y-up; the model (MIDAS convention, same as the old Plotly
// axes) is Z-up. Remap once here so every consumer (lines, walls, points)
// stays consistent, instead of fighting OrbitControls' default up vector.
export function toScene(n: GeoNode): [number, number, number] {
  return [n.x, n.z, n.y];
}

export function nodeIndex(geo: ModelGeometry): Map<string, GeoNode> {
  return new Map(geo.nodes.map((n) => [n.id, n]));
}

export function supportNodes(geo: ModelGeometry): GeoNode[] {
  const baseSet = new Set(geo.baseNodes);
  return geo.nodes.filter((n) => baseSet.has(n.id));
}

export function nodePositions(nodes: GeoNode[]): Float32Array {
  const arr = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    const [x, y, z] = toScene(n);
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  });
  return arr;
}

export interface WallGeometryData {
  positions: Float32Array;
  indices: number[];
}

// Each wall panel's node list is padded to 8 slots by the API (quad
// elements only ever use up to 4 real corners); resolving against `byId`
// naturally drops the zero-padding since no real node has id "0".
export function buildWallGeometry(byId: Map<string, GeoNode>, walls: WallPanel[]): WallGeometryData | null {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const w of walls) {
    const ns = w.nodes.map((id) => byId.get(id)).filter((n): n is GeoNode => !!n);
    if (ns.length < 3) continue;
    const corners = ns.slice(0, 4);
    for (const n of corners) positions.push(...toScene(n));
    if (corners.length >= 4) {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      indices.push(base, base + 1, base + 2);
    }
    base += corners.length;
  }
  if (!positions.length) return null;
  return { positions: new Float32Array(positions), indices };
}

// Extrude each thickness-carrying wall panel into a slab (two offset faces +
// sides), so walls read as volumes like Gen NX rather than paper-thin sheets.
// Plain-array vector math (no three.js dependency) — the component computes
// normals for lighting. Panels without a thickness are handled by
// buildWallGeometry (flat) instead.
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function buildWallSolidGeometry(byId: Map<string, GeoNode>, walls: WallPanel[]): WallGeometryData | null {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const w of walls) {
    if (w.thickness == null || w.thickness <= 0) continue;
    const ns = w.nodes.map((id) => byId.get(id)).filter((n): n is GeoNode => !!n).slice(0, 4);
    if (ns.length < 3) continue;
    const c: V3[] = ns.map((n) => toScene(n));
    const normal = norm(cross(sub(c[1], c[0]), sub(c[2], c[0])));
    const half = w.thickness / 2;
    const off: V3 = [normal[0] * half, normal[1] * half, normal[2] * half];
    const m = c.length; // 3 or 4
    // top ring then bottom ring
    for (const p of c) positions.push(p[0] + off[0], p[1] + off[1], p[2] + off[2]);
    for (const p of c) positions.push(p[0] - off[0], p[1] - off[1], p[2] - off[2]);
    const top = (i: number) => base + i;
    const bot = (i: number) => base + m + i;
    // top + bottom faces (fan)
    for (let i = 1; i < m - 1; i++) {
      indices.push(top(0), top(i), top(i + 1));
      indices.push(bot(0), bot(i + 1), bot(i));
    }
    // sides
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      indices.push(top(i), top(j), bot(j), top(i), bot(j), bot(i));
    }
    base += m * 2;
  }
  if (!positions.length) return null;
  return { positions: new Float32Array(positions), indices };
}
