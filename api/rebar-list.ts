import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, fetchMidas, getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// ELEM/SECT are full-model collections (1000+ elements on a real project)
// but don't change between the four member-type tabs' list-loads within one
// editing session — cache them per (base, apiKey) for a short window so
// repeated "load list" clicks (any tab) within a warm serverless instance
// reuse the same fetch instead of re-downloading the whole model each time.
// Only helps warm invocations (Vercel doesn't guarantee this persists across
// cold starts) — a partial win, not a full fix, but free given the runtime.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, memberType } = req.body || {};
  const base = resolveBase(product, baseUrl);
  const endpoint = ENDPOINTS[memberType];
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (!endpoint) return res.status(400).json({ ok: false, code: "unknown_member_type", memberType });

  try {
    const result = await fetchMidas(`${base}${endpoint}`, apiKey);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const data = result.data;
    const topKey = data ? Object.keys(data)[0] : null;
    const items = topKey ? data[topKey] || {} : {};

    // Practitioners identify members by their section name (e.g. "G1"),
    // not the raw element ID key returned above — resolve each key's
    // assigned section name via ELEM -> SECT so the UI can show both.
    // Both calls swallow errors to {} (getJson), so a lookup failure just
    // means no names are attached, not a failed list load.
    const names: Record<string, string> = {};
    const keys = Object.keys(items);
    // In practice, every element sharing one section is expected to carry
    // identical rebar — if it needs to differ, practitioners give it its
    // own section instead of varying rebar within one. So the "target"
    // practitioners actually think in terms of is the section, not the
    // individual element: group already-loaded elements by their SECT ID
    // (one representative element's data stands in for the whole group),
    // so the UI can offer "pick a section" instead of "pick an element".
    // Elements with no resolvable SECT (orphaned REBB records — see
    // memory: elements deleted after rebar was assigned) fall back to
    // their own single-element group, keyed distinctly so they can't
    // collide with a real SECT id.
    const sections: Record<string, { name?: string; elementKeys: string[]; payload: any }> = {};
    if (keys.length) {
      const { elemItems, sectItems } = await getElemSectCached(base, apiKey);
      const bySect: Record<string, { name?: string; elementKeys: string[] }> = {};
      for (const key of keys) {
        const sectId = elemItems[key]?.SECT;
        if (sectId == null) {
          sections[`elem:${key}`] = { elementKeys: [key], payload: items[key] };
          continue;
        }
        const sid = String(sectId);
        const name = sectItems[sid]?.SECT_NAME;
        if (name) names[key] = name;
        if (!bySect[sid]) bySect[sid] = { name, elementKeys: [] };
        bySect[sid].elementKeys.push(key);
      }
      for (const [sid, grp] of Object.entries(bySect)) {
        const repKey = [...grp.elementKeys].sort((a, b) => Number(a) - Number(b))[0];
        sections[sid] = { name: grp.name, elementKeys: grp.elementKeys, payload: items[repKey] };
      }
    }

    return res.json({ ok: true, data: items, names, sections });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
