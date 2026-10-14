import type { MemberCheckRow } from "./api";
import { distRho } from "./gbSeismic";

// Taiwan 112年版 special structural wall web-steel rules (18.7.2 / 18.7.4.3),
// advisory like the GB counterpart. From the WC-TABLE rows of one Wall ID:
//  - rhoV / rhoH   18.7.2.1: ρℓ and ρt ≥ 0.0025 each way (ρt may be lower only
//                  when Vu ≤ 0.083λ√f'c·Acv — Vu is not read here, so the
//                  stricter 0.25 % is applied)
//  - spaceV/spaceH 18.7.2.1: bar spacing ≤ 450 mm in each direction
//  - curtains      18.7.2.2: two curtains when hw/ℓw ≥ 2.0 (Vu > 0.17√f'c·Acv
//                  also triggers it; Vu unknown here)
//  - rhoOrder      18.7.4.3: ρℓ ≥ ρt when hw/ℓw ≤ 2.0
// Out of scope here: boundary elements (18.7.6), shear Vn (18.7.4.1).

export type TwWallKind = "rhoV" | "rhoH" | "spaceV" | "spaceH" | "curtains" | "rhoOrder";

export interface TwWallIssue {
  kind: TwWallKind;
  actual: number;
  limit: number;
}

export interface TwWallResult {
  issues: TwWallIssue[];
  rhoV: number | null; // %
  rhoH: number | null;
  slenderness: number | null; // hw / ℓw
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const spacing = (s?: string): number | null => {
  const m = s?.match(/@\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
};

export function twWallSeismic(
  rows: MemberCheckRow[] | undefined,
  dia: (label: string) => number | null,
  hw?: number | null // wall height, mm (from the story range)
): TwWallResult {
  const issues: TwWallIssue[] = [];
  let rv: number | null = null;
  let rh: number | null = null;
  let sv: number | null = null;
  let sh: number | null = null;
  let lw: number | null = null;
  let layers: number | null = null;
  for (const r of rows || []) {
    const v = r.rhoV != null && r.rhoV > 0 ? r.rhoV : distRho(r.vRebar, r.tw, r.layers, dia);
    const h = r.rhoH != null && r.rhoH > 0 ? r.rhoH : distRho(r.hRebar, r.tw, r.layers, dia);
    if (v != null) rv = Math.min(rv ?? Infinity, v);
    if (h != null) rh = Math.min(rh ?? Infinity, h);
    const a = spacing(r.vRebar);
    const b = spacing(r.hRebar);
    if (a != null) sv = Math.max(sv ?? 0, a);
    if (b != null) sh = Math.max(sh ?? 0, b);
    if (r.lw) lw = Math.max(lw ?? 0, r.lw);
    if (r.layers != null) layers = Math.min(layers ?? Infinity, r.layers);
  }
  const slender = hw && lw ? hw / lw : null;
  if (rv != null && rv < 0.25 - 1e-9) issues.push({ kind: "rhoV", actual: r3(rv), limit: 0.25 });
  if (rh != null && rh < 0.25 - 1e-9) issues.push({ kind: "rhoH", actual: r3(rh), limit: 0.25 });
  if (sv != null && sv > 450 + 1e-9) issues.push({ kind: "spaceV", actual: sv, limit: 450 });
  if (sh != null && sh > 450 + 1e-9) issues.push({ kind: "spaceH", actual: sh, limit: 450 });
  if (slender != null && slender >= 2 && layers != null && layers < 2) issues.push({ kind: "curtains", actual: layers, limit: 2 });
  if (slender != null && slender <= 2 && rv != null && rh != null && rv < rh - 1e-9) issues.push({ kind: "rhoOrder", actual: r3(rv), limit: r3(rh) });
  return { issues, rhoV: rv != null ? r3(rv) : null, rhoH: rh != null ? r3(rh) : null, slenderness: slender != null ? r3(slender) : null };
}
