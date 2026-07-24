import type { ColumnLikeItem, ColumnLikePayload } from "../types/rebar";

// Column/brace rebar form state + payload conversion, used by ColumnLikeBoard
// for both the COLUMN and BRACE tabs (REBC/REBR share this shape). Kept in one
// place so the two tabs can't drift, and extracted originally from the old
// single-record column/brace form.

export interface FormState {
  mainName: string;
  mainNum: string;
  mainRow: string;
  useCorner: boolean;
  cornerName: string;
  endName: string;
  endLegY: string;
  endLegZ: string;
  endDist: string;
  cenName: string;
  cenLegY: string;
  cenLegZ: string;
  cenDist: string;
  doVal: string;
  hoopType: string;
  hookType: string;
}

export const EMPTY_COLUMN_FORM: FormState = {
  mainName: "",
  mainNum: "",
  mainRow: "",
  useCorner: false,
  cornerName: "",
  endName: "",
  endLegY: "",
  endLegZ: "",
  endDist: "",
  cenName: "",
  cenLegY: "",
  cenLegZ: "",
  cenDist: "",
  doVal: "",
  hoopType: "Ties",
  hookType: "0",
};

function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export function buildColumnPayload(form: FormState, isColumn: boolean): ColumnLikePayload {
  const item: ColumnLikeItem = {
    MAIN_BAR: { NAME: form.mainName, NUM: num(form.mainNum), ROW: num(form.mainRow) },
    SHEAR_BAR_END: { NAME: form.endName, LEG_Y: num(form.endLegY), LEG_Z: num(form.endLegZ), DIST: num(form.endDist) },
    SHEAR_BAR_CEN: { NAME: form.cenName, LEG_Y: num(form.cenLegY), LEG_Z: num(form.cenLegZ), DIST: num(form.cenDist) },
    DO: num(form.doVal),
    HOOP_TYPE: form.hoopType,
  };
  if (isColumn) {
    item.MAIN_BAR!.USE_CORNER = form.useCorner;
    if (form.useCorner) item.MAIN_BAR!.NAME_CORNER = form.cornerName;
    item.HOOK_TYPE = Number(form.hookType);
  }
  return { ITEMS: [item] };
}

// `fallbackHoopType` preserves whatever was already showing when the API
// response omits HOOP_TYPE, instead of silently resetting it — matching the
// original app's `if (it.HOOP_TYPE) setV(...)` (only overwrite when present).
export function fillColumnForm(payload: ColumnLikePayload, isColumn: boolean, fallbackHoopType: string): FormState {
  const it: ColumnLikeItem = payload.ITEMS?.[0] || {};
  const mb = it.MAIN_BAR || {};
  const se = it.SHEAR_BAR_END || {};
  const sc = it.SHEAR_BAR_CEN || {};
  return {
    mainName: toStr(mb.NAME),
    mainNum: toStr(mb.NUM),
    mainRow: toStr(mb.ROW),
    useCorner: isColumn ? !!mb.USE_CORNER : false,
    cornerName: toStr(mb.NAME_CORNER),
    endName: toStr(se.NAME),
    endLegY: toStr(se.LEG_Y),
    endLegZ: toStr(se.LEG_Z),
    endDist: toStr(se.DIST),
    cenName: toStr(sc.NAME),
    cenLegY: toStr(sc.LEG_Y),
    cenLegZ: toStr(sc.LEG_Z),
    cenDist: toStr(sc.DIST),
    doVal: toStr(it.DO),
    hoopType: it.HOOP_TYPE || fallbackHoopType,
    hookType: isColumn ? toStr(it.HOOK_TYPE ?? 0) : "0",
  };
}
