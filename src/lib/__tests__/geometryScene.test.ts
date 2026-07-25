import { describe, it, expect } from "vitest";
import { buildWallSolidGeometry } from "../geometryScene";
import type { GeoNode, WallPanel } from "../../types/geometry";

function idx(nodes: GeoNode[]): Map<string, GeoNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

// A unit square in the model XY plane (z = 0).
const SQUARE: GeoNode[] = [
  { id: "1", x: 0, y: 0, z: 0 },
  { id: "2", x: 1, y: 0, z: 0 },
  { id: "3", x: 1, y: 1, z: 0 },
  { id: "4", x: 0, y: 1, z: 0 },
];

describe("buildWallSolidGeometry", () => {
  it("extrudes a quad panel into a closed slab (8 verts, 12 triangles)", () => {
    const panel: WallPanel = { nodes: ["1", "2", "3", "4"], thickness: 10 };
    const data = buildWallSolidGeometry(idx(SQUARE), [panel])!;
    expect(data).not.toBeNull();
    expect(data.positions.length).toBe(24); // 8 vertices * 3
    expect(data.indices.length).toBe(36); // 12 triangles * 3
  });

  it("offsets the two faces by ±thickness/2 along the panel normal", () => {
    // Square lies in scene XZ (model XY -> scene [x, z, y]), so its normal is
    // the scene Y axis; the two rings should sit at y = +5 and y = -5.
    const data = buildWallSolidGeometry(idx(SQUARE), [{ nodes: ["1", "2", "3", "4"], thickness: 10 }])!;
    const ys: number[] = [];
    for (let i = 1; i < data.positions.length; i += 3) ys.push(data.positions[i]);
    expect(Math.max(...ys)).toBeCloseTo(5, 6);
    expect(Math.min(...ys)).toBeCloseTo(-5, 6);
  });

  it("skips panels with no (or non-positive) thickness", () => {
    expect(buildWallSolidGeometry(idx(SQUARE), [{ nodes: ["1", "2", "3", "4"] }])).toBeNull();
    expect(buildWallSolidGeometry(idx(SQUARE), [{ nodes: ["1", "2", "3", "4"], thickness: 0 }])).toBeNull();
  });

  it("returns null when a panel has fewer than 3 resolvable nodes", () => {
    expect(buildWallSolidGeometry(idx(SQUARE), [{ nodes: ["1", "2"], thickness: 10 }])).toBeNull();
  });
});
