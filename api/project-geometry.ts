import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

const EPS = 1e-6;

// SHAPE "SB" (solid rectangle) stores vSIZE = [H, B, ...] in the MODEL's length
// unit (same as node coords here — do NOT convert to mm; the 3D scene is drawn
// in model units). Only SB gives reliable [H,B]; other shapes are left without
// dims so the frame member falls back to a line instead of a wrong-sized box.
function sectWH(sect: any): { w?: number; h?: number } {
  const before = sect?.SECT_BEFORE;
  const vSize = before?.SECT_I?.vSIZE;
  if (before?.SHAPE !== "SB" || !Array.isArray(vSize)) return {};
  const h = Number(vSize[0]);
  const w = Number(vSize[1]);
  return { w: w > 0 ? w : undefined, h: h > 0 ? h : undefined };
}

// Best-effort plate thickness from /db/THIK (field names not live-verified —
// the 3D solid view degrades to a flat panel when it can't be resolved).
function thikValue(entry: any): number | undefined {
  if (!entry) return undefined;
  for (const k of ["THICK", "T", "iTHICK", "VALUE", "THICKNESS"]) {
    const v = Number(entry?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  // Some THIK entries nest the value under SUB / bIN etc.; scan one level.
  for (const val of Object.values(entry)) {
    if (val && typeof val === "object") {
      for (const k of ["THICK", "T", "iTHICK", "VALUE", "THICKNESS"]) {
        const v = Number((val as any)?.[k]);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  }
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const [nodeRes, elemRes, consRes, sectRes, thikRes] = await Promise.all([
      getJson(base, "/db/NODE", apiKey),
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/CONS", apiKey),
      getJson(base, "/db/SECT", apiKey),
      getJson(base, "/db/THIK", apiKey),
    ]);

    const nodeItems: Record<string, any> = nodeRes.NODE || {};
    const elemItems: Record<string, any> = elemRes.ELEM || {};
    const consItems: Record<string, any> = consRes.CONS || {};
    const sectItems: Record<string, any> = sectRes.SECT || {};
    const thikItems: Record<string, any> = thikRes.THIK || {};

    const nodes = Object.entries(nodeItems).map(([id, v]: [string, any]) => ({
      id,
      x: Number(v?.X) || 0,
      y: Number(v?.Y) || 0,
      z: Number(v?.Z) || 0,
    }));
    const coordById = new Map(nodes.map((n) => [n.id, n]));

    // section id -> {w,h} in model units, once
    const dimsBySect = new Map<string, { w?: number; h?: number }>();
    for (const [sid, s] of Object.entries(sectItems)) dimsBySect.set(sid, sectWH(s));

    interface FrameMember { a: string; b: string; w?: number; h?: number; angle?: number }
    const cols: FrameMember[] = [];
    const beams: FrameMember[] = [];
    const braces: FrameMember[] = [];
    const walls: { nodes: string[]; thickness?: number }[] = [];

    for (const v of Object.values<any>(elemItems)) {
      const nodeIds: string[] = (v?.NODE || []).map((n: number) => String(n));
      // Real "Wall" elements (TYPE:"WALL") are one option, but models commonly
      // represent walls as generic shell elements (TYPE:"PLATE"). Both render
      // as panels; extruded by thickness when it can be resolved.
      if ((v?.TYPE === "WALL" || v?.TYPE === "PLATE") && nodeIds.length >= 3) {
        const thickness = thikValue(v?.THIK != null ? thikItems[String(v.THIK)] : undefined);
        walls.push(thickness != null ? { nodes: nodeIds, thickness } : { nodes: nodeIds });
        continue;
      }
      if (nodeIds.length < 2) continue;
      const A = coordById.get(nodeIds[0]);
      const B = coordById.get(nodeIds[1]);
      if (!A || !B) continue;
      const dims = v?.SECT != null ? dimsBySect.get(String(v.SECT)) : undefined;
      const angle = Number(v?.ANGLE);
      const m: FrameMember = { a: nodeIds[0], b: nodeIds[1] };
      if (dims?.w) m.w = dims.w;
      if (dims?.h) m.h = dims.h;
      if (Number.isFinite(angle) && angle !== 0) m.angle = angle;

      const sameZ = Math.abs(A.z - B.z) < EPS;
      const sameXY = Math.abs(A.x - B.x) < EPS && Math.abs(A.y - B.y) < EPS;
      if (sameZ) beams.push(m);
      else if (sameXY) cols.push(m);
      else braces.push(m);
    }

    return res.json({
      ok: true,
      data: { nodes, cols, beams, braces, walls, baseNodes: Object.keys(consItems) },
    });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
