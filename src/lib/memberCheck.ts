import type { MemberCheckRow } from "./api";

// Reduces a column/wall/brace member's Gen NX check rows (one per element for
// columns/braces, one per WID+Story for walls) to a single verdict: OK only if
// every row's check passed, with the worst (max) P-M and shear ratios across
// rows. Returns null when there is no recognizable verdict at all (non-KDS
// model, or check not run) so the board shows "판정 보류".
//
// Verdict field semantics (live-verified 2026-07-25): a checked member's CHK_STR
// reads "OK…" when it passes ("OK", "OK-", "OK-#") and a **governing-mode code**
// when it FAILS — Gen NX writes "PM-", "V-", etc., NOT the literal "NG". So the
// rule is "OK-prefix ⇒ pass, anything else meaningful ⇒ fail", NOT "only an
// explicit 'NG' fails" (that would miss every mode-code failure). Pure
// placeholders ("-", "----", "N/A") are not verdicts and are ignored — a
// column's/brace's CHK_RBR position code ("M"/"MV") is dropped at the parse step
// so it never reaches here. Kept pure + exported for tests.
export interface MemberVerdict {
  ok: boolean;
  ratPM?: number;
  ratShear?: number;
}

const isOk = (s: string): boolean => /^ok/i.test(s.trim());
// A "not a verdict" cell: blank, a dash run ("-", "----"), or N/A.
const isPlaceholder = (s: string): boolean => { const t = s.trim(); return t === "" || /^-+$/.test(t) || /^n\/?a$/i.test(t); };
// A verdict field that is present, meaningful, and not OK ⇒ this row failed.
const fieldFails = (s?: string): boolean => s != null && !isPlaceholder(s) && !isOk(s);
const fieldPasses = (s?: string): boolean => s != null && !isPlaceholder(s) && isOk(s);

export function memberVerdictFromRows(rows?: MemberCheckRow[]): MemberVerdict | null {
  if (!rows || rows.length === 0) return null;
  let saw = false;
  let anyNg = false;
  let ratPM: number | undefined;
  let ratShear: number | undefined;
  for (const r of rows) {
    for (const field of [r.chk, r.chkRbr]) {
      if (fieldPasses(field) || fieldFails(field)) saw = true;
      if (fieldFails(field)) anyNg = true;
    }
    if (r.ratPM != null) ratPM = Math.max(ratPM ?? 0, r.ratPM);
    if (r.ratShear != null) ratShear = Math.max(ratShear ?? 0, r.ratShear);
  }
  if (!saw) return null;
  return { ok: !anyNg, ratPM, ratShear };
}

// --- Pure CC-TABLE / WC-TABLE parsers -------------------------------------
// Shared by the API handler (api/beam-design-result.ts) and unit tests. Kept
// here (src/lib, no runtime deps) so the member column-name mapping is guarded
// by vitest — the part most likely to break if Gen NX renames a column. Note
// the naming split: columns use underscores (Rat_V_end), walls use hyphens
// (Rat-V) — a live-verified footgun, so it's covered by tests.

// A blank/whitespace cell isn't a value: Number("") is 0 (a real, finite zero),
// which would masquerade as a genuine 0 ratio, so reject blanks explicitly.
function readStr(row: string[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const raw = row[idx];
  if (raw == null || String(raw).trim() === "") return undefined;
  return String(raw).trim();
}
function readAbsNum(row: string[], idx: number): number | undefined {
  const s = readStr(row, idx);
  if (s === undefined) return undefined;
  const v = Math.abs(Number(s));
  return Number.isFinite(v) ? v : undefined;
}
// Largest finite abs value across the given column indices (a member's
// governing ratio), or undefined if none are numeric.
function maxAbs(row: string[], idxs: number[]): number | undefined {
  let m: number | undefined;
  for (const i of idxs) {
    const v = readAbsNum(row, i);
    if (v !== undefined) m = m === undefined ? v : Math.max(m, v);
  }
  return m;
}

// CC-TABLE → rows grouped by SECT (the board's section id). CHK_RBR is a
// position code for columns (not OK/NG), so only CHK_STR is used. ratPM = worst
// of Rat_P/Rat_M/Rat_My/Rat_Mz; ratShear = worst of Rat_V_end/Rat_V_mid.
export function parseColumnRows(head: string[], rows: string[][]): Record<string, MemberCheckRow[]> {
  const sectIdx = head.indexOf("SECT");
  const chkIdx = head.indexOf("CHK_STR");
  const pmIdx = ["Rat_P", "Rat_M", "Rat_My", "Rat_Mz"].map((c) => head.indexOf(c));
  const vIdx = ["Rat_V_end", "Rat_V_mid"].map((c) => head.indexOf(c));
  const out: Record<string, MemberCheckRow[]> = {};
  if (sectIdx < 0) return out;
  for (const row of rows) {
    const sid = readStr(row, sectIdx);
    if (!sid) continue;
    (out[sid] ||= []).push({ chk: readStr(row, chkIdx), ratPM: maxAbs(row, pmIdx), ratShear: maxAbs(row, vIdx) });
  }
  return out;
}

// BRC-TABLE → rows grouped by SECT (the brace board's section id, REBR is
// section-keyed for braces too). Like columns, CHK_RBR is a position/mode code
// ("MV") not a verdict, so only CHK_STR is used; a failing brace's CHK_STR is a
// mode code ("PM-"), handled by memberVerdictFromRows. Columns are HYPHENATED
// here (Rat-P/Rat-M/…/Rat-V), unlike the underscore CC-TABLE. ratPM = worst of
// Rat-P/Rat-M/Rat-My/Rat-Mz; ratShear = Rat-V. (Single position, no end/mid.)
export function parseBraceRows(head: string[], rows: string[][]): Record<string, MemberCheckRow[]> {
  const sectIdx = head.indexOf("SECT");
  const chkIdx = head.indexOf("CHK_STR");
  const pmIdx = ["Rat-P", "Rat-M", "Rat-My", "Rat-Mz"].map((c) => head.indexOf(c));
  const vIdx = head.indexOf("Rat-V");
  const out: Record<string, MemberCheckRow[]> = {};
  if (sectIdx < 0) return out;
  for (const row of rows) {
    const sid = readStr(row, sectIdx);
    if (!sid) continue;
    (out[sid] ||= []).push({ chk: readStr(row, chkIdx), ratPM: maxAbs(row, pmIdx), ratShear: maxAbs(row, [vIdx]) });
  }
  return out;
}

// WC-TABLE → rows grouped by WID (the board's wall id), one per Story. Both
// CHK_STR (strength) and CHK_RBR (rebar detail) are real OK/NG for walls. ratPM
// = worst of Rat-Py/Rat-Pz/Rat-My/Rat-Mz; ratShear = Rat-V. Note the hyphens.
export function parseWallRows(head: string[], rows: string[][]): Record<string, MemberCheckRow[]> {
  const widIdx = head.indexOf("WID");
  const chkIdx = head.indexOf("CHK_STR");
  const chkRbrIdx = head.indexOf("CHK_RBR");
  const pmIdx = ["Rat-Py", "Rat-Pz", "Rat-My", "Rat-Mz"].map((c) => head.indexOf(c));
  const vIdx = head.indexOf("Rat-V");
  const out: Record<string, MemberCheckRow[]> = {};
  if (widIdx < 0) return out;
  for (const row of rows) {
    const wid = readStr(row, widIdx);
    if (!wid) continue;
    (out[wid] ||= []).push({ chk: readStr(row, chkIdx), chkRbr: readStr(row, chkRbrIdx), ratPM: maxAbs(row, pmIdx), ratShear: maxAbs(row, [vIdx]) });
  }
  return out;
}
