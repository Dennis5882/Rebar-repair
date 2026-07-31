import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

const MM_PER_DIST: Record<string, number> = { MM: 1, CM: 10, M: 1000, IN: 25.4, FT: 304.8 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const [elemRes, sectRes, matlRes, lcomRes, consRes, thikRes, unitRes] = await Promise.all([
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/SECT", apiKey),
      getJson(base, "/db/MATL", apiKey),
      getJson(base, "/db/LCOM-GEN", apiKey),
      getJson(base, "/db/CONS", apiKey),
      // /db/THIK — plate/wall thickness catalogue. A WALL- or PLATE-type
      // element's `SECT` field indexes THIS table, NOT /db/SECT (live-verified
      // 2026-07-30 — see genxn-api-schema-findings), so a wall-heavy model
      // (e.g. a Korean apartment) needs its own summary section here or its
      // thickness data is invisible from this tab entirely.
      getJson(base, "/db/THIK", apiKey),
      getJson(base, "/db/UNIT", apiKey),
    ]);

    const elemItems: Record<string, any> = elemRes.ELEM || {};
    const byType: Record<string, number> = {};
    for (const v of Object.values(elemItems)) {
      const ty = (v as any)?.TYPE || "UNKNOWN";
      byType[ty] = (byType[ty] || 0) + 1;
    }

    const sectItems: Record<string, any> = sectRes.SECT || {};
    const matlItems: Record<string, any> = matlRes.MATL || {};
    const lcomItems: Record<string, any> = lcomRes["LCOM-GEN"] || {};
    const consItems: Record<string, any> = consRes.CONS || {};
    const thikItems: Record<string, any> = thikRes.THIK || {};
    const unitObj = unitRes.UNIT ? Object.values(unitRes.UNIT)[0] : undefined;
    const mmPer = MM_PER_DIST[((unitObj as any)?.DIST || "M").toUpperCase()] ?? 1000;

    return res.json({
      ok: true,
      data: {
        elements: { total: Object.keys(elemItems).length, byType },
        sections: {
          total: Object.keys(sectItems).length,
          items: Object.entries(sectItems).map(([id, v]: [string, any]) => ({
            id,
            name: v?.SECT_NAME || id,
            type: v?.SECTTYPE || "?",
          })),
        },
        materials: {
          total: Object.keys(matlItems).length,
          items: Object.entries(matlItems).map(([id, v]: [string, any]) => ({
            id,
            name: v?.NAME || id,
            type: v?.TYPE || "?",
          })),
        },
        loadCombinations: {
          total: Object.keys(lcomItems).length,
          items: Object.entries(lcomItems).map(([id, v]: [string, any]) => ({
            id,
            name: v?.NAME || id,
            active: v?.ACTIVE || "?",
          })),
        },
        constraints: {
          total: Object.keys(consItems).length,
          items: Object.entries(consItems).map(([nodeId, v]: [string, any]) => {
            const item = (v?.ITEMS && v.ITEMS[0]) || {};
            return {
              nodeId,
              groupName: item.GROUP_NAME || "",
              constraint: item.CONSTRAINT || "",
            };
          }),
        },
        thicknesses: {
          total: Object.keys(thikItems).length,
          items: Object.entries(thikItems).map(([id, v]: [string, any]) => ({
            id,
            name: v?.NAME || id,
            thicknessMm: typeof v?.T_IN === "number" ? Math.round(v.T_IN * mmPer) : undefined,
          })),
        },
      },
    });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
