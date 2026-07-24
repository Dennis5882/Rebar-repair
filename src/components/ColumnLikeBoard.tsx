import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { listMemberSections, saveRebar, sectionGroupLabel, type MemberSectionGroup } from "../lib/api";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
import { compressKeyRanges } from "../lib/keyRange";
import { EMPTY_COLUMN_FORM, buildColumnPayload, fillColumnForm, type FormState } from "../lib/columnRebarForm";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import type { ColumnLikePayload, MemberType } from "../types/rebar";

// Section-centric board shared by the COLUMN and BRACE tabs — every section on
// one screen (row = section), summary strip, search/sort, and a per-section
// detail editor. COLUMN and BRACE share the REBC/REBR shape (BRACE is REBC
// minus the corner bar + hook type), so `isColumn` toggles just those two
// extra controls. Deliberately WITHOUT a live OK/NG verdict — there is no
// in-browser check engine for these member types yet ("board UX only" pass).
// REBC/REBR are section-keyed, so one row = one section = one saved record
// applied to every element using it.

type ColGroup = MemberSectionGroup<ColumnLikePayload>;

interface ColRowState {
  form: FormState;
  b: string; // section width, mm (preview only)
  h: string; // section depth, mm (preview only)
  dirty: boolean;
}

const DEFAULT_B = "500";
const DEFAULT_H = "500";

function colRowFromGroup(grp: ColGroup, isColumn: boolean): ColRowState {
  return {
    form: fillColumnForm(grp.payload, isColumn, EMPTY_COLUMN_FORM.hoopType),
    b: grp.dimB != null ? String(Math.round(grp.dimB)) : DEFAULT_B,
    h: grp.dimH != null ? String(Math.round(grp.dimH)) : DEFAULT_H,
    dirty: false,
  };
}

function mainCell(f: FormState) {
  if (!f.mainNum || !f.mainName) return "—";
  return (
    <>
      <b>{f.mainNum}</b>×<span className="bar-main">{f.mainName}</span>
    </>
  );
}
function hoopCell(name: string, legY: string, legZ: string, dist: string) {
  if (!name) return "—";
  return (
    <>
      <span className="bar-stir">{name}</span> {legY || "?"}×{legZ || "?"}@{dist || "?"}
    </>
  );
}

interface Props {
  type: Extract<MemberType, "COLUMN" | "BRACE">;
  isColumn: boolean;
  ns: string; // i18n namespace for board-specific strings ("cboard" / "bboard")
  mainPlaceholder: string;
  hoopPlaceholder: string;
}

export function ColumnLikeBoard({ type, isColumn, ns, mainPlaceholder, hoopPlaceholder }: Props) {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const k = (suffix: string) => `${ns}.${suffix}`;

  const [sections, setSections] = useState<Record<string, ColGroup>>({});
  // The model's active length unit, from the endpoint (authoritative). COLUMN/
  // BRACE cover (DO) and hoop DIST are shown in this unit, not converted to mm,
  // matching the footer disclaimer and the old forms.
  const [boardUnit, setBoardUnit] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  const [rows, setRows] = useState<Record<string, ColRowState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [savingSid, setSavingSid] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<StatusMsg | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"default" | "name" | "members">("default");

  const unit = boardUnit || lengthUnit;

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listMemberSections<ColumnLikePayload>(type, conn);
      if (!res.ok) {
        setStatus({ ok: false, kind: "listFail", res });
        return;
      }
      setSections(res.sections);
      setBoardUnit(res.unit || "");
      setListLoadedOnce(true);
      setStatus({ ok: true, kind: "sectionsLoaded", count: Object.keys(res.sections).length });
    } catch (e) {
      setStatus({ ok: false, kind: "listError", error: String(e) });
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    const sids = Object.keys(sections);
    const next: Record<string, ColRowState> = {};
    for (const sid of sids) next[sid] = colRowFromGroup(sections[sid], isColumn);
    setRows(next);
    setOrder(sids);
    setSelectedSid(sids.length ? sids[0] : null);
  }, [sections, isColumn]);

  useEffect(() => setActionMsg(null), [selectedSid]);

  const summary = useMemo(() => {
    let dirty = 0;
    for (const sid of order) if (rows[sid]?.dirty) dirty++;
    return { total: order.length, dirty };
  }, [order, rows]);

  const visibleOrder = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = order.filter((sid) => {
      if (!q) return true;
      const name = (sections[sid]?.name || sid).toLowerCase();
      return name.includes(q);
    });
    if (sortKey === "name")
      list = [...list].sort((a, b) => (sections[a]?.name || a).localeCompare(sections[b]?.name || b, undefined, { numeric: true }));
    else if (sortKey === "members")
      list = [...list].sort((a, b) => (sections[b]?.elementKeys.length || 0) - (sections[a]?.elementKeys.length || 0));
    return list;
  }, [order, query, sortKey, sections]);

  function updateField<K extends keyof FormState>(sid: string, field: K, value: FormState[K]) {
    setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], form: { ...prev[sid].form, [field]: value }, dirty: true } }));
  }
  function patchDim(sid: string, patch: Partial<Pick<ColRowState, "b" | "h">>) {
    setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch, dirty: true } }));
  }

  async function saveGroup(sid: string) {
    const r = rows[sid];
    const grp = sections[sid];
    if (!r || !grp) return;
    const payload = buildColumnPayload(r.form, isColumn);
    setSavingSid(sid);
    setActionMsg({ ok: true, kind: "saving" });
    try {
      // REBC/REBR are keyed by SECTION number — a single write with the
      // section id as key applies to every element using that section.
      const res = await saveRebar(type, sid, payload, conn);
      if (!res.ok) {
        setActionMsg({ ok: false, kind: "saveFail", res });
        return;
      }
      setActionMsg({ ok: true, kind: "saveDone" });
      setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], dirty: false } }));
    } catch (e) {
      setActionMsg({ ok: false, kind: "saveError", error: String(e) });
    } finally {
      setSavingSid(null);
    }
  }

  const selected = selectedSid ? rows[selectedSid] : null;
  const selectedGrp = selectedSid ? sections[selectedSid] : null;
  const afterPayload = useMemo(() => (selected ? buildColumnPayload(selected.form, isColumn) : null), [selected, isColumn]);
  const unitSuffix = unit ? ` (${unit})` : "";

  return (
    <div className="beam-board">
      {/* --- toolbar --- */}
      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleList} disabled={listLoading}>
            {listLoading ? t(k("loadingBtn")) : t(k("loadBtn"))}
          </button>
        </div>
        {status && (
          <div className={"status show " + statusClass(status)} style={{ marginTop: 8 }}>
            {statusText(t, status)}
          </div>
        )}
      </div>

      {/* --- summary strip --- */}
      {order.length > 0 && (
        <div className="board-summary">
          <div className="stat"><div className="k">{t(k("summaryTotal"))}</div><div className="v">{summary.total}</div></div>
          <div className="stat"><div className="k">{t("board.summaryChanged")}</div><div className="v">{summary.dirty}</div></div>
        </div>
      )}

      {/* --- board table --- */}
      <div className="board-wrap">
        <div className="board-head">
          <h2>
            {t(k("title"))}{" "}
            {order.length > 0 && (
              <span className="board-count">
                {visibleOrder.length === order.length
                  ? `(${order.length})`
                  : `(${t("board.countFiltered", { shown: visibleOrder.length, total: order.length })})`}
              </span>
            )}
          </h2>
          <span className="board-hint">{t(k("tableHint"))}</span>
        </div>
        {order.length > 0 && (
          <div className="board-filter">
            <input
              className="board-search"
              type="search"
              placeholder={t("board.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="board-sort">
              <span>{t("board.sortLabel")}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                <option value="default">{t("board.sortDefault")}</option>
                <option value="name">{t("board.sortName")}</option>
                <option value="members">{t("board.sortMembers")}</option>
              </select>
            </label>
          </div>
        )}
        <div className="table-scroll">
          <table className="board-table">
            <thead>
              <tr>
                <th>{t("board.colSection")}</th>
                <th>{t("board.colElements")}</th>
                <th>{t(k("colMain"))}</th>
                <th>{t(k("colEndHoop"))}</th>
                <th>{t(k("colCenHoop"))}</th>
                <th>{t(k("colCover"))}</th>
                <th>{t(k("colHoopType"))}</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrder.map((sid) => {
                const r = rows[sid];
                const grp = sections[sid];
                if (!r || !grp) return null;
                const f = r.form;
                return (
                  <tr key={sid} className={sid === selectedSid ? "sel" : ""} onClick={() => setSelectedSid(sid)}>
                    <td className="cell-section">
                      <span className="dirty-dot" style={{ visibility: r.dirty ? "visible" : "hidden" }} />
                      <span className="sect-nm">{grp.name || sid}</span>
                    </td>
                    <td><span className="elem-badge" title={compressKeyRanges(grp.elementKeys)}>{t("board.memberCount", { count: grp.elementKeys.length })}</span></td>
                    <td className="mono">{mainCell(f)}</td>
                    <td className="mono">{hoopCell(f.endName, f.endLegY, f.endLegZ, f.endDist)}</td>
                    <td className="mono">{hoopCell(f.cenName, f.cenLegY, f.cenLegZ, f.cenDist)}</td>
                    <td className="mono">{f.doVal || "—"}</td>
                    <td className="mono">{f.hoopType}</td>
                  </tr>
                );
              })}
              {order.length === 0 && (
                <tr>
                  <td colSpan={7} className="board-empty">{listLoadedOnce ? t(k("emptyList")) : t(k("notLoaded"))}</td>
                </tr>
              )}
              {order.length > 0 && visibleOrder.length === 0 && (
                <tr>
                  <td colSpan={7} className="board-empty">{t("board.filterEmpty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- detail drawer --- */}
      {selected && selectedGrp && selectedSid && (
        <div className="board-detail">
          <div className="panel board-preview-card">
            <div className="board-detail-head">
              <div>
                <div className="detail-nm">{sectionGroupLabel(t, selectedSid, selectedGrp)}</div>
                <div className="detail-el">{t("board.appliesTo", { count: selectedGrp.elementKeys.length, keys: compressKeyRanges(selectedGrp.elementKeys) })}</div>
              </div>
            </div>
            <SectionPreview
              type={type}
              titleKey="common.previewTitleSimple"
              before={selectedGrp.payload}
              after={afterPayload}
              dims={{ B: selected.b, H: selected.h }}
              legend={
                <>
                  <span><i className="dot" style={{ background: "var(--main-bar)" }} />{t("common.mainBar")}</span>
                  {isColumn && <span><i className="dot" style={{ background: "var(--corner)" }} />{t("column.cornerBar")}</span>}
                  <span><i className="dot" style={{ background: "var(--hoop)" }} />{t("common.hoop")}</span>
                </>
              }
            />
          </div>

          <div className="panel board-editor-card">
            <div className="subhead">{t("common.mainBarTitle")}</div>
            <div className="row3">
              <div className="field">
                <label>{t("common.spec")}</label>
                <BarSelect id="clb-mainName" placeholder={mainPlaceholder} value={selected.form.mainName} onChange={(v) => updateField(selectedSid, "mainName", v)} />
              </div>
              <div className="field">
                <label>{t("common.totalCount")}</label>
                <input type="number" value={selected.form.mainNum} onChange={(e) => updateField(selectedSid, "mainNum", e.target.value)} />
              </div>
              <div className="field">
                <label>{t("common.rowCount")}</label>
                <input type="number" value={selected.form.mainRow} onChange={(e) => updateField(selectedSid, "mainRow", e.target.value)} />
              </div>
            </div>

            {isColumn && (
              <>
                <div className="checkline">
                  <input id="clb-useCorner" type="checkbox" checked={selected.form.useCorner} onChange={(e) => updateField(selectedSid, "useCorner", e.target.checked)} />
                  <label htmlFor="clb-useCorner" style={{ margin: 0 }}>{t("column.useCorner")}</label>
                </div>
                {selected.form.useCorner && (
                  <div className="field">
                    <label>{t("column.cornerSpec")}</label>
                    <BarSelect id="clb-cornerName" placeholder="D29" value={selected.form.cornerName} onChange={(v) => updateField(selectedSid, "cornerName", v)} />
                  </div>
                )}
              </>
            )}

            <div className="subhead">{t("common.endHoopTitle")}</div>
            <div className="row4">
              <div className="field">
                <label>{t("common.spec")}</label>
                <BarSelect id="clb-endName" placeholder={hoopPlaceholder} value={selected.form.endName} onChange={(v) => updateField(selectedSid, "endName", v)} />
              </div>
              <div className="field"><label>{t("common.legY")}</label><input type="number" value={selected.form.endLegY} onChange={(e) => updateField(selectedSid, "endLegY", e.target.value)} /></div>
              <div className="field"><label>{t("common.legZ")}</label><input type="number" value={selected.form.endLegZ} onChange={(e) => updateField(selectedSid, "endLegZ", e.target.value)} /></div>
              <div className="field"><label>{t("common.dist")}{unitSuffix}</label><input type="number" step="any" value={selected.form.endDist} onChange={(e) => updateField(selectedSid, "endDist", e.target.value)} /></div>
            </div>

            <div className="subhead">{t("common.cenHoopTitle")}</div>
            <div className="row4">
              <div className="field">
                <label>{t("common.spec")}</label>
                <BarSelect id="clb-cenName" placeholder={hoopPlaceholder} value={selected.form.cenName} onChange={(v) => updateField(selectedSid, "cenName", v)} />
              </div>
              <div className="field"><label>{t("common.legY")}</label><input type="number" value={selected.form.cenLegY} onChange={(e) => updateField(selectedSid, "cenLegY", e.target.value)} /></div>
              <div className="field"><label>{t("common.legZ")}</label><input type="number" value={selected.form.cenLegZ} onChange={(e) => updateField(selectedSid, "cenLegZ", e.target.value)} /></div>
              <div className="field"><label>{t("common.dist")}{unitSuffix}</label><input type="number" step="any" value={selected.form.cenDist} onChange={(e) => updateField(selectedSid, "cenDist", e.target.value)} /></div>
            </div>

            <div className="subhead">{t("common.etcTitle")}</div>
            <div className={isColumn ? "row3" : "row2"}>
              <div className="field">
                <label>{t("common.coverDO")}{unitSuffix}</label>
                <input type="number" step="any" value={selected.form.doVal} onChange={(e) => updateField(selectedSid, "doVal", e.target.value)} />
              </div>
              <div className="field">
                <label>{t("common.hoopType")}</label>
                <select value={selected.form.hoopType} onChange={(e) => updateField(selectedSid, "hoopType", e.target.value)}>
                  <option value="Ties">Ties</option>
                  <option value="Spirals">Spirals</option>
                </select>
              </div>
              {isColumn && (
                <div className="field">
                  <label>{t("column.hookType")}</label>
                  <select value={selected.form.hookType} onChange={(e) => updateField(selectedSid, "hookType", e.target.value)}>
                    <option value="0">{t("column.hookType90")}</option>
                    <option value="1">{t("column.hookTypeBoth")}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="subhead">{t("common.dimsHintTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("common.widthB")}</label><input type="number" value={selected.b} onChange={(e) => patchDim(selectedSid, { b: e.target.value })} /></div>
              <div className="field"><label>{t("common.heightH")}</label><input type="number" value={selected.h} onChange={(e) => patchDim(selectedSid, { h: e.target.value })} /></div>
            </div>

            {/* --- action bar --- */}
            <div className="board-actions">
              <button className="btn primary" type="button" onClick={() => saveGroup(selectedSid)} disabled={savingSid === selectedSid}>
                {t("board.saveGroupBtn", { count: selectedGrp.elementKeys.length })}
              </button>
              <span className="hint save-note">{selected.dirty ? t("board.unsavedNote") : t("board.savedNote")}</span>
            </div>
            {actionMsg && <div className={"status show " + statusClass(actionMsg)}>{statusText(t, actionMsg)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
