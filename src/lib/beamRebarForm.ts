import type { BeamItem, BeamPayload, BeamSector, RebarLayer, SectorKey } from "../types/rebar";
import { SECTORS } from "../types/rebar";

// Shared by BeamForm.tsx (one element at a time) and BeamRebarTable.tsx
// (many elements as a spreadsheet) — both edit the same BeamPayload shape
// via the same plain-string form fields, so the read<->form<->write
// conversions live here once instead of being duplicated per view.

export interface SectorFormValues {
  topName: string;
  topNum: string;
  botName: string;
  botNum: string;
  shearName: string;
  shearLeg: string;
  shearDist: string;
  skinName: string;
  skinNum: string;
}

const EMPTY_SECTOR: SectorFormValues = {
  topName: "",
  topNum: "",
  botName: "",
  botNum: "",
  shearName: "",
  shearLeg: "",
  shearDist: "",
  skinName: "",
  skinNum: "",
};

export function emptySectors(): Record<SectorKey, SectorFormValues> {
  return { I: { ...EMPTY_SECTOR }, M: { ...EMPTY_SECTOR }, J: { ...EMPTY_SECTOR } };
}

// Practitioners rarely give I/M/J fully independent rebar (that's reserved
// for cases needing real attention) — for constructability, most beams use
// either one value for the whole span ("All Section") or one value at both
// ends with a separate one at the center ("Both End & Center", since I and
// J are normally symmetric). Detecting which of the three shapes a loaded
// record actually is lets the form default to the simpler input mode
// instead of always showing all three blocks like Gen NX's own "Each End &
// Center" — its least-used option — every time.
export type BeamInputMode = "all" | "endCenter" | "each";

export function sectorsEqual(a: SectorFormValues, b: SectorFormValues): boolean {
  return (
    a.topName === b.topName &&
    a.topNum === b.topNum &&
    a.botName === b.botName &&
    a.botNum === b.botNum &&
    a.shearName === b.shearName &&
    a.shearLeg === b.shearLeg &&
    a.shearDist === b.shearDist &&
    a.skinName === b.skinName &&
    a.skinNum === b.skinNum
  );
}

export function detectInputMode(sectors: Record<SectorKey, SectorFormValues>): BeamInputMode {
  if (sectorsEqual(sectors.I, sectors.M) && sectorsEqual(sectors.M, sectors.J)) return "all";
  if (sectorsEqual(sectors.I, sectors.J)) return "endCenter";
  return "each";
}

export function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
export function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}
function firstLayer(obj?: Record<string, RebarLayer>): RebarLayer {
  if (!obj) return {};
  const keys = Object.keys(obj);
  return keys.length ? obj[keys[0]] : {};
}

// A count of exactly 0 is a valid, meaningful value (e.g. "no top bars at
// this station") — checking `topNum` for truthiness would treat it the same
// as "not entered" and silently drop the field, since 0 is falsy in JS.
function isRealCount(n: number | undefined): n is number {
  return n !== undefined && !Number.isNaN(n);
}

export function buildBeamSector(vals: SectorFormValues): BeamSector {
  const sector: BeamSector = {};
  const topNum = num(vals.topNum);
  if (vals.topName && isRealCount(topNum)) sector.MAIN_BAR_TOP = { LAYER1: { NAME: vals.topName, NUM: topNum } };
  const botNum = num(vals.botNum);
  if (vals.botName && isRealCount(botNum)) sector.MAIN_BAR_BOT = { LAYER1: { NAME: vals.botName, NUM: botNum } };
  if (vals.shearName) sector.SHEAR_BAR = { NAME: vals.shearName, LEG: num(vals.shearLeg), DIST: num(vals.shearDist) };
  if (vals.skinName) {
    sector.SKIN_BAR_NAME = vals.skinName;
    sector.SKIN_BAR_NUM = num(vals.skinNum);
  }
  return sector;
}

export function buildBeamPayload(sectors: Record<SectorKey, SectorFormValues>, dt: string, db: string): BeamPayload {
  return {
    ITEMS: [
      {
        BAR_SECTOR_I: buildBeamSector(sectors.I),
        BAR_SECTOR_M: buildBeamSector(sectors.M),
        BAR_SECTOR_J: buildBeamSector(sectors.J),
        DT: num(dt),
        DB: num(db),
      },
    ],
  };
}

export function fillFromPayload(payload: BeamPayload): { sectors: Record<SectorKey, SectorFormValues>; dt: string; db: string } {
  const it: Partial<BeamItem> = payload.ITEMS?.[0] || {};
  const sectors = emptySectors();
  for (const key of SECTORS) {
    const sector: BeamSector = it[`BAR_SECTOR_${key}`] || {};
    const top = firstLayer(sector.MAIN_BAR_TOP);
    const bot = firstLayer(sector.MAIN_BAR_BOT);
    const shear = sector.SHEAR_BAR || {};
    sectors[key] = {
      topName: toStr(top.NAME),
      topNum: toStr(top.NUM),
      botName: toStr(bot.NAME),
      botNum: toStr(bot.NUM),
      shearName: toStr(shear.NAME),
      shearLeg: toStr(shear.LEG),
      shearDist: toStr(shear.DIST),
      skinName: toStr(sector.SKIN_BAR_NAME),
      skinNum: toStr(sector.SKIN_BAR_NUM),
    };
  }
  return { sectors, dt: toStr(it.DT), db: toStr(it.DB) };
}

// NOTE: REBB is written back in the SAME canonical shape it is read in
// (MAIN_BAR_TOP:{LAYER1:{NAME,NUM}} object + item-level DT/DB), sent via PUT —
// live-verified 2026-07-24. The manual/SDK's `vMAIN_BAR_TOP`/`MAIN_BAR_DC_TOP`
// "legacy" write shape is silently dropped by the server for populated bars,
// so there is no read→write conversion: BeamBoard sends the BeamPayload from
// buildBeamPayload() directly. (The old toWritePayload/toWriteSector helpers
// were removed with the orphaned BeamForm/BeamRebarTable that used them.)
