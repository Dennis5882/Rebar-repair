import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, resolveBase, setCorsPost } from "./_lib/midas";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, memberType, key, payload } = req.body || {};
  const base = resolveBase(product, baseUrl);
  const endpoint = ENDPOINTS[memberType];
  const itemKey = String(key || "").trim();

  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (!endpoint) return res.status(400).json({ ok: false, code: "unknown_member_type", memberType });
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
