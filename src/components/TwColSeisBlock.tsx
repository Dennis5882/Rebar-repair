import { useI18n } from "../i18n/useI18n";
import type { TwColResult } from "../lib/twColumnSeismic";

// Taiwan 112 special-moment-frame column rules (18.4) in the column drawer.
// Advisory — never part of Gen NX's OK/NG.
export interface TwScwbCell {
  ratio: number | null;
  failing: number;
  checked: number;
  maxBeamDia: number;
  colSmallSide: number; // mm
  fy: number;
}

export function TwColSeisBlock({ res, waiting, scwb, scwbLoading }: { res: TwColResult; waiting: boolean; scwb?: TwScwbCell | null; scwbLoading?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="judge-block detail-block">
      <div className="judge-title">{t("board.twCol.title")}</div>
      {waiting && <div className="hint detail-note">{t("board.twCol.wait")}</div>}
      {scwbLoading && <div className="hint detail-note">{t("board.twCol.scwbLoading")}</div>}
      {scwb && scwb.ratio != null && (
        <div className={"seis-mu" + (scwb.failing > 0 ? " over" : "")}>
          {t(scwb.failing > 0 ? "board.twCol.scwbFail" : "board.twCol.scwbOk", { ratio: scwb.ratio.toFixed(2), failing: scwb.failing, checked: scwb.checked })}
        </div>
      )}
      {scwb && scwb.ratio == null && !scwbLoading && !waiting && <div className="hint detail-note">{t("board.twCol.scwbNone")}</div>}
      {scwb && scwb.maxBeamDia > 0 && (() => {
        const mult = scwb.fy <= 420 ? 20 : scwb.fy <= 490 ? 23 : 26;
        const need = mult * scwb.maxBeamDia;
        return scwb.colSmallSide < need - 1e-6 ? (
          <div className="seis-mu over">{t("board.twCol.joint", { actual: Math.round(scwb.colSmallSide), limit: Math.round(need) })}</div>
        ) : null;
      })()}
      {res.lo != null && <div className="seis-mu">{t("board.twCol.lo", { lo: Math.round(res.lo) })}</div>}
      {res.issues.length === 0 ? (
        !waiting && <div className="detail-ok">{t("board.twCol.ok")}</div>
      ) : (
        <ul className="detail-list">
          {res.issues.map((d, i) => (
            <li key={i}>{t(`board.twCol.${d.kind}`, { actual: d.actual, limit: d.limit })}</li>
          ))}
        </ul>
      )}
      <div className="hint detail-note">{t("board.twCol.note")}</div>
    </div>
  );
}
