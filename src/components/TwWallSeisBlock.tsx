import { useI18n } from "../i18n/useI18n";
import type { TwWallResult } from "../lib/twWallSeismic";

// Taiwan 112 special structural wall web-steel rules (18.7.2) in the wall
// drawer. Advisory — never part of Gen NX's OK/NG.
export function TwWallSeisBlock({ res, waiting }: { res: TwWallResult; waiting: boolean }) {
  const { t } = useI18n();
  return (
    <div className="judge-block detail-block">
      <div className="judge-title">{t("board.twWall.title")}</div>
      {waiting && <div className="hint detail-note">{t("board.twWall.wait")}</div>}
      {res.rhoV != null && res.rhoH != null && (
        <div className="seis-mu">{t("board.twWall.rho", { v: res.rhoV, h: res.rhoH })}</div>
      )}
      {res.issues.length === 0 ? (
        !waiting && <div className="detail-ok">{t("board.twWall.ok")}</div>
      ) : (
        <ul className="detail-list">
          {res.issues.map((d, i) => (
            <li key={i}>{t(`board.twWall.${d.kind}`, { actual: d.actual, limit: d.limit })}</li>
          ))}
        </ul>
      )}
      <div className="hint detail-note">{t("board.twWall.note")}</div>
    </div>
  );
}
