import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMidas, resolveBase, setCorsPost } from "./lib/midas.js";

// Reads already-computed Mu/Vu demand from Gen NX's BC-TABLE (manual §55,
// DESIGN/RC/KDS-41-20-2022/BC-TABLE) — a read of results the user already
// generated in Gen NX's own UI. Handles BOTH a single element (`elemKey`, for
// the per-section "결과값 불러오기") and a batch (`elemKeys[]`, for the board-
// wide "전 단면 결과값 불러오기"). The batch path queries each element on its
// OWN call, sequentially, because BC-TABLE's `MEMB` column can't be trusted to
// demux a multi-element response back to the requested elements (Gen NX merges
// adjacent beams into one design member — see genxn-api-schema-findings).
//
// Single + batch live in ONE function on purpose: the Hobby plan caps a
// deployment at 12 Serverless Functions, and a separate batch route plus a
// shared lib module (which Vercel also compiles into its own function) pushed
// us over. Keeping the parse helpers inline here avoids a second lib function.
//
// Deliberately NEVER calls BC-ANAL (the "run the check" endpoint): that one is
// documented in MIDAS-API-NX-SDK/docs/live_verification_notes.md to
// reproducibly hang or crash the Gen NX desktop app.
//
// Its own literal, not derived from ENDPOINTS.BEAM, so a future edit there
// can't silently break this path — keep it in the same KDS-41-20-2022
// namespace by hand.
const BC_TABLE_PATH = "/DESIGN/RC/KDS-41-20-2022/BC-TABLE";

// Batch needs headroom: a many-section model runs one BC-TABLE call per
// section. Query timeout stays short; the whole loop stops before the
// function ceiling and returns a clean partial result.
const PER_CALL_TIMEOUT_MS = 7000;
const TOTAL_BUDGET_MS = 55000;
export const config = { maxDuration: 60 };

const SECTORS = ["I", "M", "J"] as const;
type SectorKey = (typeof SECTORS)[number];

interface DemandPoint {
  muNeg?: number;
  muPos?: number;
  vu?: number;
}

// The single-element BC-TABLE request body. Requesting UNIT explicitly makes
// the response come back in kN·m / kN regardless of the model's display unit.
function bcTableBody(elemNum: number) {
  return {
    Argument: {
      TABLE_TYPE: "MEMB",
      PRI_SORT: 1,
      ELEMS: { KEYS: [elemNum] },
      RESULT: 0,
      UNIT: { FORCE: "KN", DIST: "M" },
      COMPONENTS: ["MEMB", "POS", "Neg_Mu", "Pos_Mu", "Sh_Vu"],
    },
  };
}

// `Number("")` is 0 (not NaN) in JS, so a blank/whitespace cell would parse as
// a real, finite 0 — indistinguishable from a genuinely reported zero and
// liable to silently overwrite a typed demand value with 0 on merge. Reject
// blank cells explicitly.
function readAbsNum(row: string[], idx: number): number | undefined {
  if (idx < 0) return undefined;
  const raw = row[idx];
  if (raw == null || raw.trim() === "") return undefined;
  const v = Math.abs(Number(raw));
  return Number.isFinite(v) ? v : undefined;
}

// Response top-level key is the requested TABLE_NAME but has been observed to
// vary ("Result Table") — read the first value. Column positions come from
// HEAD at runtime, not hardcoded indices.
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
    const muNeg = readAbsNum(row, negMuIdx);
    if (muNeg !== undefined) point.muNeg = muNeg;
    const muPos = readAbsNum(row, posMuIdx);
    if (muPos !== undefined) point.muPos = muPos;
    const vu = readAbsNum(row, vuIdx);
    if (vu !== undefined) point.vu = vu;
    out[pos as SectorKey] = point;
  }
  return out;
}

// BC-TABLE returns HTTP 200 even for a real error (e.g. an orphaned element:
// `{"error":{"message":"Element N does not exist."}}`). Returns the message
// when the body is that error shape, else null.
function bcTableErrorMessage(data: any): string | null {
  if (data && data.error && data.error.message) return String(data.error.message);
  return null;
}

// One element's demand, or null on any failure/timeout/error-body — used by
// the batch loop, where a bad element just means "no demand for this one",
// never a whole-batch failure.
async function fetchOne(base: string, apiKey: string, elemNum: number): Promise<Record<SectorKey, DemandPoint> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const result = await fetchMidas(`${base}${BC_TABLE_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: bcTableBody(elemNum),
    });
    if (!result.ok) return null;
    if (bcTableErrorMessage(result.data)) return null;
    return parseBcTable(result.data);
  } catch {
    return null; // includes AbortError — a slow element is treated as "no data"
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, elemKey, elemKeys } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  // --- batch mode: one element per call, sequentially, within a time budget
  if (Array.isArray(elemKeys)) {
    if (elemKeys.length === 0) return res.status(400).json({ ok: false, code: "missing_key_id" });
    const seen = new Set<string>();
    const targets: { key: string; num: number }[] = [];
    for (const raw of elemKeys) {
      const key = String(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      const num = Number(raw);
      if (Number.isFinite(num)) targets.push({ key, num });
    }
    const byElem: Record<string, Record<SectorKey, DemandPoint>> = {};
    let partial = false;
    const start = Date.now();
    for (const { key, num } of targets) {
      if (Date.now() - start > TOTAL_BUDGET_MS) {
        partial = true; // out of time — return what we have
        break;
      }
      const bySector = await fetchOne(base, apiKey, num);
      if (bySector && Object.keys(bySector).length > 0) byElem[key] = bySector;
    }
    return res.json({ ok: true, byElem, partial });
  }

  // --- single mode
  if (!elemKey) return res.status(400).json({ ok: false, code: "missing_key_id" });
  const elemNum = Number(elemKey);
  if (!Number.isFinite(elemNum)) return res.status(400).json({ ok: false, code: "missing_key_id" });

  // BC-TABLE hung once in prior testing, but only for an element whose own
  // BC-ANAL call had left the server bad — a case this app never creates.
  // Keep well under the platform timeout to return a clean, translatable error.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetchMidas(`${base}${BC_TABLE_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: bcTableBody(elemNum),
    });
    if (!result.ok) return res.json({ ok: false, error: result.error });
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
