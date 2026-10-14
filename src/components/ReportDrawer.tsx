import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { exportReport, type ConnInfo } from "../lib/api";
import { errText } from "../lib/errText";
import { REPORT_MODES, normalizeExportPath, type ReportBy, type ReportMember, type ReportMode } from "../lib/reportArgs";
import { useEscapeClose } from "../lib/useEscapeClose";

// Preselection handed in by the boards: the selected row's element ids
// (by-member) / section ids (by-section) / Wall IDs.
export interface ReportTargets {
  label: string;
  elemKeys?: string[];
  sectionIds?: string[];
  wallIds?: string[];
}

// One checkable row in the drawer's target list (Gen NX result-dialog style).
export interface ReportItem {
  key: string;
  label: string;
  sub?: string;
  ok?: boolean; // Gen NX / estimate verdict, undefined = not judged yet
  rat?: number; // governing demand/capacity ratio
}

/** Verdict fields of an item from a board's per-section/wall verdict. */
export function reportVerdict(v: { ok?: boolean; ratFlex?: number; ratPM?: number; ratShear?: number } | undefined): Pick<ReportItem, "ok" | "rat"> {
  const rats = [v?.ratFlex, v?.ratPM, v?.ratShear].filter((x): x is number => typeof x === "number");
  return { ok: v?.ok, rat: rats.length ? Math.max(...rats) : undefined };
}
type VerdictFilter = "all" | "ok" | "ng";
// Which list a "by" reads: elements (by member), sections (by property), walls.
export interface ReportLists {
  memb?: ReportItem[];
  prop?: ReportItem[];
  wall?: ReportItem[];
}

interface Props {
  member: ReportMember;
  open: boolean;
  onClose: () => void;
  conn: ConnInfo;
  selected: ReportTargets | null; // the board's selected section/wall group, if any (preselected in the list)
  lists: ReportLists; // everything currently loaded on the board
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

type ListKey = "memb" | "prop" | "wall";
type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; filePath: string } | { kind: "err"; text: string };

export function ReportDrawer({ member, open, onClose, conn, selected, lists }: Props) {
  const { t } = useI18n();
  const isWall = member === "WALL";
  const byOptions: ReportBy[] = isWall ? ["WID+STORY", "WID"] : ["MEMB", "PROP"];

  const [by, setBy] = useState<ReportBy>(byOptions[0]);
  const [mode, setMode] = useState<ReportMode>("Detail");
  const [pos, setPos] = useState({ endI: true, mid: true, endJ: true });
  const [dir, setDir] = useState(readDir);
  const [name, setName] = useState("");
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [vf, setVf] = useState<VerdictFilter>("all");
  const [copied, setCopied] = useState(false);
  // Checked keys per list. Preselects the board's selected row, else everything.
  const [checked, setChecked] = useState<Record<ListKey, Set<string>>>({ memb: new Set(), prop: new Set(), wall: new Set() });
  useEscapeClose(open, onClose);

  // Re-aim at the selection each time the drawer opens; a stale result from
  // the previous export shouldn't greet the next one.
  useEffect(() => {
    if (!open) return;
    const pick = (items: ReportItem[] | undefined, sel: string[] | undefined) =>
      new Set(sel ? items?.filter((i) => sel.includes(i.key)).map((i) => i.key) : items?.map((i) => i.key));
    setChecked({
      memb: pick(lists.memb, selected?.elemKeys),
      prop: pick(lists.prop, selected?.sectionIds),
      wall: pick(lists.wall, selected?.wallIds),
    });
    setSend({ kind: "idle" });
  }, [open, selected, lists]);

  const modes = REPORT_MODES[by];
  // Switching "by" can leave an impossible mode (Detail by section) — fall back.
  useEffect(() => {
    if (!modes.includes(mode)) setMode(modes[0]);
  }, [by, modes, mode]);

  const listKey: ListKey = isWall ? "wall" : by === "MEMB" ? "memb" : "prop";
  // The filter narrows what is shown AND exported — what you see is what prints.
  const items = (lists[listKey] ?? []).filter((i) => vf === "all" || (vf === "ok" ? i.ok === true : i.ok === false));
  const sel = checked[listKey];
  const picked = items.filter((i) => sel.has(i.key)).map((i) => i.key);
  const count = picked.length;
  const target = {
    elemKeys: listKey === "memb" ? picked : undefined,
    sectionIds: listKey === "prop" ? picked : undefined,
    wallIds: listKey === "wall" ? picked : undefined,
  };
  const setList = (next: Set<string>) => setChecked((c) => ({ ...c, [listKey]: next }));
  // Select all / none act on the rows currently shown (filter-aware).
  const selectShown = (on: boolean) => {
    const next = new Set(sel);
    for (const i of items) {
      if (on) next.add(i.key);
      else next.delete(i.key);
    }
    setList(next);
  };
  const toggle = (key: string) => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setList(next);
  };
  const dirOk = normalizeExportPath(dir) !== null;
  const canExport = dirOk && count > 0 && send.kind !== "sending";

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
    if (res.ok) {
      setCopied(false);
      setSend({ kind: "ok", filePath: res.filePath });
    } else setSend({ kind: "err", text: errText(t, res) || t("report.err.generic") });
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
            <label>{t("report.scopeLabel", { n: count, total: items.length })}</label>
            <div className="btn-row" style={{ marginBottom: 6 }}>
              <button className="btn" type="button" onClick={() => selectShown(true)}>
                {t("report.listAll")}
              </button>
              <button className="btn" type="button" onClick={() => selectShown(false)}>
                {t("report.listNone")}
              </button>
              <div className="modeseg" style={{ marginLeft: "auto" }}>
                {(["all", "ok", "ng"] as const).map((f) => (
                  <button key={f} type="button" className={vf === f ? "on" : ""} onClick={() => setVf(f)}>
                    {t(`report.vf.${f}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="report-list">
              {items.length === 0 && <div className="hint">{t("report.listEmpty")}</div>}
              {items.map((i) => (
                <label key={i.key} className="report-list-row">
                  <input type="checkbox" checked={sel.has(i.key)} onChange={() => toggle(i.key)} />
                  <span className="report-list-key">{i.label}</span>
                  {i.sub && <span className="report-list-sub">{i.sub}</span>}
                  <span className={"report-list-v" + (i.ok === true ? " ok" : i.ok === false ? " ng" : "")}>
                    {i.ok == null ? "–" : (i.ok ? "OK" : "NG") + (i.rat != null ? " " + i.rat.toFixed(2) : "")}
                  </span>
                </label>
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
              {send.kind === "sending" ? t("report.exportingBtn") : t("report.exportBtn", { n: count })}
            </button>
          </div>
          {send.kind === "ok" && (
            <div className="status show ok">
              {t("report.okMsg", { path: send.filePath })}
              <button
                className="btn"
                type="button"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  const folder = send.filePath.replace(/[^/\\]*$/, "");
                  navigator.clipboard?.writeText(folder).then(
                    () => setCopied(true),
                    () => setCopied(false)
                  );
                }}
              >
                {copied ? t("report.copied") : t("report.copyFolder")}
              </button>
            </div>
          )}
          {send.kind === "err" && <div className="status show err">{send.text}</div>}
        </div>
      </aside>
    </>
  );
}
