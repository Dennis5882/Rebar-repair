import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMidas, resolveBase, setCorsPost } from "./lib/midas.js";
import { bcTableBody, bcTableErrorMessage, parseBcTable, type BcSectorKey, type DemandPoint } from "./lib/bcTable.js";

// Loads Mu/Vu demand for MANY beam elements in one request — backing the
// board's "전 단면 수요 불러오기" (load demand for every section at once).
//
// Each element is queried on its OWN BC-TABLE call, sequentially, reusing the
// exact single-element query that api/beam-design-result.ts already proved
// live. This is deliberate, NOT laziness: a multi-element BC-TABLE response
// can't be reliably demuxed back to the requested elements because Gen NX's
// `MEMB` column doesn't always echo the queried element id (it merges
// adjacent beams into one design member — see genxn-api-schema-findings).
// One element per call sidesteps that entirely. Still never touches BC-ANAL.
const BC_TABLE_PATH = "/DESIGN/RC/KDS-41-20-2022/BC-TABLE";

// Keep each individual query short, and stop the whole loop before Vercel's
// function ceiling so a big model returns a clean partial result instead of a
// platform 504. maxDuration is raised to match the loop budget.
const PER_CALL_TIMEOUT_MS = 7000;
const TOTAL_BUDGET_MS = 55000;
export const config = { maxDuration: 60 };

async function fetchOne(
  base: string,
  apiKey: string,
  elemNum: number
): Promise<Record<BcSectorKey, DemandPoint> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const result = await fetchMidas(`${base}${BC_TABLE_PATH}`, apiKey, {
      method: "POST",
      signal: controller.signal,
      body: bcTableBody(elemNum),
    });
    // A failed call or an error-body (orphaned element, "Please perform
    // analysis.") just means "no demand for this one" in a bulk load — skip
    // it, don't fail the whole batch. The section stays unjudged, same as
    // if the user never fetched it.
    if (!result.ok) return null;
    if (bcTableErrorMessage(result.data)) return null;
    return parseBcTable(result.data);
  } catch {
    return null; // includes AbortError — treat a slow element as "no data"
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl, elemKeys } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });
  if (!Array.isArray(elemKeys) || elemKeys.length === 0)
    return res.status(400).json({ ok: false, code: "missing_key_id" });

  // Dedup + keep only finite element numbers, preserving the original string
  // key so the client can map results straight back to its sections.
  const seen = new Set<string>();
  const targets: { key: string; num: number }[] = [];
  for (const raw of elemKeys) {
    const key = String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    const num = Number(raw);
    if (Number.isFinite(num)) targets.push({ key, num });
  }

  const byElem: Record<string, Record<BcSectorKey, DemandPoint>> = {};
  let partial = false;
  const start = Date.now();
  for (const { key, num } of targets) {
    if (Date.now() - start > TOTAL_BUDGET_MS) {
      partial = true; // ran out of time — return what we have so far
      break;
    }
    const bySector = await fetchOne(base, apiKey, num);
    if (bySector && Object.keys(bySector).length > 0) byElem[key] = bySector;
  }

  return res.json({ ok: true, byElem, partial });
}
