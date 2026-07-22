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

export interface WallPanel {
  nodes: string[];
}

export interface ModelGeometry {
  nodes: GeoNode[];
  cols: MemberPair[];
  beams: MemberPair[];
  braces: MemberPair[];
  walls: WallPanel[];
  baseNodes: string[];
}
