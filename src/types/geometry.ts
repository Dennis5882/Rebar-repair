// Raw geometry for the 3D model view, built server-side from /db/NODE,
// /db/ELEM, and /db/CONS. Frame elements (TYPE "BEAM" in the Gen NX schema —
// covers beams, columns, and braces alike) are re-classified here by
// comparing endpoint coordinates, since the API itself doesn't distinguish
// them: same Z = beam, same X/Y = column, otherwise = brace.

export interface GeoNode {
  id: string;
  x: number;
  y: number;
  z: number;
}

export type MemberPair = [string, string];

// A frame member (column/beam/brace): its two end-node ids plus, when the
// section is a solid rectangle (SB), its width/height in MODEL units and an
// optional local rotation angle (deg). Members without w/h render as a line
// instead of an extruded box.
export interface FrameMember {
  a: string;
  b: string;
  w?: number;
  h?: number;
  angle?: number;
}

export interface WallPanel {
  nodes: string[];
  // Plate thickness in model units; extruded into a slab when present,
  // otherwise drawn as a flat panel.
  thickness?: number;
}

export interface ModelGeometry {
  nodes: GeoNode[];
  cols: FrameMember[];
  beams: FrameMember[];
  braces: FrameMember[];
  walls: WallPanel[];
  baseNodes: string[];
}
