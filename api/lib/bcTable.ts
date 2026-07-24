// Shared BC-TABLE (RC beam check result) parsing + request shaping, used by
// both api/beam-design-result.ts (single element) and
// api/beam-design-results-batch.ts (all sections, one element at a time).
//
// See genxn-api-schema-findings memory / MIDAS-API-NX-SDK live_verification_notes:
// - Response top-level key is the requested TABLE_NAME but has been observed
//   to come back as "Result Table" — read the first value, don't hardcode.
// - Column positions come from HEAD at runtime, not hardcoded indices.
// - `MEMB` in the response does NOT reliably equal the queried element ID
//   (Gen NX merges adjacent beams into one design member), which is exactly
//   why the batch endpoint queries ONE element per call and never tries to
//   demux a multi-element response by MEMB.
//
// No default export — this is a lib module, not a Vercel route. Importers use
// an explicit `.js` extension (see the ESM gotchas note in ./midas.ts).

export const BC_SECTORS = ["I", "M", "J"] as const;
export type BcSectorKey = (typeof BC_SECTORS)[number];

export interface DemandPoint {
  muNeg?: number;
  muPos?: number;
  vu?: number;
}

// The single-element BC-TABLE request body. Requesting UNIT explicitly makes
// the response come back in kN·m / kN regardless of the model's display unit.
export function bcTableBody(elemNum: number) {
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

// `Number("")` is 0 (not NaN) in JS, so a blank/whitespace cell would
// otherwise parse as a real, finite 0 — indistinguishable from a genuinely
// reported zero, and liable to silently overwrite a manually-typed demand
// value with 0 on merge. Reject blank cells explicitly.
function readAbsNum(row: string[], idx: number): number | undefined {
  if (idx < 0) return undefined;
  const raw = row[idx];
  if (raw == null || raw.trim() === "") return undefined;
  const v = Math.abs(Number(raw));
  return Number.isFinite(v) ? v : undefined;
}

// Turn a BC-TABLE response into per-sector demand. Reads the first (only)
// top-level value and locates each column by HEAD name at runtime.
export function parseBcTable(data: any): Record<BcSectorKey, DemandPoint> {
  const out: Record<BcSectorKey, DemandPoint> = {} as Record<BcSectorKey, DemandPoint>;
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
    if (!BC_SECTORS.includes(pos as BcSectorKey)) continue;
    const point: DemandPoint = {};
    const muNeg = readAbsNum(row, negMuIdx);
    if (muNeg !== undefined) point.muNeg = muNeg;
    const muPos = readAbsNum(row, posMuIdx);
    if (muPos !== undefined) point.muPos = muPos;
    const vu = readAbsNum(row, vuIdx);
    if (vu !== undefined) point.vu = vu;
    out[pos as BcSectorKey] = point;
  }
  return out;
}

// BC-TABLE returns HTTP 200 even for a real error (e.g. an orphaned element
// with no ELEM entry: `{"error":{"message":"Element N does not exist."}}`).
// Returns the message when the body is that error shape, else null.
export function bcTableErrorMessage(data: any): string | null {
  if (data && data.error && data.error.message) return String(data.error.message);
  return null;
}
