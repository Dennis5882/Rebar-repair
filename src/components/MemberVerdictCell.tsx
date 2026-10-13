import type { EffVerdict } from "../lib/useMemberVerdict";
import { useI18n } from "../i18n/useI18n";

// Verdict table cell shared by the column & wall boards: OK/NG with the
// governing P-M / shear ratios and a "Gen NX" source badge, or a dash when no
// verdict has been read yet. `warn` = advisory detailing-warning count (GB
// seismic checks), shown as "⚠ n" next to the verdict like the beam board.
export function MemberVerdictCell({ v, genNxLabel, warn = 0 }: { v: EffVerdict; genNxLabel: string; warn?: number }) {
  const { t } = useI18n();
  const badge =
    warn > 0 ? (
      <span className="detail-warn" title={t("board.detailWarn", { count: warn })}>
        ⚠ {warn}
      </span>
    ) : null;
  if (v.ok == null) {
    return (
      <td>
        <span className="verdict none">—</span>
        {badge}
      </td>
    );
  }
  return (
    <td>
      <span className={"verdict " + (v.ok ? "ok" : "ng")} title={genNxLabel}>
        {v.ok ? "OK" : "NG"} <span className="rr">{(v.ratPM ?? 0).toFixed(2)}/{(v.ratShear ?? 0).toFixed(2)}</span>
        <span className="vsrc gennx">{genNxLabel}</span>
      </span>
      {badge}
    </td>
  );
}
