import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENDPOINTS, resolveBase, setCorsPost } from "./lib/midas.js";

// Reads already-computed Mu/Vu demand for one beam element from Gen NX's
// BC-TABLE (manual §55, DESIGN/RC/KDS-41-20-2022/BC-TABLE) — a read of
// results the user already generated in Gen NX's own UI. Deliberately does
// NOT call BC-ANAL (the "run the check" endpoint): that one is documented
// in MIDAS-API-NX-SDK/docs/live_verification_notes.md to reproducibly hang
// or crash the Gen NX desktop app. Same KDS-41-20-2022 namespace as
// ENDPOINTS.BEAM (rebar list/save) — this feature only supports whatever
// that already supports, not a new namespace decision.
const BC_TABLE_PATH = ENDPOINTS.BEAM.replace(/\/REBB$/, "/BC-TABLE");

const SECTORS = ["I", "M", "J"] as const;
type SectorKey = (typeof SECTORS)[number];

interface DemandPoint {
  muNeg?: number;
  muPos?: number;
  vu?: number;
}

// Response table's top-level key is the requested TABLE_NAME, and other
// MIDAS table endpoints have been observed to vary that key across
// sessions (see MIDAS-API-NX-SDK/docs/live_verification_notes.md) — read
// the first value instead of assuming a literal string. Column positions
// come from HEAD at runtime instead of hardcoded indices, for the same
// "don't trust an assumed shape" reason the REBB read/write asymmetry and
// /db/UNIT's ID-keyed wrapper were both found the hard way.
function parseBcTable(data: any): Record<SectorKey, DemandPoint> {
  const out: Record<SectorKey, DemandPoint> = {} as Record<SectorKey, DemandPoint>;
  const table = data && typeof data === "object" ? Object.values(data)[0] : null;
  const head: string[] = (table as any)?.HEAD || [];
  const rows: string[][] = (table as any)?.DATA || [];
  if (!head.length || !rows.length) return out;

  const posIdx = head.indexOf("POS");
  const negMuIdx = head.indexOf("Neg_Mu");
  const posMuIdx = head.indexOf("Pos_Mu");
  const vuIdx = head.indexOf("Sh_Vu");
  if (posIdx < 0) return out;

  for (const row of rows) {
    const pos = row[posIdx];
    if (!SECTORS.includes(pos as SectorKey)) continue;
    const point: DemandPoint = {};
    if (negMuIdx >= 0) {
      const v = Math.abs(Number(row[negMuIdx]));
      if (Number.isFinite(v)) point.muNeg = v;
    }
    if (posMuIdx >= 0) {
      const v = Math.abs(Number(row[posMuIdx]));
      if (Number.isFinite(v)) point.muPos = v;
    }
    if (vuIdx >= 0) {
      const v = Math.abs(Number(row[vuIdx]));
      if (Number.isFinite(v)) point.vu = v;
    }
    out[pos as SectorKey] = point;
  }
  return out;
}

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
    const r = await fetch(`${base}${BC_TABLE_PATH}`, {
      method: "POST",
      headers: { "MAPI-Key": apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        Argument: {
          TABLE_TYPE: "MEMB",
          PRI_SORT: 1,
          ELEMS: { KEYS: [elemNum] },
          RESULT: 0,
          UNIT: { FORCE: "KN", DIST: "M" },
          COMPONENTS: ["MEMB", "POS", "Neg_Mu", "Pos_Mu", "Sh_Vu"],
        },
      }),
    });
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
    // Live-confirmed 2026-07-24: BC-TABLE returns HTTP 200 even for a real
    // error (e.g. a stale/orphaned element ID with no ELEM entry — see
    // genxn-api-schema-findings — returns 200 with this body, not a 4xx),
    // as `{"error":{"message":"Element 5 does not exist."}}`. Must be
    // treated as a failure, not "no data yet" (that case is a normal
    // Result Table response with an empty DATA array, which
    // parseBcTable() already handles on its own).
    if (data && data.error && data.error.message) {
      return res.json({ ok: false, error: data.error.message });
    }
    return res.json({ ok: true, bySector: parseBcTable(data) });
  } catch (e: any) {
    if (e?.name === "AbortError") return res.json({ ok: false, code: "timeout" });
    return res.json({ ok: false, error: e.message });
  } finally {
    clearTimeout(timeout);
  }
}
