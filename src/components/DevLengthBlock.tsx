import { useI18n } from "../i18n/useI18n";
import { toModelDiameter } from "../data/rcCodePresets";
import { ceilCm, twDevLengths } from "../lib/twDevLength";

// Taiwan 112 development / lap lengths (cm) for the bar sizes a beam section
// uses — the equations behind 標準圖 RC02/RC03, shown in the units Taiwan
// drawings use (cm). `fck`/`fy` arrive in MPa; the code pairs 280↔28, 4200↔420
// kgf/cm² ↔ MPa as exact decades, so ×10 is the code's own conversion.
export function DevLengthBlock({ fck, fy, materialDB, bars }: { fck: number; fy: number; materialDB: string; bars: string[] }) {
  const { t } = useI18n();
  const names = [...new Set(bars.filter(Boolean))];
  const rows = names
    .map((name) => {
      const mm = toModelDiameter(materialDB, name, "mm");
      const r = mm ? twDevLengths(fck * 10, fy * 10, mm / 10) : null;
      return r ? { name, r } : null;
    })
    .filter((x): x is { name: string; r: NonNullable<ReturnType<typeof twDevLengths>> } => !!x);
  if (!rows.length) return null;
  return (
    <div className="judge-block">
      <div className="judge-title">{t("board.twDev.title")}</div>
      <table className="dev-table">
        <thead>
          <tr>
            <th>{t("board.twDev.bar")}</th>
            <th>ℓd</th>
            <th>ℓd ({t("board.twDev.top")})</th>
            <th>ℓst B</th>
            <th>ℓst B ({t("board.twDev.top")})</th>
            <th>ℓdc</th>
            <th>ℓdh</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, r }) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{ceilCm(r.ld)}</td>
              <td>{ceilCm(r.ldTop)}</td>
              <td>{ceilCm(r.lapB)}</td>
              <td>{ceilCm(r.lapBTop)}</td>
              <td>{ceilCm(r.ldc)}</td>
              <td>{ceilCm(r.ldh)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint detail-note">{t("board.twDev.note", { fc: Math.round(fck * 10), fy: Math.round(fy * 10) })}</div>
    </div>
  );
}
