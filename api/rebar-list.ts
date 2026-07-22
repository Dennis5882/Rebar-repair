import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, resolveBase, setCorsPost } from "./lib/midas.js";

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
    const r = await fetch(`${base}${endpoint}`, { headers: { "MAPI-Key": apiKey } });
    let data: any = null;
    try {
      data = await r.json();
    } catch {
      /* non-JSON response */
    }

    if (!r.ok) {
      const msg = (data && (data.message || (data.error && data.error.message))) || `HTTP ${r.status}`;
      return res.json({ ok: false, error: msg });
    }
    const topKey = data ? Object.keys(data)[0] : null;
    const items = topKey ? data[topKey] || {} : {};
    return res.json({ ok: true, data: items });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
