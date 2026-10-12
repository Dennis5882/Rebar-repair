import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { exportReport, type ConnInfo } from "../lib/api";
import { errText } from "../lib/errText";
import { REPORT_MODES, normalizeExportPath, type ReportBy, type ReportMember, type ReportMode } from "../lib/reportArgs";
import { useEscapeClose } from "../lib/useEscapeClose";

// Targets the drawer can export. Beam/column/brace boards pass element ids
// (by-member) and section ids (by-section); the wall board passes Wall IDs.
export interface ReportTargets {
  label: string;
  elemKeys?: string[];
  sectionIds?: string[];
  wallIds?: string[];
}

interface Props {
  member: ReportMember;
  open: boolean;
  onClose: () => void;
  conn: ConnInfo;
  selected: ReportTargets | null; // the board's selected section/wall group, if any
  all: ReportTargets; // everything currently loaded on the board
}

// A folder every Windows PC has. Gen NX answers SUCCESS but writes nothing
// when the folder doesn't exist (live-verified), so the default must exist.
const DEFAULT_DIR = "C:/Users/Public/Documents/";
const DIR_KEY = "reportDir";

function readDir(): string {
  try {
    return localStorage.getItem(DIR_KEY) || DEFAULT_DIR;
  } catch {
    return DEFAULT_DIR;
  }
}

const MODE_LABEL: Record<ReportMode, string> = {
  Graphic: "report.modeGraphic",
  Detail: "report.modeDetail",
  Summary: "report.modeSummary",
  PMCurve: "report.modePMCurve",
};
const BY_LABEL: Record<ReportBy, string> = {
  MEMB: "report.byMemb",
  PROP: "report.byProp",
  "WID+STORY": "report.byWidStory",
  WID: "report.byWid",
};

type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; filePath: string } | { kind: "err"; text: string };

export function ReportDrawer({ member, open, onClose, conn, selected, all }: Props) {
  const { t } = useI18n();
  const isWall = member === "WALL";
  const byOptions: ReportBy[] = isWall ? ["WID+STORY", "WID"] : ["MEMB", "PROP"];

  const [scope, setScope] = useState<"selected" | "all">(selected ? "selected" : "all");
  const [by, setBy] = useState<ReportBy>(byOptions[0]);
  const [mode, setMode] = useState<ReportMode>("Detail");
  const [pos, setPos] = useState({ endI: true, mid: true, endJ: true });
  const [dir, setDir] = useState(readDir);
  const [name, setName] = useState("");
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  useEscapeClose(open, onClose);

  // Re-aim at the selection each time the drawer opens; a stale result from
  // the previous export shouldn't greet the next one.
  useEffect(() => {
    if (!open) return;
    setScope(selected ? "selected" : "all");
    setSend({ kind: "idle" });
  }, [open, selected]);

  const modes = REPORT_MODES[by];
  // Switching "by" can leave an impossible mode (Detail by section) — fall back.
  useEffect(() => {
    if (!modes.includes(mode)) setMode(modes[0]);
  }, [by, modes, mode]);

  const target = scope === "selected" && selected ? selected : all;
  const count = isWall
    ? (target.wallIds?.length ?? 0)
    : by === "MEMB"
      ? (target.elemKeys?.length ?? 0)
      : (target.sectionIds?.filter((s) => /^\d+$/.test(s)).length ?? 0);
  const dirOk = normalizeExportPath(dir) !== null;
  const canExport = dirOk && (isWall || count > 0) && send.kind !== "sending";

  const handleExport = useCallback(async () => {
    try {
      localStorage.setItem(DIR_KEY, dir);
    } catch {
      /* private mode — the folder just won't be remembered */
    }
    setSend({ kind: "sending" });
    const res = await exportReport(
      {
        member,
        by,
        mode,
        elemKeys: target.elemKeys,
        sectionIds: target.sectionIds,
        wallIds: target.wallIds,
        positions: pos,
        exportPath: dir,
        outputName: name.trim() || undefined,
      },
      conn,
    );
    if (res.ok) setSend({ kind: "ok", filePath: res.filePath });
    else setSend({ kind: "err", text: errText(t, res) || t("report.err.generic") });
  }, [member, by, mode, target, pos, dir, name, conn, t]);

  return (
    <>
      <div className={"guide-backdrop" + (open ? " open" : "")} onClick={onClose} />
      <aside className={"guide-drawer conn-drawer report-drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="guide-drawer-header">
          <h2 style={{ margin: 0, fontSize: 13, textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}>
            {t("report.title")}
          </h2>
          <button type="button" className="guide-close" onClick={onClose} aria-label={t("report.closeBtn")}>
            ×
          </button>
        </div>
        <div className="guide-drawer-body">
          <p className="hint" style={{ marginTop: 0 }}>
            {t("report.intro")}
          </p>

          <div className="field">
            <label>{t("report.scopeLabel")}</label>
            <div className="report-choices">
              <label className={"report-choice" + (!selected ? " disabled" : "")}>
                <input type="radio" name="rp-scope" checked={scope === "selected"} disabled={!selected} onChange={() => setScope("selected")} />
                <span>{selected ? t("report.scopeSelected", { name: selected.label }) : t("report.scopeSelectedNone")}</span>
              </label>
              <label className="report-choice">
                <input type="radio" name="rp-scope" checked={scope === "all"} onChange={() => setScope("all")} />
                <span>{t("report.scopeAll", { name: all.label })}</span>
              </label>
            </div>
          </div>

          <div className="field">
            <label>{t("report.byLabel")}</label>
            <div className="modeseg">
              {byOptions.map((b) => (
                <button key={b} type="button" className={by === b ? "on" : ""} onClick={() => setBy(b)}>
                  {t(BY_LABEL[b])}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t("report.modeLabel")}</label>
            <div className="modeseg">
              {(isWall ? (["Graphic", "Detail", "Summary", "PMCurve"] as ReportMode[]) : (["Graphic", "Detail", "Summary"] as ReportMode[])).map((m) => (
                <button key={m} type="button" className={mode === m ? "on" : ""} disabled={!modes.includes(m)} onClick={() => setMode(m)}>
                  {t(MODE_LABEL[m])}
                </button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>{t(`report.modeHint.${mode}`)}</div>
          </div>

          {mode === "Detail" && !isWall && (
            <div className="field">
              <label>{t("report.positionsLabel")}</label>
              <div className="report-choices row">
                {(["endI", "mid", "endJ"] as const).map((k) => (
                  <label key={k} className="report-choice">
                    <input type="checkbox" checked={pos[k]} onChange={(e) => setPos((p) => ({ ...p, [k]: e.target.checked }))} />
                    <span>{t(`report.pos.${k}`)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="rp-dir">{t("report.dirLabel")}</label>
            <input id="rp-dir" type="text" value={dir} onChange={(e) => setDir(e.target.value)} spellCheck={false} style={{ fontFamily: "var(--mono)" }} />
            <div className="hint" style={{ marginTop: 6 }}>{dirOk ? t("report.dirHint") : t("report.err.badPath")}</div>
          </div>

          <div className="field">
            <label htmlFor="rp-name">{t("report.nameLabel")}</label>
            <input id="rp-name" type="text" value={name} placeholder={`${member}_${by.replace("+", "_")}_${mode}`} onChange={(e) => setName(e.target.value)} spellCheck={false} />
          </div>

          <div className="btn-row">
            <button className="btn primary" type="button" disabled={!canExport} onClick={handleExport}>
              {send.kind === "sending" ? t("report.exportingBtn") : t("report.exportBtn", { n: isWall && count === 0 ? t("report.allWalls") : count })}
            </button>
          </div>
          {send.kind === "ok" && <div className="status show ok">{t("report.okMsg", { path: send.filePath })}</div>}
          {send.kind === "err" && <div className="status show err">{send.text}</div>}
        </div>
      </aside>
    </>
  );
}
