import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMidas, resolveBase, setCorsPost } from "./lib/midas.js";
import { bcTableBody, bcTableErrorMessage, parseBcTable } from "./lib/bcTable.js";

// Reads already-computed Mu/Vu demand for one beam element from Gen NX's
// BC-TABLE (manual §55, DESIGN/RC/KDS-41-20-2022/BC-TABLE) — a read of
// results the user already generated in Gen NX's own UI. Deliberately does
// NOT call BC-ANAL (the "run the check" endpoint): that one is documented
// in MIDAS-API-NX-SDK/docs/live_verification_notes.md to reproducibly hang
// or crash the Gen NX desktop app.
//
// Written as its own literal (not derived from ENDPOINTS.BEAM via string
// manipulation) so a future edit to ENDPOINTS.BEAM can't silently break
// this path — it must be kept in the same KDS-41-20-2022 namespace as
// ENDPOINTS.BEAM by hand; this feature only supports whatever the
// rebar-list/save feature already supports, not a new namespace decision.
const BC_TABLE_PATH = "/DESIGN/RC/KDS-41-20-2022/BC-TABLE";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, elemKey } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (!elemKey) return res.status(400).json({ ok: false, code: "missing_key_id" });

  const elemNum = Number(elemKey);
  if (!Number.isFinite(elemNum)) return res.status(400).json({ ok: false, code: "missing_key_id" });

  // BC-TABLE hung once in prior live testing, but only for an element whose
  // own BC-ANAL call had just left the server in a bad state — a case this
  // app never creates since it never calls BC-ANAL. Residual risk is small
  // but non-zero, so this stays well under Vercel's platform timeout to
  // return a clean, translatable error instead of a bare 504.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const result = await fetchMidas(`${base}${BC_TABLE_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: bcTableBody(elemNum),
    });
    if (!result.ok) return res.json({ ok: false, error: result.error });
    // Live-confirmed 2026-07-24: BC-TABLE returns HTTP 200 even for a real
    // error (e.g. a stale/orphaned element ID) — treat it as a failure, not
    // "no data yet" (that case is a normal response with an empty DATA array,
    // which parseBcTable() already handles on its own).
    const errMsg = bcTableErrorMessage(result.data);
    if (errMsg) return res.json({ ok: false, error: errMsg });
    return res.json({ ok: true, bySector: parseBcTable(result.data) });
  } catch (e: any) {
    if (e?.name === "AbortError") return res.json({ ok: false, code: "timeout" });
    return res.json({ ok: false, error: e.message });
  } finally {
    clearTimeout(timeout);
  }
}
