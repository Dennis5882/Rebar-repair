import type { EffVerdict } from "../lib/useMemberVerdict";

// Verdict table cell shared by the column & wall boards: OK/NG with the
// governing P-M / shear ratios and a "Gen NX" source badge, or a dash when no
// verdict has been read yet.
export function MemberVerdictCell({ v, genNxLabel }: { v: EffVerdict; genNxLabel: string }) {
  if (v.ok == null) {
    return (
      <td>
        <span className="verdict none">—</span>
      </td>
    );
  }
  return (
    <td>
      <span className={"verdict " + (v.ok ? "ok" : "ng")} title={genNxLabel}>
        {v.ok ? "OK" : "NG"} <span className="rr">{(v.ratPM ?? 0).toFixed(2)}/{(v.ratShear ?? 0).toFixed(2)}</span>
        <span className="vsrc gennx">{genNxLabel}</span>
      </span>
    </td>
  );
}
