import type { MemberCheckRow } from "./api";

// Reduces a column/wall member's Gen NX check rows (one per element for columns,
// one per WID+Story for walls) to a single section/wall verdict: OK only if
// every row's strength AND rebar-detail check passed, with the worst (max) P-M
// and shear ratios across rows. Returns null when there is no recognizable
// verdict at all (non-KDS model, or check not run) so the board shows "판정 보류".
//
// Only an explicit "OK"/"NG" counts — Gen NX writes placeholders like "-",
// "----", or (for a column's CHK_RBR) a position code "M"/"I"/"J", none of which
// are a pass/fail and must not flip the verdict. Kept pure + exported for tests.
export interface MemberVerdict {
  ok: boolean;
  ratPM?: number;
  ratShear?: number;
}

const isOk = (s?: string): boolean => s != null && /^ok/i.test(s.trim());
const isNg = (s?: string): boolean => s != null && /ng/i.test(s.trim());

export function memberVerdictFromRows(rows?: MemberCheckRow[]): MemberVerdict | null {
  if (!rows || rows.length === 0) return null;
  let saw = false;
  let anyNg = false;
  let ratPM: number | undefined;
  let ratShear: number | undefined;
  for (const r of rows) {
    if (isOk(r.chk) || isNg(r.chk)) saw = true;
    if (isNg(r.chk)) anyNg = true;
    if (isNg(r.chkRbr)) anyNg = true;
    if (r.ratPM != null) ratPM = Math.max(ratPM ?? 0, r.ratPM);
    if (r.ratShear != null) ratShear = Math.max(ratShear ?? 0, r.ratShear);
  }
  if (!saw) return null;
  return { ok: !anyNg, ratPM, ratShear };
}
