import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMidas, resolveBase, setCorsPost } from "./lib/midas.js";

// Three model-level operations that each hit a single MIDAS endpoint, merged
// into ONE serverless function and dispatched on `action` in the POST body:
//   - "verify"  → /mapikey/verify  (connection check)
//   - "unit"    → /db/UNIT         (active length unit)
//   - "analyze" → /doc/ANAL        (perform FE analysis)
// They live together purely to stay under the Hobby plan's 12-function cap
// (see CLAUDE.md / vercel-esm-api-gotchas). Each branch keeps the exact
// behavior of the standalone handler it replaced — this is a packaging
// change, not a logic change.

// The analyze branch needs headroom above Vercel's default timeout (a large
// solve legitimately runs long); it applies to the whole function, which is
// harmless for the fast verify/unit branches.
export const config = { maxDuration: 60 };

// verify: the /mapikey/verify route lives at the product-prefix root, not
// under /gen or /civil — strip the product segment.
function mapiRoot(base: string): string {
  return base.replace(/\/(gen|civil)\/?$/i, "");
}

async function doVerify(res: VercelResponse, product: string, apiKey: string, base: string) {
  const key = (apiKey || "").trim();
  if (!key) return res.status(400).json({ ok: false, code: "missing_key" });
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

// unit: /db/UNIT's DIST field holds the model's active length unit as an
// uppercase code ("MM"/"CM"/"M"/"FT"/"IN"). Despite the manual describing
// UNIT as a flat singleton, the live response is ID-keyed like every other
// /db/* collection ({"UNIT":{"1":{"DIST":"MM",...}}}), so read that entry.
// Deliberately does NOT use getJson() (which swallows every failure to {}):
// this endpoint has nothing to aggregate, so failing loudly keeps "unit
// unknown" distinguishable from "fetch failed" for the caller (ConnDrawer).
const DISPLAY: Record<string, string> = { MM: "mm", CM: "cm", M: "m", FT: "ft", IN: "in" };

async function doUnit(res: VercelResponse, apiKey: string, base: string) {
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

// analyze: plain FE solve via /doc/ANAL ("Perform Analysis"). This is NOT a
// design-code check — it is explicitly kept away from the BC-ANAL/CC-ANAL
// "perform design check" family, which reproducibly hangs/crashes Gen NX
// (MIDAS-API-NX-SDK/docs/live_verification_notes.md). A large model's solve
// can outlast the request; a timeout means "still solving", not failure, so
// the abort returns a distinct code:"timeout" the UI can explain over a 504.
async function doAnalyze(res: VercelResponse, apiKey: string, base: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 58000);
  try {
    const result = await fetchMidas(`${base}/doc/ANAL`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: { Argument: {} },
    });
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const data = result.data;
    // /doc/ANAL returns HTTP 200 with an error body for a clean, fast failure
    // (e.g. "Load information has not been entered for Analysis."). Surface it.
    if (data && data.error && data.error.message) {
      return res.json({ ok: false, error: data.error.message });
    }
    return res.json({ ok: true, data });
  } catch (e: any) {
    if (e?.name === "AbortError") return res.json({ ok: false, code: "timeout" });
    return res.json({ ok: false, error: e.message });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { action, product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  switch (action) {
    case "verify":
      return doVerify(res, product, apiKey, base);
    case "unit":
      return doUnit(res, apiKey, base);
    case "analyze":
      return doAnalyze(res, apiKey, base);
    default:
      return res.status(400).json({ ok: false, code: "unknown_action", action });
  }
}
