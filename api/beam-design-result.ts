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

// The design-check PERFORM endpoint. Long documented as a Gen NX crash risk,
// but live re-verified 2026-07-25 to run cleanly on current builds (see
// genxn-api-schema-findings) — used only when the caller explicitly asks for a
// recheck. PERFORM_TYPE "ALL" re-checks the whole model in ~2s; reading is
// still per-element below. Kept as its own literal in the same KDS namespace.
const BC_ANAL_PATH = "/DESIGN/RC/KDS-41-20-2022/BC-ANAL";
const ANAL_TIMEOUT_MS = 25000;

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
  // Gen NX's own design-check verdict for this position (read straight from
  // BC-TABLE, no in-browser formula). `chk` = CHK_STR (strength), `chkRbr` =
  // CHK_RBR (rebar detailing); ratN/ratP/ratV = demand/capacity ratios for
  // negative moment / positive moment / shear.
  chk?: string;
  chkRbr?: string;
  ratN?: number;
  ratP?: number;
  ratV?: number;
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

// String cell (CHK_STR/CHK_RBR), trimmed; undefined when blank or absent.
function readStr(row: string[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const raw = row[idx];
  if (raw == null || String(raw).trim() === "") return undefined;
  return String(raw).trim();
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
  // Gen NX verdict columns (live HEAD 2026-07-25): CHK_STR / CHK_RBR and the
  // demand/capacity ratios Rat-N (neg moment) / Rat-P (pos moment) / Rat-V
  // (shear). Note the hyphens — not underscores.
  const chkIdx = head.indexOf("CHK_STR");
  const chkRbrIdx = head.indexOf("CHK_RBR");
  const ratNIdx = head.indexOf("Rat-N");
  const ratPIdx = head.indexOf("Rat-P");
  const ratVIdx = head.indexOf("Rat-V");
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
    const chk = readStr(row, chkIdx);
    if (chk !== undefined) point.chk = chk;
    const chkRbr = readStr(row, chkRbrIdx);
    if (chkRbr !== undefined) point.chkRbr = chkRbr;
    const ratN = readAbsNum(row, ratNIdx);
    if (ratN !== undefined) point.ratN = ratN;
    const ratP = readAbsNum(row, ratPIdx);
    if (ratP !== undefined) point.ratP = ratP;
    const ratV = readAbsNum(row, ratVIdx);
    if (ratV !== undefined) point.ratV = ratV;
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

// Run the beam design check (BC-ANAL). `arg` selects the scope: whole model
// (PERFORM_TYPE "ALL", the board-wide "전체 재검토") or a single section/element
// (SECTIONS/ELEMS, the per-section "이 단면 검토 실행" — far faster). Returns
// BC-ANAL's error message if it reported one (notably " Please perform
// analysis." — HTTP 200 with an error body — when a rebar/member change has
// invalidated the model's analysis results), else null. A hang/timeout returns
// null: the check may have committed anyway, so the caller reads BC-TABLE
// regardless (see genxn-api-schema-findings).
async function runBeamCheck(base: string, apiKey: string, arg: Record<string, unknown> = { PERFORM_TYPE: "ALL" }): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANAL_TIMEOUT_MS);
  try {
    const r = await fetchMidas(`${base}${BC_ANAL_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: { Argument: arg },
    });
    if (!r.ok) return r.error;
    return r.data?.error?.message ? String(r.data.error.message) : null;
  } catch {
    return null; // hang/timeout: results may already be committed
  } finally {
    clearTimeout(timeout);
  }
}

// BC-ANAL's "please perform analysis" precondition error — a rebar/member edit
// invalidated the last solve, so the FE analysis ("해석 실행" /doc/ANAL) must run
// again before the design check can produce results. The board surfaces this as
// a prompt to press "해석 실행" (the middle button in the detail drawer).
const needsAnalysis = (msg: string | null): boolean => !!msg && /perform analysis/i.test(msg);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, elemKey, elemKeys, recheck, sectionId } = req.body || {};
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
    // Budget from here so BC-ANAL's own time counts against the total — the read
    // loop must fit under the function's maxDuration alongside a slow recheck.
    const start = Date.now();
    // Recheck once for the whole model before reading — one BC-ANAL "ALL" is
    // cheaper and more consistent than per-element checks.
    const analErr = recheck ? await runBeamCheck(base, apiKey) : null;
    // A rebar/member edit invalidated the solve: BC-TABLE would only return the
    // stale pre-edit verdict, which must not be surfaced as authoritative. Skip
    // the (wasted) reads and tell the frontend to run "해석 실행" first.
    if (needsAnalysis(analErr)) return res.json({ ok: true, byElem: {}, needAnalysis: true });
    const byElem: Record<string, Record<SectorKey, DemandPoint>> = {};
    let partial = false;
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

  // Per-section recheck: re-run BC-ANAL for just this section (SECTIONS by
  // number) — or, when the id isn't a real numeric SECT (an "elem:" fallback),
  // for just this element (ELEMS). Either way it targets one member, not the
  // whole model, so it's near-instant.
  let analErr: string | null = null;
  if (recheck) {
    const sn = Number(sectionId);
    const arg = Number.isFinite(sn)
      ? { PERFORM_TYPE: "SECTIONS", SECTIONS: [sn] }
      : { PERFORM_TYPE: "ELEMS", ELEMS: { KEYS: [elemNum] } };
    analErr = await runBeamCheck(base, apiKey, arg);
  }

  // Keep well under the platform timeout to return a clean, translatable error.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetchMidas(`${base}${BC_TABLE_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: bcTableBody(elemNum),
    });
    const tableErr = result.ok ? bcTableErrorMessage(result.data) : result.error;
    // A rebar edit invalidated the solve — surface a dedicated code so the UI
    // can tell the user to run "해석 실행" first, not a generic failure.
    if (needsAnalysis(analErr) || needsAnalysis(tableErr)) return res.json({ ok: false, code: "need_analysis" });
    if (!result.ok) return res.json({ ok: false, error: result.error });
    if (tableErr) return res.json({ ok: false, error: tableErr });
    return res.json({ ok: true, bySector: parseBcTable(result.data) });
  } catch (e: any) {
    if (e?.name === "AbortError") return res.json({ ok: false, code: "timeout" });
    return res.json({ ok: false, error: e.message });
  } finally {
    clearTimeout(timeout);
  }
}
