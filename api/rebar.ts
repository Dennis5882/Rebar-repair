import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, fetchMidas, getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// The two rebar operations — "list" (read a member type's REBB/REBC/REBW/REBR
// collection) and "update" (PUT one section's rebar) — merged into ONE
// serverless function, dispatched on `action`, to stay under the Hobby plan's
// 12-function cap (see CLAUDE.md / vercel-esm-api-gotchas). Each branch keeps
// the exact behavior of the standalone handler it replaced.

// ELEM/SECT are full-model collections (1000+ elements on a real project) but
// don't change between the four member-type tabs' list-loads within one
// editing session — cache them per (base, apiKey) for a short window so
// repeated "load list" clicks (any tab) within a warm serverless instance
// reuse the same fetch. Only helps warm invocations — a partial win, free
// given the runtime.
interface ElemSectCacheEntry {
  at: number;
  elemItems: Record<string, any>;
  sectItems: Record<string, any>;
}
const elemSectCache = new Map<string, ElemSectCacheEntry>();
const ELEM_SECT_CACHE_TTL_MS = 30_000;

async function getElemSectCached(base: string, apiKey: string): Promise<ElemSectCacheEntry> {
  const cacheKey = `${base}::${apiKey}`;
  const cached = elemSectCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ELEM_SECT_CACHE_TTL_MS) return cached;
  const [elemRes, sectRes] = await Promise.all([getJson(base, "/db/ELEM", apiKey), getJson(base, "/db/SECT", apiKey)]);
  const entry: ElemSectCacheEntry = { at: Date.now(), elemItems: elemRes.ELEM || {}, sectItems: sectRes.SECT || {} };
  elemSectCache.set(cacheKey, entry);
  return entry;
}

async function doList(res: VercelResponse, apiKey: string, base: string, endpoint: string) {
  try {
    const result = await fetchMidas(`${base}${endpoint}`, apiKey);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const data = result.data;
    const topKey = data ? Object.keys(data)[0] : null;
    const items = topKey ? data[topKey] || {} : {};

    // Practitioners identify members by section name (e.g. "G1"), not the raw
    // element ID key — resolve each key's assigned section name via
    // ELEM -> SECT so the UI can show both. Both lookups swallow errors to {}
    // (getJson), so a lookup failure just means no names attached, not a
    // failed list load.
    const names: Record<string, string> = {};
    const keys = Object.keys(items);
    if (keys.length) {
      const { elemItems, sectItems } = await getElemSectCached(base, apiKey);
      for (const key of keys) {
        const sectId = elemItems[key]?.SECT;
        const name = sectId != null ? sectItems[String(sectId)]?.SECT_NAME : undefined;
        if (name) names[key] = name;
      }
    }

    return res.json({ ok: true, data: items, names });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}

// WALL-specific list: REBW only ever contains walls someone has already
// assigned rebar to via Gen NX's own Wall Rebar dialog — on a model where
// that dialog has never been opened, REBW comes back completely empty even
// though the model has real walls, and the board is permanently stuck on
// "no rows" (live-verified 2026-07-30 against a real apartment model: 9,668
// WALL elements, REBW empty). Fixed the same way the COLUMN board already
// handles bare sections: enumerate walls from /db/ELEM instead of trusting
// REBW to list them.
//
// Each WALL-type element carries a `WALL` field — its Wall ID, the exact key
// REBW's `Assign` map expects. Live-verified 2026-07-30: PUT-ing REBW with an
// id taken from this field round-trips; an id outside the model's real range
// is rejected with `{"error":{"message":"Wrong Key"}}` — so the server
// itself validates against real walls, confirming `ELEM.WALL` IS the REBW
// key space, not just a coincidentally-similar grouping number.
async function doListWall(res: VercelResponse, apiKey: string, base: string) {
  try {
    const [elemRes, rebResult] = await Promise.all([
      getJson(base, "/db/ELEM", apiKey),
      fetchMidas(`${base}${ENDPOINTS.WALL}`, apiKey),
    ]);
    if (!rebResult.ok) return res.json({ ok: false, error: rebResult.error });
    const rebData = rebResult.data;
    const rebTop = rebData ? Object.keys(rebData)[0] : null;
    const rebItems: Record<string, any> = rebTop && rebData[rebTop] && typeof rebData[rebTop] === "object" ? rebData[rebTop] : {};

    const elems: Record<string, any> = elemRes.ELEM || {};
    const widsFromElems = new Set<string>();
    for (const el of Object.values(elems)) {
      if ((el as any)?.TYPE !== "WALL") continue;
      const wid = (el as any)?.WALL;
      if (wid != null) widsFromElems.add(String(wid));
    }
    // /db/WMAK ("Modify Wall Mark") looked like a promising name source
    // (MARKNAME per Wall ID) but its own WID_LIST turned out to be a
    // different, unrelated ID space on the live model tested (e.g. 331/721/
    // 2001, nowhere near the model's real WIDs of 1-15) — dropped rather
    // than shipped on an unverified assumption. The board falls back to the
    // bare WID as the row label, same as it always has.

    const emptyPayload = { ITEMS: [{}] };
    const wids = new Set([...widsFromElems, ...Object.keys(rebItems)]);
    const data: Record<string, any> = {};
    for (const wid of wids) data[wid] = rebItems[wid] || emptyPayload;

    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}

async function doUpdate(res: VercelResponse, apiKey: string, base: string, endpoint: string, key: any, payload: any) {
  const itemKey = String(key || "").trim();
  if (!itemKey) return res.status(400).json({ ok: false, code: "missing_key_id" });
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, code: "empty_payload" });
  }
  try {
    const r = await fetch(`${base}${endpoint}`, {
      method: "PUT",
      headers: { "MAPI-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ Assign: { [itemKey]: payload } }),
    });
    let data: any = null;
    try {
      data = await r.json();
    } catch {
      /* non-JSON response */
    }

    if (!r.ok || (data && data.error)) {
      const msg = (data && (data.error?.message || data.message)) || `HTTP ${r.status}`;
      return res.json({ ok: false, error: msg });
    }
    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { action, product, apiKey, baseUrl, memberType, key, payload } = req.body || {};
  const base = resolveBase(product, baseUrl);
  const endpoint = ENDPOINTS[memberType];
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (!endpoint) return res.status(400).json({ ok: false, code: "unknown_member_type", memberType });

  switch (action) {
    case "list":
      return memberType === "WALL" ? doListWall(res, apiKey, base) : doList(res, apiKey, base, endpoint);
    case "update":
      return doUpdate(res, apiKey, base, endpoint, key, payload);
    default:
      return res.status(400).json({ ok: false, code: "unknown_action", action });
  }
}
