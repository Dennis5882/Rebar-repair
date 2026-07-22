import type { VercelRequest, VercelResponse } from "@vercel/node";

const MIDAS_BASE: Record<string, string> = {
  gen: "https://moa-engineers.midasit.com:443/gen",
  civil: "https://moa-engineers.midasit.com:443/civil",
};

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function getJson(base: string, path: string, apiKey: string): Promise<any> {
  try {
    const r = await fetch(`${base}${path}`, { headers: { "MAPI-Key": apiKey } });
    if (!r.ok) return {};
    return (await r.json()) || {};
  } catch {
    // A single missing/unsupported endpoint (e.g. no load combos defined
    // yet) shouldn't fail the whole summary — it just reads as empty.
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = (baseUrl || "").trim().replace(/\/$/, "") || MIDAS_BASE[product];
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const [elemRes, sectRes, matlRes, lcomRes, consRes] = await Promise.all([
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/SECT", apiKey),
      getJson(base, "/db/MATL", apiKey),
      getJson(base, "/db/LCOM-GEN", apiKey),
      getJson(base, "/db/CONS", apiKey),
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
      },
    });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
