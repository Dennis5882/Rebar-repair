import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// Lists EVERY section of a given member type in the model — not just those
// that already carry a rebar record — grouped by section, mirroring what
// Gen NX's own "Modify Rebar Data" dialog shows. This is the column/wall/
// brace analogue of api/beam-sections.ts; the BEAM board keeps its own
// dedicated endpoint (working, untouched), and this one generalizes the same
// idea to the other member types, dispatched on `memberType`.
//
// Only COLUMN is implemented today (the board rollout starts there); WALL and
// BRACE return a clean "unsupported" until their own classification is wired
// (walls are PLATE elements, braces need explicit member-type assignment —
// neither is orientation-classifiable the simple way columns are).
//
// How Gen NX decides a frame element is a column (verified live 2026-07-24,
// see genxn-api-schema-findings): /db/MBTP (member-type) is empty on a model
// where types were never explicitly assigned, so Gen NX auto-classifies frame
// elements by orientation — horizontal ⇒ beam, vertical ⇒ column. This does
// the same, keeping only vertical elements (the mirror of beam-sections).

const MM_PER_DIST: Record<string, number> = { MM: 1, CM: 10, M: 1000, IN: 25.4, FT: 304.8 };

interface SectDims {
  b?: number; // width, mm
  h?: number; // depth, mm
}

// SHAPE "SB" (solid rectangle) stores vSIZE = [H, B, ...]. Other shapes aren't
// reliably [H,B], so dims are left undefined (the UI falls back to an editable
// default) rather than reporting a wrong size.
function sectDims(sect: any, mmPer: number): SectDims {
  const before = sect?.SECT_BEFORE;
  const shape = before?.SHAPE;
  const vSize = before?.SECT_I?.vSIZE;
  if (shape !== "SB" || !Array.isArray(vSize)) return {};
  const h = Number(vSize[0]);
  const b = Number(vSize[1]);
  return {
    h: h > 0 ? h * mmPer : undefined,
    b: b > 0 ? b * mmPer : undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, memberType } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (memberType !== "COLUMN") {
    // WALL/BRACE not classifiable the same orientation way — wired later.
    return res.status(400).json({ ok: false, code: "unknown_member_type", memberType });
  }
  const rebarPath = ENDPOINTS.COLUMN; // REBC

  try {
    const [elemRes, nodeRes, sectRes, unitRes, rebcRes] = await Promise.all([
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/NODE", apiKey),
      getJson(base, "/db/SECT", apiKey),
      getJson(base, "/db/UNIT", apiKey),
      getJson(base, rebarPath, apiKey),
    ]);

    const elems: Record<string, any> = elemRes.ELEM || {};
    const nodes: Record<string, any> = nodeRes.NODE || {};
    const sects: Record<string, any> = sectRes.SECT || {};
    // /db/UNIT is ID-keyed ({"1":{DIST:...}}) — see genxn-api-schema-findings.
    const unitObj = unitRes.UNIT ? Object.values(unitRes.UNIT)[0] : undefined;
    const dist = ((unitObj as any)?.DIST || "M").toUpperCase();
    const mmPer = MM_PER_DIST[dist] ?? 1000;
    // REBC items are keyed by SECTION number (same as REBB — see
    // genxn-api-schema-findings), each value {ITEMS:[ColumnLikeItem]}.
    const rebcTop = rebcRes ? Object.keys(rebcRes)[0] : null;
    const rebc: Record<string, any> = rebcTop && rebcRes[rebcTop] && typeof rebcRes[rebcTop] === "object" ? rebcRes[rebcTop] : {};

    // Group column-oriented (vertical) frame elements by section.
    const bySect: Record<string, string[]> = {};
    for (const [key, el] of Object.entries(elems)) {
      if (el?.TYPE !== "BEAM") continue; // all frame elements report TYPE "BEAM"
      const sid = el?.SECT;
      if (sid == null) continue;
      const nodeIds = el?.NODE;
      if (!Array.isArray(nodeIds) || nodeIds.length < 2) continue;
      const a = nodes[nodeIds[0]];
      const b = nodes[nodeIds[1]];
      if (!a || !b) continue;
      const dz = Math.abs(Number(a.Z) - Number(b.Z));
      const dxy = Math.hypot(Number(a.X) - Number(b.X), Number(a.Y) - Number(b.Y));
      if (dz <= dxy) continue; // horizontal ⇒ beam, not a column
      (bySect[String(sid)] = bySect[String(sid)] || []).push(key);
    }

    const emptyPayload = { ITEMS: [{}] };
    const sections: Record<string, { name?: string; elementKeys: string[]; payload: any; dimB?: number; dimH?: number }> = {};
    for (const [sid, keys] of Object.entries(bySect)) {
      const sorted = keys.sort((x, y) => Number(x) - Number(y));
      const sect = sects[sid];
      const dims = sect ? sectDims(sect, mmPer) : {};
      sections[sid] = {
        name: sect?.SECT_NAME,
        elementKeys: sorted,
        payload: rebc[sid] ? rebc[sid] : emptyPayload,
        dimB: dims.b,
        dimH: dims.h,
      };
    }

    return res.json({ ok: true, unit: dist.toLowerCase(), sections });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
