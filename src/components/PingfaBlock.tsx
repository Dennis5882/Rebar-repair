import { useI18n } from "../i18n/useI18n";

// 平法 (22G101-1) 集中标注 block for the column / wall drawers. Bar grade
// letters come from the Gen NX check table's fy/fys, so until a 재검토 there
// is nothing to show (`lines` null ⇒ the wait note).
export function PingfaBlock({ lines, noteKey }: { lines: string[] | null; noteKey: string }) {
  const { t } = useI18n();
  return (
    <div className="judge-block pingfa-block">
      <div className="judge-title">{t("board.pingfaTitle")}</div>
      {lines ? (
        <>
          <div className="pingfa-sub">{t("board.pingfaJizhong")}</div>
          <div className="pingfa-lines mono">
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <div className="hint detail-note">{t(noteKey)}</div>
        </>
      ) : (
        <div className="hint detail-note">{t("board.pingfaWaitMember")}</div>
      )}
    </div>
  );
}
