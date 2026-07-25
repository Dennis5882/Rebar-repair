import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// Lists EVERY section of a given member type in the model — not just those
// that already carry a rebar record — grouped by section, mirroring what
// Gen NX's own "Modify Rebar Data" dialog shows. This is the column/wall/
// brace analogue of api/beam-sections.ts; the BEAM board keeps its own
// dedicated endpoint (working, untouched), and this one generalizes the same
// idea to the other member types, dispatched on `memberType`.
//
// COLUMN and BRACE are implemented; WALL returns a clean "unsupported" (walls
// are PLATE / multi-segment and don't fit this SECT-grouped model — the wall
// board reads REBW via rebar-list instead).
//
// COLUMN uses orientation: Gen NX auto-classifies frame elements by
// orientation when /db/MBTP is empty (verified live 2026-07-24, see
// genxn-api-schema-findings) — horizontal ⇒ beam, vertical ⇒ column. This
// keeps only vertical sections (the mirror of beam-sections), so bare columns
// still show. BRACE can't use orientation (a brace is diagonal, indistinct
// from a sloped beam/column), so it lists sections that already have a REBR
// record — reliable, at the cost of not surfacing bare brace sections.

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
  // COLUMN and BRACE only. WALL is PLATE-based / multi-segment and doesn't fit
  // this SECT-grouped model — its board reads REBW via rebar-list instead.
  if (memberType !== "COLUMN" && memberType !== "BRACE") {
    return res.status(400).json({ ok: false, code: "unknown_member_type", memberType });
  }
  const rebarPath = memberType === "COLUMN" ? ENDPOINTS.COLUMN : ENDPOINTS.BRACE; // REBC / REBR

  try {
    const [elemRes, nodeRes, sectRes, unitRes, rebRes] = await Promise.all([
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
    // A 200 from the MIDAS API can still be a failure body ({error:{message}})
    // — surface it instead of parsing it into a bogus section (CLAUDE.md rule).
    if (rebRes && rebRes.error && rebRes.error.message) {
      return res.json({ ok: false, error: String(rebRes.error.message) });
    }
    // REBC/REBR items are keyed by SECTION number (same as REBB — see
    // genxn-api-schema-findings), each value {ITEMS:[ColumnLikeItem]}.
    const rebTop = rebRes ? Object.keys(rebRes)[0] : null;
    const reb: Record<string, any> = rebTop && rebRes[rebTop] && typeof rebRes[rebTop] === "object" ? rebRes[rebTop] : {};

    // Frame elements grouped by section, per member type — this is what
    // populates each section's elementKeys (count + "applies to" list), so it
    // must contain ONLY elements of the requested type:
    //  - COLUMN: VERTICAL (dz>dxy) frame elements — the orientation classifier
    //    (mirror of beam-sections). Grouping only vertical elements means a
    //    section shared with beams doesn't leak those beams into the column's
    //    element count, and bare columns still show (rebar not required).
    //  - BRACE: braces are diagonal and NOT reliably orientation-classifiable
    //    (a sloped beam/column looks the same), so the section LIST is driven
    //    by which sections carry a REBR record; the element count is every
    //    frame element on that section (best available without a brace
    //    classifier). Cost: bare brace sections aren't surfaced.
    // One pass over ELEM either way.
    const elemsBySect: Record<string, string[]> = {};
    for (const [key, el] of Object.entries(elems)) {
      if (el?.TYPE !== "BEAM") continue; // all frame elements report TYPE "BEAM"
      const sid = el?.SECT;
      if (sid == null) continue;
      if (memberType === "COLUMN") {
        const nodeIds = el?.NODE;
        if (!Array.isArray(nodeIds) || nodeIds.length < 2) continue;
        const a = nodes[nodeIds[0]];
        const b = nodes[nodeIds[1]];
        if (!a || !b) continue;
        const dz = Math.abs(Number(a.Z) - Number(b.Z));
        const dxy = Math.hypot(Number(a.X) - Number(b.X), Number(a.Y) - Number(b.Y));
        if (dz <= dxy) continue; // horizontal ⇒ beam, not a column
      }
      (elemsBySect[String(sid)] = elemsBySect[String(sid)] || []).push(key);
    }

    // COLUMN lists every section with a vertical element (bare ones included);
    // BRACE lists only sections that already carry a REBR record.
    const sectionIds = memberType === "COLUMN" ? Object.keys(elemsBySect) : Object.keys(reb);

    const emptyPayload = { ITEMS: [{}] };
    const sections: Record<string, { name?: string; elementKeys: string[]; payload: any; dimB?: number; dimH?: number }> = {};
    for (const sid of sectionIds) {
      const sorted = (elemsBySect[sid] || []).sort((x, y) => Number(x) - Number(y));
      const sect = sects[sid];
      const dims = sect ? sectDims(sect, mmPer) : {};
      sections[sid] = {
        name: sect?.SECT_NAME,
        elementKeys: sorted,
        payload: reb[sid] ? reb[sid] : emptyPayload,
        dimB: dims.b,
        dimH: dims.h,
      };
    }

    return res.json({ ok: true, unit: dist.toLowerCase(), sections });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
