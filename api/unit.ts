import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveBase, setCorsPost } from "./lib/midas.js";

// /db/UNIT's DIST field holds the model's active length unit as an
// uppercase code ("MM"/"CM"/"M"/"FT"/"IN" per the manual) — used to label
// cover-thickness fields, which otherwise show a bare number with no
// indication of scale. Despite the manual describing UNIT as a flat
// singleton object, the live response is ID-keyed like every other /db/*
// collection (confirmed 2026-07-23: {"UNIT":{"1":{"DIST":"MM",...}}}), so
// this reads that entry rather than UNIT's own fields directly.
const DISPLAY: Record<string, string> = { MM: "mm", CM: "cm", M: "m", FT: "ft", IN: "in" };

// Deliberately does NOT use lib/midas.js's getJson() here: getJson swallows
// every failure to {} so an aggregated multi-field response degrades
// gracefully when one piece is missing (see api/project-summary.ts). This
// endpoint has nothing else to aggregate, so that same behavior would make
// a real failure (bad key, disconnected Gen NX, timeout) indistinguishable
// from "the model just has no DIST set" — both used to silently come back
// as {ok:true, unit:""}, which the frontend then can't tell apart from a
// genuinely-unknown unit. Failing loudly here lets the caller (ConnDrawer)
// tell "unit unknown" apart from "fetch failed" if it ever needs to.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const r = await fetch(`${base}/db/UNIT`, { headers: { "MAPI-Key": apiKey } });
    if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}` });
    const data: any = await r.json();
    const unitItems: Record<string, any> = data?.UNIT || {};
    const first = unitItems["1"] ?? Object.values(unitItems)[0];
    const dist = (first as { DIST?: string } | undefined)?.DIST || "";
    return res.json({ ok: true, unit: DISPLAY[dist] || dist.toLowerCase() });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
