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
      return doList(res, apiKey, base, endpoint);
    case "update":
      return doUpdate(res, apiKey, base, endpoint, key, payload);
    default:
      return res.status(400).json({ ok: false, code: "unknown_action", action });
  }
}
