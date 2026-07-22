import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveBase, setCorsPost } from "./_lib/midas";

// 연결 검증은 product 접두어를 뗀 루트의 /mapikey/verify (GET).
function mapiRoot(base: string): string {
  return base.replace(/\/(gen|civil)\/?$/i, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  const key = (apiKey || "").trim();
  if (!base || !key) return res.status(400).json({ ok: false, code: "missing_key" });

  try {
    const r = await fetch(`${mapiRoot(base)}/mapikey/verify`, { headers: { "MAPI-Key": key } });
    let data: any = null;
    try {
      data = await r.json();
    } catch {
      /* non-JSON response */
    }

    if (r.ok && data && data.keyVerified === true && data.status === "connected") {
      return res.json({ ok: true, program: data.program, user: data.user });
    }
    if (data && data.keyVerified === true && data.status === "disconnected") {
      return res.json({ ok: false, code: "disconnected", program: data.program });
    }
    if (data && data.program && data.program !== product) {
      return res.json({ ok: false, code: "mismatch", program: data.program });
    }
    return res.json({ ok: false, code: "http", httpStatus: r.status, status: data && data.status });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
