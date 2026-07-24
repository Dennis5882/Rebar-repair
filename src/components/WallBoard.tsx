import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { getModelUnit, listRebar, saveRebar } from "../lib/api";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
import { EMPTY_WALL_FORM, buildWallItem, fillWallForm, segmentLabel, type WallFormState } from "../lib/wallRebarForm";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import type { WallItem, WallPayload } from "../types/rebar";

// The WALL tab's board. Walls don't fit the SECT-grouped section model the
// column/brace boards use — a wall is keyed by Wall ID and carries MULTIPLE
// segments (ITEMS: WallItem[], one per SUB_WALL_ID / story range). So this
// board lists REBW records (walls that already have rebar) with row = wall,
// and its detail editor edits one segment at a time, preserving the others on
// save (the exact concern the old WallForm handled). Like the other boards,
// no live verdict — REBW editing only.

interface WallRowState {
  items: WallItem[]; // working copy (edited); saved as { ITEMS: items }
  dirty: boolean;
}

function segSummary(items: WallItem[]) {
  const it = items[0] || {};
  const v = it.VERTICAL_REBAR || {};
  const h = it.HORIZONTAL_REBAR || {};
  return { v, h };
}

export function WallBoard() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();

  const [orig, setOrig] = useState<Record<string, WallPayload>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [boardUnit, setBoardUnit] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  const [rows, setRows] = useState<Record<string, WallRowState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [segIndex, setSegIndex] = useState(0);
  const [form, setForm] = useState<WallFormState>({ ...EMPTY_WALL_FORM });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<StatusMsg | null>(null);

  const [dispThk, setDispThk] = useState("300");
  const [dispLen, setDispLen] = useState("3000");

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"default" | "name">("default");

  const unit = boardUnit || lengthUnit;
  const unitSuffix = unit ? ` (${unit})` : "";

  async function handleList() {
    setListLoading(true);
    try {
      const [res, unitRes] = await Promise.all([listRebar<WallPayload>("WALL", conn), getModelUnit(conn)]);
      if (!res.ok) {
        setStatus({ ok: false, kind: "listFail", res });
        return;
      }
      setOrig(res.data);
      setNames(res.names || {});
      if (unitRes.ok) setBoardUnit(unitRes.unit || "");
      setListLoadedOnce(true);
      setStatus({ ok: true, kind: "sectionsLoaded", count: Object.keys(res.data).length });
    } catch (e) {
      setStatus({ ok: false, kind: "listError", error: String(e) });
    } finally {
      setListLoading(false);
    }
  }

  // Rebuild working rows from a fresh list (deep-ish copy of each segment so
  // edits never mutate the `orig` used to draw the "before" preview).
  useEffect(() => {
    const ids = Object.keys(orig);
    const next: Record<string, WallRowState> = {};
    for (const id of ids) next[id] = { items: (orig[id]?.ITEMS || []).map((it) => ({ ...it })), dirty: false };
    setRows(next);
    setOrder(ids);
    setSelectedId(ids.length ? ids[0] : null);
  }, [orig]);

  // Load the selected wall's first segment into the editable form.
  useEffect(() => {
    if (!selectedId) return;
    const items = rows[selectedId]?.items || [];
    setSegIndex(0);
    setForm(fillWallForm(items[0] || {}));
    setActionMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function selectSegment(i: number) {
    if (!selectedId) return;
    setSegIndex(i);
    setForm(fillWallForm(rows[selectedId]?.items[i] || {}));
  }

  // A field edit updates the form AND commits the rebuilt segment into the
  // working row (so the table summary, save payload, and dirty flag all track
  // it) without disturbing the other segments.
  function setField<K extends keyof WallFormState>(field: K, value: WallFormState[K]) {
    if (!selectedId) return;
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    setRows((prev) => {
      const row = prev[selectedId];
      if (!row) return prev;
      const items = row.items.slice();
      items[segIndex] = buildWallItem(nextForm);
      return { ...prev, [selectedId]: { items, dirty: true } };
    });
  }

  const summary = useMemo(() => {
    let dirty = 0;
    for (const id of order) if (rows[id]?.dirty) dirty++;
    return { total: order.length, dirty };
  }, [order, rows]);

  const visibleOrder = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = order.filter((id) => {
      if (!q) return true;
      return (names[id] || id).toLowerCase().includes(q);
    });
    if (sortKey === "name") list = [...list].sort((a, b) => (names[a] || a).localeCompare(names[b] || b, undefined, { numeric: true }));
    return list;
  }, [order, query, sortKey, names]);

  async function saveWall(id: string) {
    const row = rows[id];
    if (!row) return;
    const payload: WallPayload = { ITEMS: row.items };
    setSavingId(id);
    setActionMsg({ ok: true, kind: "saving" });
    try {
      const res = await saveRebar("WALL", id, payload, conn);
      if (!res.ok) {
        setActionMsg({ ok: false, kind: "saveFail", res });
        return;
      }
      setActionMsg({ ok: true, kind: "saveDone" });
      // Adopt the saved items as the new baseline so the "before" preview and
      // dirty flag reset to the just-saved state.
      setOrig((prev) => ({ ...prev, [id]: { ITEMS: row.items.map((it) => ({ ...it })) } }));
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], dirty: false } }));
    } catch (e) {
      setActionMsg({ ok: false, kind: "saveError", error: String(e) });
    } finally {
      setSavingId(null);
    }
  }

  const selectedRow = selectedId ? rows[selectedId] : null;
  const segCount = selectedRow?.items.length || 0;
  const beforeItem = selectedId ? orig[selectedId]?.ITEMS?.[segIndex] : undefined;
  const beforePayload = useMemo(() => (beforeItem ? { ITEMS: [beforeItem] } : null), [beforeItem]);
  const afterPayload = useMemo(() => ({ ITEMS: [buildWallItem(form)] }), [form]);

  return (
    <div className="beam-board">
      {/* --- toolbar --- */}
      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleList} disabled={listLoading}>
            {listLoading ? t("wboard.loadingBtn") : t("wboard.loadBtn")}
          </button>
        </div>
        {status && <div className={"status show " + statusClass(status)} style={{ marginTop: 8 }}>{statusText(t, status)}</div>}
      </div>

      {/* --- summary strip --- */}
      {order.length > 0 && (
        <div className="board-summary">
          <div className="stat"><div className="k">{t("wboard.summaryTotal")}</div><div className="v">{summary.total}</div></div>
          <div className="stat"><div className="k">{t("board.summaryChanged")}</div><div className="v">{summary.dirty}</div></div>
        </div>
      )}

      {/* --- board table --- */}
      <div className="board-wrap">
        <div className="board-head">
          <h2>
            {t("wboard.title")}{" "}
            {order.length > 0 && (
              <span className="board-count">
                {visibleOrder.length === order.length ? `(${order.length})` : `(${t("board.countFiltered", { shown: visibleOrder.length, total: order.length })})`}
              </span>
            )}
          </h2>
          <span className="board-hint">{t("wboard.tableHint")}</span>
        </div>
        {order.length > 0 && (
          <div className="board-filter">
            <input className="board-search" type="search" placeholder={t("wboard.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="board-sort">
              <span>{t("board.sortLabel")}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                <option value="default">{t("board.sortDefault")}</option>
                <option value="name">{t("board.sortName")}</option>
              </select>
            </label>
          </div>
        )}
        <div className="table-scroll">
          <table className="board-table">
            <thead>
              <tr>
                <th>{t("wboard.colWall")}</th>
                <th>{t("wboard.colSegments")}</th>
                <th>{t("wboard.colVertical")}</th>
                <th>{t("wboard.colHorizontal")}</th>
                <th>{t("wboard.colEnd")}</th>
                <th>{t("wboard.colCover")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrder.map((id) => {
                const row = rows[id];
                if (!row) return null;
                const { v, h } = segSummary(row.items);
                const it0 = row.items[0] || {};
                const er = it0.END_REBAR || {};
                const cc = it0.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
                return (
                  <tr key={id} className={id === selectedId ? "sel" : ""} onClick={() => setSelectedId(id)}>
                    <td className="cell-section">
                      <span className="dirty-dot" style={{ visibility: row.dirty ? "visible" : "hidden" }} />
                      <span className="sect-nm">{names[id] ? `${id}: ${names[id]}` : id}</span>
                    </td>
                    <td><span className="elem-badge">{t("wboard.segCount", { count: row.items.length })}</span></td>
                    <td className="mono">{v.NAME ? <><span className="bar-main">{v.NAME}</span>@{v.DIST ?? "?"}</> : "—"}</td>
                    <td className="mono">{h.NAME ? <><span className="bar-stir">{h.NAME}</span>@{h.DIST ?? "?"}</> : "—"}</td>
                    <td className="mono">{it0.USE_END_REBAR && er.NAME ? <><b>{er.NUM ?? "?"}</b>×{er.NAME}</> : "—"}</td>
                    <td className="mono">{cc.DW ?? "?"}/{cc.DE ?? "?"}</td>
                  </tr>
                );
              })}
              {order.length === 0 && (
                <tr><td colSpan={6} className="board-empty">{listLoadedOnce ? t("wboard.emptyList") : t("wboard.notLoaded")}</td></tr>
              )}
              {order.length > 0 && visibleOrder.length === 0 && (
                <tr><td colSpan={6} className="board-empty">{t("board.filterEmpty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- detail drawer --- */}
      {selectedRow && selectedId && (
        <div className="board-detail">
          <div className="panel board-preview-card">
            <div className="board-detail-head">
              <div>
                <div className="detail-nm">{names[selectedId] ? `${selectedId}: ${names[selectedId]}` : `Wall ${selectedId}`}</div>
                <div className="detail-el">{t("wboard.segCount", { count: segCount })}</div>
              </div>
            </div>
            <SectionPreview
              type="WALL"
              titleKey="wall.previewTitle"
              before={beforePayload}
              after={afterPayload}
              dims={{ THICKNESS: dispThk, LENGTH: dispLen }}
              singleColumn
              legend={
                <>
                  <span><i className="dot" style={{ background: "var(--main-bar)" }} />{t("wall.legendV")}</span>
                  <span><i className="dot" style={{ background: "var(--endbar)" }} />{t("wall.legendEnd")}</span>
                  <span><i className="dot" style={{ background: "var(--hoop)" }} />{t("wall.legendH")}</span>
                  <span><i className="dot" style={{ background: "var(--be-zone)" }} />{t("wall.legendBE")}</span>
                </>
              }
            />
          </div>

          <div className="panel board-editor-card">
            {segCount > 1 && (
              <div className="field">
                <label>{t("wall.segmentLabel")}</label>
                <select value={segIndex} onChange={(e) => selectSegment(Number(e.target.value))}>
                  {selectedRow.items.map((it, idx) => (
                    <option key={idx} value={idx}>{segmentLabel(it, idx)}</option>
                  ))}
                </select>
                <div className="hint" style={{ marginTop: 4, marginBottom: 0 }}>{t("wall.segmentHint", { count: segCount })}</div>
              </div>
            )}

            <div className="checkline">
              <input id="wb-createSub" type="checkbox" checked={form.createSub} onChange={(e) => setField("createSub", e.target.checked)} />
              <label htmlFor="wb-createSub" style={{ margin: 0 }}>{t("wall.createSub")}</label>
            </div>
            {form.createSub && (
              <div className="row3">
                <div className="field"><label>{t("wall.subId")}</label><input type="number" value={form.subId} onChange={(e) => setField("subId", e.target.value)} /></div>
                <div className="field"><label>{t("wall.storyFrom")}</label><input value={form.storyFrom} onChange={(e) => setField("storyFrom", e.target.value)} /></div>
                <div className="field"><label>{t("wall.storyTo")}</label><input value={form.storyTo} onChange={(e) => setField("storyTo", e.target.value)} /></div>
              </div>
            )}

            <div className="subhead">{t("wall.vhRebarTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("wall.vSpec")}</label><BarSelect id="wb-vName" placeholder="D16" value={form.vName} onChange={(v) => setField("vName", v)} /></div>
              <div className="field"><label>{t("wall.vDistLabel")}{unitSuffix}</label><input type="number" step="any" value={form.vDist} onChange={(e) => setField("vDist", e.target.value)} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>{t("wall.hSpec")}</label><BarSelect id="wb-hName" placeholder="D13" value={form.hName} onChange={(v) => setField("hName", v)} /></div>
              <div className="field"><label>{t("wall.hDistLabel")}{unitSuffix}</label><input type="number" step="any" value={form.hDist} onChange={(e) => setField("hDist", e.target.value)} /></div>
            </div>

            <div className="checkline">
              <input id="wb-useEnd" type="checkbox" checked={form.useEnd} onChange={(e) => setField("useEnd", e.target.checked)} />
              <label htmlFor="wb-useEnd" style={{ margin: 0 }}>{t("wall.useEndRebar")}</label>
            </div>
            {form.useEnd && (
              <div className="row3">
                <div className="field"><label>{t("common.spec")}</label><BarSelect id="wb-endName" placeholder="D22" value={form.endName} onChange={(v) => setField("endName", v)} /></div>
                <div className="field"><label>{t("common.count")}</label><input type="number" value={form.endNum} onChange={(e) => setField("endNum", e.target.value)} /></div>
                <div className="field"><label>{t("common.dist")}{unitSuffix}</label><input type="number" step="any" value={form.endDist} onChange={(e) => setField("endDist", e.target.value)} /></div>
              </div>
            )}

            <div className="subhead">{t("wall.beTitle")}</div>
            <div className="row3">
              <div className="field"><label>{t("wall.hSpec")}</label><BarSelect id="wb-beName" placeholder="D13" value={form.beName} onChange={(v) => setField("beName", v)} /></div>
              <div className="field"><label>{t("wall.hDistLabel")}{unitSuffix}</label><input type="number" step="any" value={form.beDist} onChange={(e) => setField("beDist", e.target.value)} /></div>
              <div className="field"><label>{t("wall.beLen")}{unitSuffix}</label><input type="number" step="any" value={form.beLen} onChange={(e) => setField("beLen", e.target.value)} /></div>
            </div>

            <div className="subhead">{t("wall.coverThkTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("wall.dw")}{unitSuffix}</label><input type="number" step="any" value={form.dw} onChange={(e) => setField("dw", e.target.value)} /></div>
              <div className="field"><label>{t("wall.de")}{unitSuffix}</label><input type="number" step="any" value={form.de} onChange={(e) => setField("de", e.target.value)} /></div>
            </div>
            <div className="checkline">
              <input id="wb-useModelThk" type="checkbox" checked={form.useModelThk} onChange={(e) => setField("useModelThk", e.target.checked)} />
              <label htmlFor="wb-useModelThk" style={{ margin: 0 }}>{t("wall.useModelThk")}</label>
            </div>
            {!form.useModelThk && (
              <div className="field"><label>{t("wall.thickness")}{unitSuffix}</label><input type="number" step="any" value={form.thickness} onChange={(e) => setField("thickness", e.target.value)} /></div>
            )}

            <div className="subhead">{t("common.dimsHintTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("wall.dispThk")}</label><input type="number" value={dispThk} onChange={(e) => setDispThk(e.target.value)} /></div>
              <div className="field"><label>{t("wall.dispLen")}</label><input type="number" value={dispLen} onChange={(e) => setDispLen(e.target.value)} /></div>
            </div>

            {/* --- action bar --- */}
            <div className="board-actions">
              <button className="btn primary" type="button" onClick={() => saveWall(selectedId)} disabled={savingId === selectedId}>
                {t("common.saveBtn")}
              </button>
              <span className="hint save-note">{selectedRow.dirty ? t("board.unsavedNote") : t("board.savedNote")}</span>
            </div>
            {actionMsg && <div className={"status show " + statusClass(actionMsg)}>{statusText(t, actionMsg)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
