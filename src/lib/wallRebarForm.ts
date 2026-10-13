import type { WallItem } from "../types/rebar";

// Wall rebar form state + payload conversion, shared by the wall board
// (WallBoard) and extracted verbatim from the old WallForm so there is one
// canonical REBW shape. A wall's REBW payload is multi-segment
// (ITEMS: WallItem[], one per SUB_WALL_ID / story range); this converts a
// single segment to/from the flat editable form.

export interface WallFormState {
  createSub: boolean;
  subId: string;
  storyFrom: string;
  storyTo: string;
  vName: string;
  vDist: string;
  hName: string;
  hDist: string;
  useEnd: boolean;
  endName: string;
  endNum: string;
  endDist: string;
  beName: string;
  beDist: string;
  beLen: string;
  dw: string;
  de: string;
  useModelThk: boolean;
  thickness: string;
}

export const EMPTY_WALL_FORM: WallFormState = {
  createSub: false,
  subId: "",
  storyFrom: "",
  storyTo: "",
  vName: "",
  vDist: "",
  hName: "",
  hDist: "",
  useEnd: false,
  endName: "",
  endNum: "",
  endDist: "",
  beName: "",
  beDist: "",
  beLen: "",
  dw: "",
  de: "",
  useModelThk: true,
  thickness: "",
};

function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export const DEFAULT_WALL_COVER_MM = "40";

// A placeholder segment for a wall with no REBW record yet (doListWall's {}).
export function isBareWallItem(it: WallItem): boolean {
  return Object.keys(it).length === 0;
}

// Pre-save check: REBW items REQUIRE CONCRETE_FACE_TO_CENTER_OF_REBAR {DW, DE}
// — without it Gen NX answers HTTP 200 {"error":"Wrong Field"}.
export type WallItemIssue = "wallCover";
export function wallItemIssue(item: WallItem): WallItemIssue | null {
  const cc = item.CONCRETE_FACE_TO_CENTER_OF_REBAR;
  const ok = (v: number | undefined) => v != null && Number.isFinite(v) && v > 0;
  return cc && ok(cc.DW) && ok(cc.DE) ? null : "wallCover";
}

export function buildWallItem(form: WallFormState): WallItem {
  const item: WallItem = {
    CREATE_SUB_WALL_ID: form.createSub,
    VERTICAL_REBAR: { NAME: form.vName, DIST: num(form.vDist) },
    HORIZONTAL_REBAR: { NAME: form.hName, DIST: num(form.hDist) },
    USE_END_REBAR: form.useEnd,
    CONCRETE_FACE_TO_CENTER_OF_REBAR: { DW: num(form.dw), DE: num(form.de) },
    USE_MODEL_THICKNESS: form.useModelThk,
  };
  if (item.CREATE_SUB_WALL_ID) {
    item.SUB_WALL_ID = num(form.subId);
    item.STORY = { FROM: form.storyFrom, TO: form.storyTo };
  }
  if (item.USE_END_REBAR) {
    item.END_REBAR = { NAME: form.endName, NUM: num(form.endNum), DIST: num(form.endDist) };
  }
  if (form.beName) item.BE_HORIZONTAL_REBAR = { NAME: form.beName, DIST: num(form.beDist) };
  const beLen = num(form.beLen);
  if (beLen !== undefined) item.BOUNDARY_ELEMENT_LENGTH = beLen;
  if (!item.USE_MODEL_THICKNESS) item.THICKNESS = num(form.thickness);
  return item;
}

export function segmentLabel(item: WallItem, index: number): string {
  const parts = [`#${index + 1}`];
  if (item.SUB_WALL_ID !== undefined) parts.push(`ID ${item.SUB_WALL_ID}`);
  const from = item.STORY?.FROM;
  const to = item.STORY?.TO;
  if (from || to) parts.push(`${from || "?"}~${to || "?"}`);
  return parts.join(" · ");
}

export function fillWallForm(it: WallItem): WallFormState {
  const vr = it.VERTICAL_REBAR || {};
  const hr = it.HORIZONTAL_REBAR || {};
  const er = it.END_REBAR || {};
  const be = it.BE_HORIZONTAL_REBAR || {};
  const cc = it.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
  return {
    createSub: !!it.CREATE_SUB_WALL_ID,
    subId: toStr(it.SUB_WALL_ID),
    storyFrom: toStr((it.STORY || {}).FROM),
    storyTo: toStr((it.STORY || {}).TO),
    vName: toStr(vr.NAME),
    vDist: toStr(vr.DIST),
    hName: toStr(hr.NAME),
    hDist: toStr(hr.DIST),
    useEnd: !!it.USE_END_REBAR,
    endName: toStr(er.NAME),
    endNum: toStr(er.NUM),
    endDist: toStr(er.DIST),
    beName: toStr(be.NAME),
    beDist: toStr(be.DIST),
    beLen: toStr(it.BOUNDARY_ELEMENT_LENGTH),
    // REBW requires the cover pair; only a BARE segment (empty item, no record
    // yet) gets 40 mm so its first save isn't rejected with "Wrong Field" (live
    // 2026-10-13). A stored item without covers stays blank and wallItemIssue
    // blocks the save. WallBoard seeds bare rows with this same form so the
    // shown values and the saved/validated item never disagree.
    dw: cc.DW != null ? toStr(cc.DW) : isBareWallItem(it) ? DEFAULT_WALL_COVER_MM : "",
    de: cc.DE != null ? toStr(cc.DE) : isBareWallItem(it) ? DEFAULT_WALL_COVER_MM : "",
    useModelThk: it.USE_MODEL_THICKNESS !== false,
    thickness: toStr(it.THICKNESS),
  };
}
