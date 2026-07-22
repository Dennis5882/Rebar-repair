// Read-only project overview: element/section/material/load-combination
// counts from the currently open Gen NX model. Endpoints confirmed live
// (see MIDAS-API-NX-SDK/docs/live_verification_notes.md): /db/ELEM, /db/SECT,
// /db/MATL round-tripped byte-for-byte; /db/LCOM-GEN passed the blank-model
// GET smoke test. WALL-type /db/ELEM rows specifically were not separately
// round-tripped (only BEAM-type was), so treat wall counts as "very likely
// correct" rather than independently proven.

export interface ElementSummary {
  total: number;
  byType: Record<string, number>;
}

export interface NamedItem {
  id: string;
  name: string;
  type: string;
}

export interface ListSummary {
  total: number;
  items: NamedItem[];
}

export interface LoadCombinationItem {
  id: string;
  name: string;
  active: string;
}

export interface LoadCombinationSummary {
  total: number;
  items: LoadCombinationItem[];
}

// /db/CONS (Constraint Support) — node boundary conditions. CONSTRAINT is a
// 7-char string [DX,DY,DZ,RX,RY,RZ,RW], "1"=restrained, "0"=free. Confirmed
// live 2026-07-22 as part of the MATL/SECT/NODE/ELEM/CONS round-trip test.
export interface ConstraintItem {
  nodeId: string;
  groupName: string;
  constraint: string;
}

export interface ConstraintSummary {
  total: number;
  items: ConstraintItem[];
}

export interface ProjectSummary {
  elements: ElementSummary;
  sections: ListSummary;
  materials: ListSummary;
  loadCombinations: LoadCombinationSummary;
  constraints: ConstraintSummary;
}
