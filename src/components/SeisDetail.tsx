import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";
import type { SeisIssue } from "../lib/gbSeismic";

// GB seismic (抗震等级) checks on the column / wall boards: the axial-ratio
// table cell and the drawer list. Advisory, like the beam board's detailing
// block — never part of the Gen NX OK/NG.

interface SeisRes {
  issues: SeisIssue[];
  mu: number | null;
  muLimit: number | null;
}

/** "0.04 / 0.75" axial ratio cell; red over the limit, dash until checked. */
export function SeisCell({ res }: { res?: SeisRes }) {
  if (!res || res.mu == null) return <td className="mono cell-mu">—</td>;
  const over = res.muLimit != null && res.mu > res.muLimit;
  return (
    <td className={"mono cell-mu" + (over ? " over" : "")}>
      {res.mu.toFixed(2)}
      {res.muLimit != null && <small> / {res.muLimit.toFixed(2)}</small>}
    </td>
  );
}

export function SeisDetail({ res, member, waiting }: { res: SeisRes; member: "column" | "wall"; waiting: boolean }) {
  const { t } = useI18n();
  const { gbGrade } = useDesignCode();
  const grade = t(`designCode.gbGrade${gbGrade}`);
  return (
    <div className="judge-block detail-block">
      <div className="judge-title">{t("board.seisTitle", { grade })}</div>
      {waiting && <div className="hint detail-note">{t(member === "column" ? "board.seisWaitColumn" : "board.seisWaitWall")}</div>}
      {res.mu != null && (
        <div className="seis-mu">
          {t("board.seisMu", { mu: res.mu.toFixed(3), limit: res.muLimit != null ? res.muLimit.toFixed(2) : "—" })}
        </div>
      )}
      {res.issues.length === 0 ? (
        !waiting && <div className="detail-ok">{t("board.seisOk")}</div>
      ) : (
        <ul className="detail-list">
          {res.issues.map((d, i) => (
            <li key={i}>{t(`board.seis.${d.kind}`, { actual: d.actual, limit: d.limit })}</li>
          ))}
        </ul>
      )}
      <div className="hint detail-note">{t(member === "column" ? "board.seisNoteColumn" : "board.seisNoteWall")}</div>
    </div>
  );
}
