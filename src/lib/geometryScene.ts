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
