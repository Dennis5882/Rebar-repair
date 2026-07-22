// Shapes verified live against a real Gen NX model (2026-07-22) unless noted.

export type MemberType = "BEAM" | "COLUMN" | "WALL" | "BRACE";
export type SectorKey = "I" | "M" | "J";
export const SECTORS: SectorKey[] = ["I", "M", "J"];

export interface ItemsPayload<T> {
  ITEMS: T[];
}

export interface RebarLayer {
  NAME?: string;
  NUM?: number;
}

export interface ShearBar {
  NAME?: string;
  LEG?: number;
  DIST?: number;
}

export interface BeamSector {
  // Keyed by layer: LAYER1, LAYER2, ... This UI only edits one layer.
  MAIN_BAR_TOP?: Record<string, RebarLayer>;
  MAIN_BAR_BOT?: Record<string, RebarLayer>;
  SHEAR_BAR?: ShearBar;
  // Unverified against live data (no tested beam had skin bars) — kept as
  // the pre-existing best guess.
  SKIN_BAR_NAME?: string;
  SKIN_BAR_NUM?: number;
}

export interface BeamItem {
  BAR_SECTOR_I?: BeamSector;
  BAR_SECTOR_M?: BeamSector;
  BAR_SECTOR_J?: BeamSector;
  DT?: number;
  DB?: number;
}
export type BeamPayload = ItemsPayload<BeamItem>;

// BEAM's write (POST/PUT) shape is NOT the same as what GET returns above.
// The official manual's own JSON Schema for REBB matches the GET shape
// (MAIN_BAR_TOP/BOT as LAYER1/LAYER2-keyed objects, DT/DB flat on the item —
// confirmed live 2026-07-22), but the manual's own worked Request/Response
// example — and the independently-authored midas-nx SDK, whose live write
// test against this exact endpoint succeeded — both use this older,
// differently-named shape instead, and the manual explicitly recommends
// following the example for anything actually sent to the server. Treat
// this as the confirmed-safe write shape until someone live-tests a PUT
// with the new-style field names to see if the server accepts those too.
export interface RcBeamMainBarLayerEntry {
  LAYER: 1 | 2;
  NAME: string;
  NUM: number;
}
export interface BeamWriteSector {
  vMAIN_BAR_TOP?: RcBeamMainBarLayerEntry[];
  vMAIN_BAR_BOT?: RcBeamMainBarLayerEntry[];
  SHEAR_BAR?: ShearBar;
  SKIN_BAR_NAME?: string;
  SKIN_BAR_NUM?: number;
}
export interface BeamWriteItem {
  BAR_SECTOR_I?: BeamWriteSector;
  BAR_SECTOR_M?: BeamWriteSector;
  BAR_SECTOR_J?: BeamWriteSector;
  MAIN_BAR_DC_TOP?: number;
  MAIN_BAR_DC_BOT?: number;
}
export type BeamWritePayload = ItemsPayload<BeamWriteItem>;

export interface MainBar {
  NAME?: string;
  NUM?: number;
  ROW?: number;
  USE_CORNER?: boolean;
  NAME_CORNER?: string;
}

export interface ShearBarLegs {
  NAME?: string;
  LEG_Y?: number;
  LEG_Z?: number;
  DIST?: number;
}

// Shared by COLUMN (REBC) and BRACE (REBR) — confirmed identical field names
// against both the official manual (REBR's own text: "구조는 기둥(REBC)과
// 유사하나 MAIN_BAR에 USE_CORNER가 없고 HOOK_TYPE도 없음", i.e. same shape
// minus USE_CORNER/NAME_CORNER/HOOK_TYPE) and the midas-nx SDK's
// independently-typed RcBraceMainBarSpec. COLUMN's shape (with corner bar
// and hook type) was additionally live-verified 2026-07-22; BRACE's was not
// (no brace rebar data existed in the tested model) but is now
// documentation-confirmed rather than a guess.
export interface ColumnLikeItem {
  MAIN_BAR?: MainBar;
  SHEAR_BAR_END?: ShearBarLegs;
  SHEAR_BAR_CEN?: ShearBarLegs;
  DO?: number;
  HOOP_TYPE?: string;
  HOOK_TYPE?: number;
}
export type ColumnLikePayload = ItemsPayload<ColumnLikeItem>;

export interface WallRebar {
  NAME?: string;
  DIST?: number;
}

export interface WallEndRebar {
  NAME?: string;
  NUM?: number;
  DIST?: number;
}

export interface WallCover {
  DW?: number;
  DE?: number;
}

export interface WallStory {
  FROM?: string;
  TO?: string;
}

export interface WallItem {
  CREATE_SUB_WALL_ID?: boolean;
  SUB_WALL_ID?: number;
  STORY?: WallStory;
  VERTICAL_REBAR?: WallRebar;
  HORIZONTAL_REBAR?: WallRebar;
  USE_END_REBAR?: boolean;
  END_REBAR?: WallEndRebar;
  BE_HORIZONTAL_REBAR?: WallRebar;
  BOUNDARY_ELEMENT_LENGTH?: number;
  CONCRETE_FACE_TO_CENTER_OF_REBAR?: WallCover;
  USE_MODEL_THICKNESS?: boolean;
  THICKNESS?: number;
}
export type WallPayload = ItemsPayload<WallItem>;

export type MemberPayload = BeamPayload | BeamWritePayload | ColumnLikePayload | WallPayload;
