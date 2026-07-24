import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// Lists EVERY beam section in the model — not just those that already carry
// a REBB rebar record (the old api/rebar-list.ts limitation, and the root of
// the user's "the section exists, why won't it load?" complaint). Mirrors
// what Gen NX's own "Modify Beam Rebar Data" dialog shows.
//
// How Gen NX decides a section is a beam (verified live 2026-07-24, see
// genxn-api-schema-findings memory): /db/MBTP (member-type) is empty on a
// model where types were never explicitly assigned, so Gen NX auto-classifies
// frame elements by orientation — horizontal ⇒ beam, vertical ⇒ column. This
// endpoint does the same, then groups beam-oriented elements by section.

const MM_PER_DIST: Record<string, number> = { MM: 1, CM: 10, M: 1000, IN: 25.4, FT: 304.8 };

interface SectDims {
  b?: number; // width, mm
  h?: number; // depth, mm
}

// SHAPE "SB" (solid rectangle) stores vSIZE = [H, B, ...] — the RC-beam norm.
// Other shapes aren't reliably [H,B], so dims are left undefined (the UI
// falls back to an editable default) rather than reporting a wrong size.
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

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const [elemRes, nodeRes, sectRes, unitRes, rebbRes] = await Promise.all([
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/NODE", apiKey),
      getJson(base, "/db/SECT", apiKey),
      getJson(base, "/db/UNIT", apiKey),
      getJson(base, "/DESIGN/RC/KDS-41-20-2022/REBB", apiKey),
    ]);

    const elems: Record<string, any> = elemRes.ELEM || {};
    const nodes: Record<string, any> = nodeRes.NODE || {};
    const sects: Record<string, any> = sectRes.SECT || {};
    // /db/UNIT is ID-keyed ({"1":{DIST:...}}) — see genxn-api-schema-findings.
    const unitObj = unitRes.UNIT ? Object.values(unitRes.UNIT)[0] : undefined;
    const dist = ((unitObj as any)?.DIST || "M").toUpperCase();
    const mmPer = MM_PER_DIST[dist] ?? 1000;
    // REBB items keyed by element id; each value is {ITEMS:[BeamItem]}.
    const rebbTop = rebbRes ? Object.keys(rebbRes)[0] : null;
    const rebb: Record<string, any> = rebbTop && rebbRes[rebbTop] && typeof rebbRes[rebbTop] === "object" ? rebbRes[rebbTop] : {};

    // Group beam-oriented frame elements by section.
    const bySect: Record<string, string[]> = {};
    for (const [key, el] of Object.entries(elems)) {
      if (el?.TYPE !== "BEAM") continue; // frame elements only
      const sid = el?.SECT;
      if (sid == null) continue;
      const nodeIds = el?.NODE;
      if (!Array.isArray(nodeIds) || nodeIds.length < 2) continue;
      const a = nodes[nodeIds[0]];
      const b = nodes[nodeIds[1]];
      if (!a || !b) continue;
      const dz = Math.abs(Number(a.Z) - Number(b.Z));
      const dxy = Math.hypot(Number(a.X) - Number(b.X), Number(a.Y) - Number(b.Y));
      if (dz > dxy) continue; // vertical ⇒ column, not a beam
      (bySect[String(sid)] = bySect[String(sid)] || []).push(key);
    }

    const emptyPayload = { ITEMS: [{}] };
    const sections: Record<string, { name?: string; elementKeys: string[]; payload: any; dimB?: number; dimH?: number }> = {};
    for (const [sid, keys] of Object.entries(bySect)) {
      const sorted = keys.sort((x, y) => Number(x) - Number(y));
      const sect = sects[sid];
      const dims = sect ? sectDims(sect, mmPer) : {};
      // Representative rebar = lowest-numbered element in the group that
      // actually has a REBB record (practitioner rule: one section = one
      // rebar layout, so any member's record stands for the whole group).
      const repKey = sorted.find((k) => rebb[k]);
      sections[sid] = {
        name: sect?.SECT_NAME,
        elementKeys: sorted,
        payload: repKey ? rebb[repKey] : emptyPayload,
        dimB: dims.b,
        dimH: dims.h,
      };
    }

    return res.json({ ok: true, unit: dist.toLowerCase(), sections });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
