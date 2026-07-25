import type { TFn } from "../i18n/types";

// One demand/capacity bar: label + symbol, the capacity value (or "—" when none,
// e.g. a Gen NX ratio-only verdict), the ratio, and a fill clamped to the 1.0
// mark. Shared by the beam board (formula φMn/φVn) and the column/wall boards
// (Gen NX ratios, cap null). `has` gates on the ratio, so a member with no
// verdict shows the "no result" note instead of an empty bar.
export function JudgeBar({ label, sym, ratio, cap, unit, t }: { label: string; sym: string; ratio?: number; cap: number | null; unit: string; t: TFn }) {
  const has = ratio != null;
  const ok = (ratio ?? 0) <= 1;
  const pct = Math.min(ratio ?? 0, 1.15) * (100 / 1.15);
  return (
    <div className="judge-row">
      <div className="judge-row-top">
        <span className="judge-name">{label} <span>{sym}</span></span>
        <span className="judge-val">
          {cap != null ? `${cap.toFixed(0)} ${unit}` : "—"}
          {has && <b className={ok ? "ok" : "ng"}> · {ratio!.toFixed(2)}</b>}
        </span>
      </div>
      <div className="judge-track">
        {has && <div className={"judge-fill " + (ok ? "ok" : "ng")} style={{ width: pct.toFixed(1) + "%" }} />}
        <div className="judge-mark" style={{ left: (100 / 1.15).toFixed(1) + "%" }} />
      </div>
      {!has && <div className="judge-nodem">{t("board.noDemand")}</div>}
    </div>
  );
}
