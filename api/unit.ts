import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

// /db/UNIT.DIST holds the model's active length unit as an uppercase code
// ("MM"/"CM"/"M"/"FT"/"IN" per the manual) — used to label cover-thickness
// fields, which otherwise show a bare number with no indication of scale.
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
  const dist: string = data?.UNIT?.DIST || "";
  return res.json({ ok: true, unit: DISPLAY[dist] || dist.toLowerCase() });
}
