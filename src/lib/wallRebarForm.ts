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
    dw: toStr(cc.DW),
    de: toStr(cc.DE),
    useModelThk: it.USE_MODEL_THICKNESS !== false,
    thickness: toStr(it.THICKNESS),
  };
}
