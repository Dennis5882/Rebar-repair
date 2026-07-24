import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMidas, resolveBase, setCorsPost } from "./lib/midas.js";

// Runs the model's structural analysis via Gen NX's /doc/ANAL ("Perform
// Analysis" — manual 01_DOC.md #11). This is the plain FE solve, NOT a
// design-code check: it is explicitly kept separate from the BC-ANAL /
// CC-ANAL "perform design check" family, which is documented in
// MIDAS-API-NX-SDK/docs/live_verification_notes.md to reproducibly hang or
// crash the Gen NX desktop app. This app never calls that family.
//
// Live finding (same notes): on a large model (4000+ nodes) /doc/ANAL can
// legitimately take longer than a 90s client timeout to solve — a timeout
// here does NOT mean the request failed, it can mean the solve is still
// running server-side. So the frontend treats a timeout (code:"timeout") or
// an unparseable/late platform response as "still running", not a failure.
const ANAL_PATH = "/doc/ANAL";

// Raise this one function's ceiling above Vercel's default so a normal solve
// has room to finish inside the request. A model bigger than this window
// still won't fail cleanly at the platform level, which is exactly why the
// abort below returns a distinct code:"timeout" the UI can explain instead
// of a bare 504.
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  // Abort just under maxDuration so the handler still gets to return a clean,
  // translatable timeout instead of the platform killing it mid-flight.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 58000);

  try {
    const result = await fetchMidas(`${base}${ANAL_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: { Argument: {} },
    });
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const data = result.data;
    // /doc/ANAL returns HTTP 200 with an error body for a clean, fast
    // failure — e.g. { "error": { "message": "[Error] Load information has
    // not been entered for Analysis." } } (live-observed in the SDK notes).
    // Surface that as a real failure, not a success.
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
