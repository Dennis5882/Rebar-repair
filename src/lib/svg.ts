import type { TFn } from "../i18n/types";
import type {
  BeamItem,
  BeamPayload,
  BeamSector,
  ColumnLikeItem,
  ColumnLikePayload,
  ItemsPayload,
  MemberPayload,
  MemberType,
  SectorKey,
  WallItem,
  WallPayload,
} from "../types/rebar";

export interface SectionDims {
  B?: string | number;
  H?: string | number;
  THICKNESS?: string | number;
  LENGTH?: string | number;
}

function firstItem<T>(payload: ItemsPayload<T> | null | undefined): Partial<T> {
  if (!payload || !payload.ITEMS || !payload.ITEMS[0]) return {};
  return payload.ITEMS[0];
}

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function nf(v: unknown): string {
  if (v === undefined || v === null || v === "") return "-";
  return String(v);
}

function perimeterPoints(count: number, w: number, h: number): [number, number][] {
  if (count <= 0) return [];
  const perim = 2 * (w + h);
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const d = (perim * i) / count;
    let x: number, y: number;
    if (d < w) {
      x = -w / 2 + d;
      y = -h / 2;
    } else if (d < w + h) {
      x = w / 2;
      y = -h / 2 + (d - w);
    } else if (d < 2 * w + h) {
      x = w / 2 - (d - w - h);
      y = h / 2;
    } else {
      x = -w / 2;
      y = h / 2 - (d - 2 * w - h);
    }
    pts.push([x, y]);
  }
  return pts;
}

const BEAM_SECTOR_FIELD: Record<SectorKey, "BAR_SECTOR_I" | "BAR_SECTOR_M" | "BAR_SECTOR_J"> = {
  I: "BAR_SECTOR_I",
  M: "BAR_SECTOR_M",
  J: "BAR_SECTOR_J",
};

function drawBeamSvg(
  t: TFn,
  payload: BeamPayload | null | undefined,
  dims: SectionDims,
  aria: string,
  sectorKey: SectorKey = "M"
): string {
  const B = Number(dims.B) || 300;
  const H = Number(dims.H) || 600;
  const it: Partial<BeamItem> = firstItem(payload);
  const sector: BeamSector = it[BEAM_SECTOR_FIELD[sectorKey]] || {};
  const dt = it.DT || 40;
  const db = it.DB || 40;
  const topLayers = Object.values(sector.MAIN_BAR_TOP || {});
  const botLayers = Object.values(sector.MAIN_BAR_BOT || {});
  const shear = sector.SHEAR_BAR || {};

  const canvas = 240,
    pad = 26;
  const scale = (canvas - 2 * pad) / Math.max(B, H, 1);
  const w = B * scale,
    h = H * scale;
  const x0 = (canvas - w) / 2,
    y0 = (canvas - h) / 2;

  let s = `<svg viewBox="0 0 ${canvas} ${canvas}" class="sec-svg" role="img" aria-label="${esc(aria)}">`;
  s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

  const inset = Math.min(dt, db, 60) * scale;
  const hw = w - 2 * inset,
    hh = h - 2 * inset;
  if (hw > 4 && hh > 4) {
    s += `<rect x="${(x0 + inset).toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" class="hoop"/>`;
  }

  const radius = 4.2;
  const emitDots = (layers: { NAME?: string; NUM?: number }[], fromTop: boolean) => {
    layers.forEach((layer, li) => {
      const cnt = layer.NUM || 0;
      if (cnt <= 0) return;
      const margin = (fromTop ? dt : db) * scale + radius;
      const yy = fromTop ? y0 + margin + li * 10 : y0 + h - margin - li * 10;
      let xs: number[];
      if (cnt === 1) {
        xs = [x0 + w / 2];
      } else {
        const edge = dt * scale + radius;
        xs = Array.from({ length: cnt }, (_, i) => x0 + edge + ((w - 2 * edge) * i) / (cnt - 1));
      }
      for (const xx of xs) s += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${radius}" class="mainbar"/>`;
    });
  };
  emitDots(topLayers, true);
  emitDots(botLayers, false);

  const caption = t("js.svgBeamCaption", { B: nf(B), H: nf(H), name: nf(shear.NAME), dist: nf(shear.DIST) });
  s += `<text x="${canvas / 2}" y="${canvas - 6}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
  s += "</svg>";
  return s;
}

function drawColumnOrBraceSvg(
  t: TFn,
  payload: ColumnLikePayload | null | undefined,
  dims: SectionDims,
  aria: string,
  isBrace: boolean
): string {
  const B = Number(dims.B) || 500;
  const H = Number(dims.H) || 500;
  const it: Partial<ColumnLikeItem> = firstItem(payload);
  const mb = it.MAIN_BAR || {};
  const se = it.SHEAR_BAR_END || {};
  const doVal = it.DO || 40;

  const canvas = 240,
    pad = 26;
  const scale = (canvas - 2 * pad) / Math.max(B, H, 1);
  const w = B * scale,
    h = H * scale;
  const x0 = (canvas - w) / 2,
    y0 = (canvas - h) / 2;
  const cx = canvas / 2,
    cy = canvas / 2;

  let s = `<svg viewBox="0 0 ${canvas} ${canvas}" class="sec-svg" role="img" aria-label="${esc(aria)}">`;
  s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

  const inset = Math.min(doVal, 60) * scale;
  const hw = w - 2 * inset,
    hh = h - 2 * inset;
  if (hw > 4 && hh > 4) {
    s += `<rect x="${(x0 + inset).toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" class="hoop"/>`;
  }

  const radius = 4.2;
  const bw = Math.max(hw - 2 * radius, 0),
    bh = Math.max(hh - 2 * radius, 0);
  const total = mb.NUM || 0;
  const useCorner = !!mb.USE_CORNER && !isBrace;

  let pts: [number, number][];
  if (useCorner) {
    const corners: [number, number][] = [
      [-bw / 2, -bh / 2],
      [bw / 2, -bh / 2],
      [bw / 2, bh / 2],
      [-bw / 2, bh / 2],
    ];
    for (const [px, py] of corners) {
      s += `<circle cx="${(cx + px).toFixed(1)}" cy="${(cy + py).toFixed(1)}" r="${radius + 1.2}" class="cornerbar"/>`;
    }
    pts = perimeterPoints(Math.max(total - 4, 0), bw, bh);
  } else {
    pts = perimeterPoints(total, bw, bh);
  }
  for (const [px, py] of pts) {
    s += `<circle cx="${(cx + px).toFixed(1)}" cy="${(cy + py).toFixed(1)}" r="${radius}" class="mainbar"/>`;
  }

  const kind = isBrace ? t("js.kindBrace") : t("js.kindColumn");
  const caption = t("js.svgColumnCaption", {
    kind,
    B: nf(B),
    H: nf(H),
    name: nf(se.NAME),
    legY: nf(se.LEG_Y),
    legZ: nf(se.LEG_Z),
    dist: nf(se.DIST),
  });
  s += `<text x="${cx}" y="${canvas - 6}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
  s += "</svg>";
  return s;
}

function drawWallSvg(t: TFn, payload: WallPayload | null | undefined, dims: SectionDims, aria: string): string {
  const thickness = Number(dims.THICKNESS) || 300;
  const length = Number(dims.LENGTH) || 3000;
  const it: Partial<WallItem> = firstItem(payload);
  const vr = it.VERTICAL_REBAR || {};
  const hr = it.HORIZONTAL_REBAR || {};
  const er = it.END_REBAR || {};
  const beLen = it.BOUNDARY_ELEMENT_LENGTH || 0;
  const cc = it.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
  const dw = cc.DW || 40;

  const canvasW = 420,
    canvasH = 150,
    pad = 22;
  const dispLen = Math.min(length, 4000);
  const scale = (canvasW - 2 * pad) / (dispLen || 1);
  const w = dispLen * scale,
    h = thickness * scale;
  const x0 = (canvasW - w) / 2,
    y0 = (canvasH - h) / 2;

  let s = `<svg viewBox="0 0 ${canvasW} ${canvasH}" class="sec-svg wall-svg" role="img" aria-label="${esc(aria)}">`;
  s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

  if (beLen > 0) {
    const beW = Math.min(beLen, dispLen / 2) * scale;
    s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${beW.toFixed(1)}" height="${h.toFixed(1)}" class="be-zone"/>`;
    s += `<rect x="${(x0 + w - beW).toFixed(1)}" y="${y0.toFixed(1)}" width="${beW.toFixed(1)}" height="${h.toFixed(1)}" class="be-zone"/>`;
  }

  const dwpx = h > 4 ? Math.min(dw * scale, h / 2 - 2) : 0;
  s += `<line x1="${x0.toFixed(1)}" y1="${(y0 + dwpx).toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${(y0 + dwpx).toFixed(1)}" class="hoop-line"/>`;
  s += `<line x1="${x0.toFixed(1)}" y1="${(y0 + h - dwpx).toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${(y0 + h - dwpx).toFixed(1)}" class="hoop-line"/>`;

  const dist = vr.DIST || 200;
  const count = Math.min(dist ? Math.floor(w / (dist * scale)) : 0, 18);
  const radius = 3.2;
  if (count > 0) {
    for (let i = 0; i <= count; i++) {
      const xx = x0 + (w * i) / count;
      for (const yy of [y0 + dwpx, y0 + h - dwpx]) {
        s += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${radius}" class="mainbar"/>`;
      }
    }
  }

  if (it.USE_END_REBAR) {
    const endCount = Math.min(er.NUM || 0, 4);
    for (const side of [0, 1]) {
      const ex = side === 0 ? x0 + 7 : x0 + w - 7;
      for (let k = 0; k < endCount; k++) {
        const offset = (k - (endCount - 1) / 2) * 7;
        s += `<circle cx="${ex.toFixed(1)}" cy="${(y0 + h / 2 + offset).toFixed(1)}" r="3.6" class="endbar"/>`;
      }
    }
  }

  let caption = t("js.svgWallCaption", {
    thickness: nf(thickness),
    vname: nf(vr.NAME),
    vdist: nf(vr.DIST),
    hname: nf(hr.NAME),
    hdist: nf(hr.DIST),
  });
  if (length > dispLen) caption += t("js.svgWallPartial");
  s += `<text x="${canvasW / 2}" y="${canvasH - 4}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
  s += "</svg>";
  return s;
}

export function drawSectionSvg(
  t: TFn,
  type: MemberType,
  payload: MemberPayload | null | undefined,
  dims: SectionDims,
  aria: string,
  sectorKey?: SectorKey
): string {
  if (!payload) return `<div class="sec-empty">${esc(t("js.noData"))}</div>`;
  if (type === "BEAM") return drawBeamSvg(t, payload as BeamPayload, dims, aria, sectorKey);
  if (type === "COLUMN") return drawColumnOrBraceSvg(t, payload as ColumnLikePayload, dims, aria, false);
  if (type === "BRACE") return drawColumnOrBraceSvg(t, payload as ColumnLikePayload, dims, aria, true);
  if (type === "WALL") return drawWallSvg(t, payload as WallPayload, dims, aria);
  return '<div class="sec-empty">-</div>';
}
