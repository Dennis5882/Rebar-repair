import type { SectorKey } from "../types/rebar";

// Shared plumbing for the advisory detailing checks (kdsDetailing.ts,
// gbDetailing.ts): which face is the tension side at each station, and folding
// identical per-station issues into one row.

// Flexural-minimum rules apply to the TENSION steel. Under gravity a
// continuous beam hogs at its supports (top in tension at I/J) and sags at
// mid-span (bottom in tension at M); the other faces carry compression or
// through/架立 bars, which these minima don't govern.
export const TENSION_FACE: Record<SectorKey, { top: boolean; bot: boolean }> = {
  I: { top: true, bot: false },
  M: { top: false, bot: true },
  J: { top: true, bot: false },
};

export interface IssueBase {
  kind: string;
  actual: number;
  limit: number;
  demandKnown: boolean;
}

// "All"/"end-center" input modes copy one value into several stations — fold
// issues whose every field matches so the drawer lists each once with its
// stations. Equality is over all of the issue's own fields (so a code-specific
// flag like KDS's `halved` participates automatically).
export function foldBySector<T extends IssueBase>(found: { sector: SectorKey; issue: T }[]): (T & { sectors: SectorKey[] })[] {
  const out: (T & { sectors: SectorKey[] })[] = [];
  const same = (a: T, b: T) => {
    const ka = Object.keys(a) as (keyof T)[];
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
  };
  for (const { sector, issue } of found) {
    const hit = out.find((o) => {
      const { sectors: _s, ...rest } = o;
      return same(rest as unknown as T, issue);
    });
    if (hit) hit.sectors.push(sector);
    else out.push({ ...issue, sectors: [sector] });
  }
  return out;
}
