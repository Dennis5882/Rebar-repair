import type { VercelRequest, VercelResponse } from "@vercel/node";

// Vercel populates x-vercel-ip-country on deployed requests based on the
// client's IP (GeoIP). Not available in local `vercel dev` / plain static
// serving, so the client falls back to browser-language detection then.
const COUNTRY_LANG: Record<string, string> = {
  KR: "ko",
  CN: "zh-CN",
  TW: "zh-TW",
  HK: "zh-TW",
  MO: "zh-TW",
};

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const lang = COUNTRY_LANG[country] || null;
  res.json({ ok: true, country: country || null, lang });
}
