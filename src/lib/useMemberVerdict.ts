import { useMemo } from "react";
import { memberVerdictFromRows, type MemberVerdict } from "./memberCheck";
import type { MemberCheckRow } from "./api";

// The verdict actually rendered for a member: Gen NX's own check ("gennx") or
// none yet. No "formula" source — unlike beams, columns/walls have no in-browser
// fallback (Gen NX design check only).
export type EffVerdict = { ok?: boolean; source: "gennx" | "none"; ratPM?: number; ratShear?: number };

// Shared verdict computation for the column & wall boards. Reduces each key's
// Gen NX check rows to a verdict — authoritative unless the row is mid-edit (an
// unsaved change makes the last check stale, so fall back to none) — and returns
// an OK / NG / judged / changed summary. `dirtyBy` is the board's row map (any
// object with a `dirty` flag per key).
export function useMemberVerdict(
  order: string[],
  dirtyBy: Record<string, { dirty?: boolean } | undefined>,
  check: Record<string, MemberCheckRow[]>
): { verdicts: Record<string, EffVerdict>; summary: { total: number; ok: number; ng: number; judged: number; dirty: number } } {
  const genVerdicts = useMemo(() => {
    const out: Record<string, MemberVerdict | null> = {};
    for (const key of order) out[key] = memberVerdictFromRows(check[key]);
    return out;
  }, [order, check]);

  const verdicts = useMemo(() => {
    const out: Record<string, EffVerdict> = {};
    for (const key of order) {
      const gv = !dirtyBy[key]?.dirty ? genVerdicts[key] : null;
      out[key] = gv ? { ok: gv.ok, source: "gennx", ratPM: gv.ratPM, ratShear: gv.ratShear } : { source: "none" };
    }
    return out;
  }, [order, dirtyBy, genVerdicts]);

  const summary = useMemo(() => {
    let ok = 0;
    let ng = 0;
    let judged = 0;
    let dirty = 0;
    for (const key of order) {
      const v = verdicts[key];
      if (v?.ok === true) ok++;
      else if (v?.ok === false) ng++;
      if (v?.ok != null) judged++;
      if (dirtyBy[key]?.dirty) dirty++;
    }
    return { total: order.length, ok, ng, judged, dirty };
  }, [order, verdicts, dirtyBy]);

  return { verdicts, summary };
}
