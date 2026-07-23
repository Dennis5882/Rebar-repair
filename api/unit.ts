import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// /db/UNIT's DIST field holds the model's active length unit as an
// uppercase code ("MM"/"CM"/"M"/"FT"/"IN" per the manual) — used to label
// cover-thickness fields, which otherwise show a bare number with no
// indication of scale. Despite the manual describing UNIT as a flat
// singleton object, the live response is ID-keyed like every other /db/*
// collection (confirmed 2026-07-23: {"UNIT":{"1":{"DIST":"MM",...}}}), so
// this reads the first entry rather than UNIT's own fields directly.
const DISPLAY: Record<string, string> = { MM: "mm", CM: "cm", M: "m", FT: "ft", IN: "in" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  const data = await getJson(base, "/db/UNIT", apiKey);
  const unitItems: Record<string, any> = data?.UNIT || {};
  const first = Object.values(unitItems)[0] as { DIST?: string } | undefined;
  const dist = first?.DIST || "";
  return res.json({ ok: true, unit: DISPLAY[dist] || dist.toLowerCase() });
}
