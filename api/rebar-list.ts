import type { VercelRequest, VercelResponse } from "@vercel/node";

const MIDAS_BASE: Record<string, string> = {
  gen: "https://moa-engineers.midasit.com:443/gen",
  civil: "https://moa-engineers.midasit.com:443/civil",
};

// KDS 41 20:2022 배근수정 엔드포인트 (부재 유형별). 응답은 엔드포인트 자신의
// 키(REBB/REBC/REBW/REBR) 아래에 { "<key>": {...} } 형태로 중첩되어 온다.
const ENDPOINTS: Record<string, string> = {
  BEAM: "/DESIGN/RC/KDS-41-20-2022/REBB",
  COLUMN: "/DESIGN/RC/KDS-41-20-2022/REBC",
  WALL: "/DESIGN/RC/KDS-41-20-2022/REBW",
  BRACE: "/DESIGN/RC/KDS-41-20-2022/REBR",
};

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, memberType } = req.body || {};
  const base = (baseUrl || "").trim().replace(/\/$/, "") || MIDAS_BASE[product];
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
