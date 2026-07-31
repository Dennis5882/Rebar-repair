import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useLoadAll } from "../context/LoadAllContext";
import { getModelUnit, listRebar, runAnalysis, runWallCheck, saveRebar, type MemberCheckRow } from "../lib/api";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
import { compressKeyRanges } from "../lib/keyRange";
import { EMPTY_WALL_FORM, buildWallItem, fillWallForm, segmentLabel, type WallFormState } from "../lib/wallRebarForm";
import { useMemberVerdict, type EffVerdict } from "../lib/useMemberVerdict";
import { numToMm, numToModel } from "../lib/units";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import { JudgeBar } from "./JudgeBar";
import { MemberVerdictCell } from "./MemberVerdictCell";
import { BoardEmptyState, BoardSummaryPlaceholder } from "./BoardEmpty";
import type { WallItem, WallPayload } from "../types/rebar";

// The WALL tab's board. Walls don't fit the SECT-grouped section model the
// column/brace boards use — a wall is keyed by Wall ID and carries MULTIPLE
// segments (ITEMS: WallItem[], one per SUB_WALL_ID / story range). Every real
// Wall ID is listed (api/rebar.ts's doListWall enumerates them from /db/ELEM,
// not just ones with existing REBW — see [[genxn-api-schema-findings]]), and
// its detail editor edits one segment at a time, preserving the others on
// save. Each wall carries a live OK/NG verdict read from Gen NX's own wall
// check (WC-ANAL + WC-TABLE, keyed by WID) — the worst case across the wall's
// stories. KDS models only; a non-KDS/empty result shows "판정 보류".
//
// **Grouping (live-verified 2026-07-30 against Gen NX's own "Modify Wall
// Rebar Data" dialog):** Korean apartment practice reuses one rebar design
// across many Wall IDs via a "Wall Mark" (`/db/WMAK`, many-to-one — e.g. Wall
// ID 3 and 5 both marked "W3", get identical rebar). The board defaults to
// grouping by Mark (a Wall ID with no mark falls back to its own singleton
// group) but also offers raw Wall ID and wall Thickness (`/db/THIK`, the
// element's `SECT` field on a WALL-type element indexes THIK, not SECT — the
// regular frame-section table is empty for these ids). One row = one group;
// editing/saving broadcasts the same rebar to every Wall ID in the group in
// one batch (mirrors the column/beam boards' "one save → many elements", just
// grouped by Mark or Thickness instead of a structural SECT id).

interface WallRowState {
  items: WallItem[]; // working copy, in mm (edited); saved back in model unit
  dirty: boolean;
}

type WallGroupMode = "mark" | "id" | "thickness";

interface WallGroup {
  key: string;
  label: string;
  members: string[]; // Wall IDs, sorted numerically
}


// The board works in mm; REBW stores lengths in the model's unit. Convert every
// length field of a segment on the load/save boundary (spacings, cover DW/DE,
// BE length, thickness). Names/ids/story labels are not lengths — left alone.
function mapWallItemLen(it: WallItem, conv: (v: number | undefined) => number | undefined): WallItem {
  const out: WallItem = { ...it };
  if (it.VERTICAL_REBAR) out.VERTICAL_REBAR = { ...it.VERTICAL_REBAR, DIST: conv(it.VERTICAL_REBAR.DIST) };
  if (it.HORIZONTAL_REBAR) out.HORIZONTAL_REBAR = { ...it.HORIZONTAL_REBAR, DIST: conv(it.HORIZONTAL_REBAR.DIST) };
  if (it.END_REBAR) out.END_REBAR = { ...it.END_REBAR, DIST: conv(it.END_REBAR.DIST) };
  if (it.BE_HORIZONTAL_REBAR) out.BE_HORIZONTAL_REBAR = { ...it.BE_HORIZONTAL_REBAR, DIST: conv(it.BE_HORIZONTAL_REBAR.DIST) };
  if (it.BOUNDARY_ELEMENT_LENGTH != null) out.BOUNDARY_ELEMENT_LENGTH = conv(it.BOUNDARY_ELEMENT_LENGTH);
  if (it.CONCRETE_FACE_TO_CENTER_OF_REBAR) {
    out.CONCRETE_FACE_TO_CENTER_OF_REBAR = { DW: conv(it.CONCRETE_FACE_TO_CENTER_OF_REBAR.DW), DE: conv(it.CONCRETE_FACE_TO_CENTER_OF_REBAR.DE) };
  }
  if (it.THICKNESS != null) out.THICKNESS = conv(it.THICKNESS);
  return out;
}

export function WallBoard() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { nonce: loadAllNonce } = useLoadAll();

  const [orig, setOrig] = useState<Record<string, WallPayload>>({});
  const [marks, setMarks] = useState<Record<string, string>>({}); // Wall ID -> Wall Mark name (/db/WMAK)
  const [thicknessMm, setThicknessMm] = useState<Record<string, number>>({}); // Wall ID -> model thickness, mm (/db/THIK)
  const [groupMode, setGroupMode] = useState<WallGroupMode>("mark");
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

  // Gen NX wall-check rows per WID (WC-TABLE, one per Story), reduced to a
  // verdict below.
  const [check, setCheck] = useState<Record<string, MemberCheckRow[]>>({});
  const [rechecking, setRechecking] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [dispThk, setDispThk] = useState("300");
  const [dispLen, setDispLen] = useState("3000");

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"default" | "name">("default");

  const unit = boardUnit || lengthUnit;

  async function handleList() {
    setListLoading(true);
    try {
      const [res, unitRes] = await Promise.all([listRebar<WallPayload>("WALL", conn), getModelUnit(conn)]);
      if (!res.ok) {
        setStatus({ ok: false, kind: "listFail", res });
        return;
      }
      setOrig(res.data);
      setMarks(res.marks || {});
      setThicknessMm(res.thicknessMm || {});
      if (unitRes.ok) setBoardUnit(unitRes.unit || "");
      setListLoadedOnce(true);
      setStatus({ ok: true, kind: "sectionsLoaded", count: Object.keys(res.data).length });
    } catch (e) {
      setStatus({ ok: false, kind: "listError", error: String(e) });
    } finally {
      setListLoading(false);
    }
  }

  // Respond to the Project Review "모든 정보 한번에 불러오기" button.
  useEffect(() => {
    if (loadAllNonce > 0) handleList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAllNonce]);

  // Rebuild working rows from a fresh list, converting each segment's lengths
  // model-unit -> mm (the board edits in mm). The copy also means edits never
  // mutate the `orig` kept for the "before" preview baseline.
  useEffect(() => {
    const ids = Object.keys(orig);
    const next: Record<string, WallRowState> = {};
    for (const id of ids) next[id] = { items: (orig[id]?.ITEMS || []).map((it) => mapWallItemLen(it, (v) => numToMm(v, unit))), dirty: false };
    setRows(next);
    setOrder(ids);
    setSelectedId(ids.length ? ids[0] : null);
    setCheck({}); // fresh list — drop any prior verdicts until re-checked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orig, unit]);

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

  // Gen NX verdict per WALL ID (shared reducer with the column board) — kept
  // at Wall ID granularity; grouped into per-group verdicts below.
  const { verdicts } = useMemberVerdict(order, rows, check);

  // One row = one group under the active mode: "mark" (Wall Mark, many WIDs
  // sharing one design — a WID with no mark is its own singleton group),
  // "id" (every WID its own row, the pre-grouping behavior), or "thickness"
  // (WIDs sharing the same model wall thickness). See the file-header note.
  const groups = useMemo<WallGroup[]>(() => {
    const byKey: Record<string, string[]> = {};
    for (const wid of order) {
      const key =
        groupMode === "id"
          ? `id:${wid}`
          : groupMode === "mark"
            ? marks[wid]
              ? `mark:${marks[wid]}`
              : `id:${wid}`
            : thicknessMm[wid] != null
              ? `thk:${thicknessMm[wid]}`
              : `id:${wid}`;
      (byKey[key] = byKey[key] || []).push(wid);
    }
    return Object.entries(byKey).map(([key, members]) => {
      const sorted = members.slice().sort((a, b) => Number(a) - Number(b));
      const label = key.startsWith("mark:") ? key.slice(5) : key.startsWith("thk:") ? `${key.slice(4)} mm` : `${t("wboard.colWall")} ${sorted[0]}`;
      return { key, members: sorted, label };
    });
  }, [order, groupMode, marks, thicknessMm, t]);

  const selectedGroup = useMemo(() => groups.find((g) => selectedId != null && g.members.includes(selectedId)) || null, [groups, selectedId]);

  // Worst-case verdict across a group's members (any NG ⇒ group NG).
  const groupVerdicts = useMemo(() => {
    const out: Record<string, EffVerdict> = {};
    for (const g of groups) {
      let picked: EffVerdict = { source: "none" };
      for (const m of g.members) {
        const v = verdicts[m];
        if (!v || v.source === "none") continue;
        if (picked.source === "none" || (v.ok === false && picked.ok !== false)) picked = v;
      }
      out[g.key] = picked;
    }
    return out;
  }, [groups, verdicts]);

  const summary = useMemo(() => {
    let ok = 0;
    let ng = 0;
    let judged = 0;
    let dirty = 0;
    for (const g of groups) {
      const v = groupVerdicts[g.key];
      if (v.ok === true) ok++;
      else if (v.ok === false) ng++;
      if (v.ok != null) judged++;
      if (g.members.some((m) => rows[m]?.dirty)) dirty++;
    }
    return { total: groups.length, ok, ng, judged, dirty };
  }, [groups, groupVerdicts, rows]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = groups.filter((g) => {
      if (!q) return true;
      if (g.label.toLowerCase().includes(q)) return true;
      return g.members.some((m) => m.includes(q));
    });
    list = [...list].sort((a, b) =>
      sortKey === "name" ? a.label.localeCompare(b.label, undefined, { numeric: true }) : Number(a.members[0]) - Number(b.members[0])
    );
    return list;
  }, [groups, query, sortKey]);

  // Saves the SELECTED (representative) Wall ID's current items to every Wall
  // ID in its group, in parallel — a group of one (raw "id" mode, or a Mark/
  // Thickness bucket nobody else shares) behaves exactly like the old
  // per-wall save. Every member ends up with byte-identical rebar, matching
  // Gen NX's own Wall Mark semantics (see the file-header note).
  async function saveGroup(group: WallGroup) {
    const repId = group.members[0];
    const row = rows[repId];
    if (!row) return;
    // Working items are mm; REBW expects the model's length unit — convert
    // every segment's lengths back on the way out.
    const payload: WallPayload = { ITEMS: row.items.map((it) => mapWallItemLen(it, (v) => numToModel(v, unit))) };
    setSavingId(repId);
    setActionMsg({ ok: true, kind: "saving" });
    try {
      const results = await Promise.all(group.members.map((id) => saveRebar("WALL", id, payload, conn)));
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setActionMsg({ ok: false, kind: "saveFail", res: failed });
        return;
      }
      setActionMsg({ ok: true, kind: "saveDone" });
      // Only clear THIS group's rows/dirty flags. Deliberately do NOT touch
      // `orig`: writing to it retriggers the [orig] effect, which rebuilds
      // every row (discarding unsaved edits on other walls) and resets the
      // selection to the first wall. The "before" preview keeps showing the
      // as-loaded segment, same as the column board (before = the
      // originally-loaded payload), which is the intended diff baseline.
      // Every member now shares the representative's items — that's the
      // point of a group save.
      setRows((prev) => {
        const next = { ...prev };
        for (const id of group.members) next[id] = { items: row.items, dirty: false };
        return next;
      });
      // The saved rebar no longer matches the last Gen NX verdict for any
      // member — drop it so the group shows "판정 보류" (not a stale OK/NG)
      // until re-checked.
      setCheck((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of group.members) {
          if (next[id]) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch (e) {
      setActionMsg({ ok: false, kind: "saveError", error: String(e) });
    } finally {
      setSavingId(null);
    }
  }

  // "Gen NX 재검토": WC-ANAL "ALL" then read every wall's WC-TABLE verdict.
  async function handleRecheck() {
    if (!order.length) return;
    setRechecking(true);
    setStatus({ ok: true, kind: "recheckRunning" });
    try {
      const res = await runWallCheck(conn, { recheck: true });
      if (!res.ok) {
        setStatus({ ok: false, kind: "recheckFail", res });
        return;
      }
      setCheck(res.byKey);
      const loaded = order.filter((id) => (res.byKey[id]?.length ?? 0) > 0).length;
      setStatus(
        loaded
          ? { ok: true, kind: "recheckDone", loaded, total: order.length }
          : res.needAnalysis
            ? { ok: false, kind: "needAnalysis" }
            : { ok: false, kind: "recheckEmptyMember" }
      );
    } catch (e) {
      setStatus({ ok: false, kind: "recheckFail", res: { ok: false, error: String(e) } });
    } finally {
      setRechecking(false);
    }
  }

  // "이 벽 검토 실행": WC-ANAL "ALL" (walls have no section scope; it's cheap),
  // then read back every member of the selected group's verdict.
  async function handleGroupRecheck(group: WallGroup) {
    setCheckingId(group.members[0]);
    setActionMsg({ ok: true, kind: "sectionChecking" });
    try {
      const res = await runWallCheck(conn, { recheck: true });
      if (!res.ok) {
        setActionMsg({ ok: false, kind: "recheckFail", res });
        return;
      }
      setCheck((prev) => {
        const next = { ...prev };
        for (const id of group.members) next[id] = res.byKey[id] || [];
        return next;
      });
      const anyJudged = group.members.some((id) => (res.byKey[id] || []).some((r) => r.chk != null));
      setActionMsg(anyJudged ? { ok: true, kind: "sectionChecked" } : res.needAnalysis ? { ok: false, kind: "needAnalysis" } : { ok: false, kind: "recheckEmptyMember" });
    } catch (e) {
      setActionMsg({ ok: false, kind: "recheckFail", res: { ok: false, error: String(e) } });
    } finally {
      setCheckingId(null);
    }
  }

  // Run the whole model's structural analysis (/doc/ANAL) — required after a
  // rebar save before the wall check can produce fresh results.
  async function runModelAnalysis() {
    if (!window.confirm(t("board.analyzeConfirm"))) return;
    setAnalyzing(true);
    setActionMsg({ ok: true, kind: "analyzing" });
    try {
      const res = await runAnalysis(conn);
      if (res.ok) setActionMsg({ ok: true, kind: "analyzeDone" });
      else if (res.code === "timeout" || res.code === "parse_error") setActionMsg({ ok: false, kind: "analyzeRunning" });
      else setActionMsg({ ok: false, kind: "analyzeFail", res });
    } catch (e) {
      setActionMsg({ ok: false, kind: "analyzeFail", res: { ok: false, error: String(e) } });
    } finally {
      setAnalyzing(false);
    }
  }

  const selectedRow = selectedId ? rows[selectedId] : null;
  const selectedVerdict = selectedGroup ? groupVerdicts[selectedGroup.key] : null;
  const segCount = selectedRow?.items.length || 0;
  const beforeItem = selectedId ? orig[selectedId]?.ITEMS?.[segIndex] : undefined;
  // `before` is the loaded (model-unit) segment converted to mm; `after` comes
  // from the mm form — both mm so the diagram is consistent.
  const beforePayload = useMemo(() => (beforeItem ? { ITEMS: [mapWallItemLen(beforeItem, (v) => numToMm(v, unit))] } : null), [beforeItem, unit]);
  const afterPayload = useMemo(() => ({ ITEMS: [buildWallItem(form)] }), [form]);

  return (
    <div className="beam-board">
      {/* --- toolbar --- */}
      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleList} disabled={listLoading}>
            {listLoading ? t("wboard.loadingBtn") : t("wboard.loadBtn")}
          </button>
          {order.length > 0 && (
            <button className="btn primary board-recheck" type="button" onClick={handleRecheck} disabled={rechecking} title={t("board.recheckHint")}>
              {rechecking ? t("board.rechecking") : t("board.recheckBtn")}
            </button>
          )}
          {order.length > 0 && (
            <label className="board-sort">
              <span>{t("wboard.groupModeLabel")}</span>
              <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as WallGroupMode)}>
                <option value="mark">{t("wboard.groupModeMark")}</option>
                <option value="id">{t("wboard.groupModeId")}</option>
                <option value="thickness">{t("wboard.groupModeThickness")}</option>
              </select>
            </label>
          )}
        </div>
        {status && <div className={"status show " + statusClass(status)} style={{ marginTop: 8 }}>{statusText(t, status)}</div>}
      </div>

      {/* --- summary strip (dashed stand-ins until the board has data) --- */}
      {order.length === 0 && <BoardSummaryPlaceholder totalLabel={t("wboard.summaryTotal")} />}
      {order.length > 0 && (
        <div className="board-summary">
          <div className="stat"><div className="k">{t("wboard.summaryTotal")}</div><div className="v">{summary.total}</div></div>
          <div className={"stat " + (summary.ng ? "ng" : summary.judged ? "ok" : "")}>
            <div className="k">{t("board.summaryOk")}</div>
            <div className="v">{summary.ok}<small> / {summary.judged} {t("board.judgedSuffix")}</small></div>
          </div>
          <div className={"stat " + (summary.ng ? "ng" : "")}><div className="k">{t("board.summaryNg")}</div><div className="v">{summary.ng}</div></div>
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
                {visibleGroups.length === groups.length ? `(${groups.length})` : `(${t("board.countFiltered", { shown: visibleGroups.length, total: groups.length })})`}
              </span>
            )}
          </h2>
          {order.length > 0 && <span className="board-hint">{t("wboard.tableHint")}</span>}
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
        {order.length === 0 ? (
          <BoardEmptyState
            kind="wall"
            title={listLoadedOnce ? t("wboard.emptyList") : t("wboard.notLoaded")}
            loadedOnce={listLoadedOnce}
            onLoad={handleList}
            loading={listLoading}
            loadLabel={listLoading ? t("wboard.loadingBtn") : t("wboard.loadBtn")}
          />
        ) : (
        <div className="table-scroll">
          <table className="board-table">
            <thead>
              <tr>
                <th>{t("wboard.colWall")}</th>
                <th>{t("wboard.colWallIds")}</th>
                <th>{t("wboard.colSegments")}</th>
                <th>{t("wboard.colThickness")}</th>
                <th>{t("wboard.colVertical")}</th>
                <th>{t("wboard.colHorizontal")}</th>
                <th>{t("wboard.colEnd")}</th>
                <th>{t("wboard.colCover")}</th>
                <th>{t("board.colVerdict")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => {
                const repId = g.members[0];
                const row = rows[repId];
                if (!row) return null;
                const isSel = selectedGroup?.key === g.key;
                // Summarize the segment currently being edited when this is the
                // selected group, else segment 0 as the representative — so an
                // edit to a non-first segment is visible in its row, not hidden
                // behind segment 0's (unchanged) values.
                const it0 = row.items[isSel ? segIndex : 0] || {};
                const v = it0.VERTICAL_REBAR || {};
                const h = it0.HORIZONTAL_REBAR || {};
                const er = it0.END_REBAR || {};
                const cc = it0.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
                const thk = thicknessMm[repId];
                const dirty = g.members.some((m) => rows[m]?.dirty);
                return (
                  <tr key={g.key} className={isSel ? "sel" : ""} onClick={() => setSelectedId(repId)}>
                    <td className="cell-section">
                      <span className="dirty-dot" style={{ visibility: dirty ? "visible" : "hidden" }} />
                      <span className="sect-nm">{g.label}</span>
                    </td>
                    <td><span className="elem-badge" title={compressKeyRanges(g.members)}>{t("board.memberCount", { count: g.members.length })}</span></td>
                    <td><span className="elem-badge">{t("wboard.segCount", { count: row.items.length })}</span></td>
                    <td className="mono">{thk != null ? `${thk} mm` : "—"}</td>
                    <td className="mono">{v.NAME ? <><span className="bar-main">{v.NAME}</span>@{v.DIST ?? "?"}</> : "—"}</td>
                    <td className="mono">{h.NAME ? <><span className="bar-stir">{h.NAME}</span>@{h.DIST ?? "?"}</> : "—"}</td>
                    <td className="mono">{it0.USE_END_REBAR && er.NAME ? <><b>{er.NUM ?? "?"}</b>×{er.NAME}</> : "—"}</td>
                    <td className="mono">{cc.DW ?? "?"}/{cc.DE ?? "?"}</td>
                    <MemberVerdictCell v={groupVerdicts[g.key]} genNxLabel={t("board.verdictGenNx")} />
                  </tr>
                );
              })}
              {visibleGroups.length === 0 && (
                <tr><td colSpan={9} className="board-empty">{t("board.filterEmpty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* --- detail drawer --- */}
      {selectedRow && selectedId && selectedGroup && (
        <div className="board-detail">
          <div className="panel board-preview-card">
            <div className="board-detail-head">
              <div>
                <div className="detail-nm">{selectedGroup.label}</div>
                <div className="detail-el">
                  {selectedGroup.members.length > 1
                    ? t("wboard.appliesToWalls", { count: selectedGroup.members.length, keys: compressKeyRanges(selectedGroup.members) })
                    : t("wboard.segCount", { count: segCount })}
                </div>
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
              <div className="field"><label>{t("wall.vDistLabel")} (mm)</label><input type="number" step="any" value={form.vDist} onChange={(e) => setField("vDist", e.target.value)} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>{t("wall.hSpec")}</label><BarSelect id="wb-hName" placeholder="D13" value={form.hName} onChange={(v) => setField("hName", v)} /></div>
              <div className="field"><label>{t("wall.hDistLabel")} (mm)</label><input type="number" step="any" value={form.hDist} onChange={(e) => setField("hDist", e.target.value)} /></div>
            </div>

            <div className="checkline">
              <input id="wb-useEnd" type="checkbox" checked={form.useEnd} onChange={(e) => setField("useEnd", e.target.checked)} />
              <label htmlFor="wb-useEnd" style={{ margin: 0 }}>{t("wall.useEndRebar")}</label>
            </div>
            {form.useEnd && (
              <div className="row3">
                <div className="field"><label>{t("common.spec")}</label><BarSelect id="wb-endName" placeholder="D22" value={form.endName} onChange={(v) => setField("endName", v)} /></div>
                <div className="field"><label>{t("common.count")}</label><input type="number" value={form.endNum} onChange={(e) => setField("endNum", e.target.value)} /></div>
                <div className="field"><label>{t("common.dist")} (mm)</label><input type="number" step="any" value={form.endDist} onChange={(e) => setField("endDist", e.target.value)} /></div>
              </div>
            )}

            <div className="subhead">{t("wall.beTitle")}</div>
            <div className="row3">
              <div className="field"><label>{t("wall.hSpec")}</label><BarSelect id="wb-beName" placeholder="D13" value={form.beName} onChange={(v) => setField("beName", v)} /></div>
              <div className="field"><label>{t("wall.hDistLabel")} (mm)</label><input type="number" step="any" value={form.beDist} onChange={(e) => setField("beDist", e.target.value)} /></div>
              <div className="field"><label>{t("wall.beLen")} (mm)</label><input type="number" step="any" value={form.beLen} onChange={(e) => setField("beLen", e.target.value)} /></div>
            </div>

            <div className="subhead">{t("wall.coverThkTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("wall.dw")} (mm)</label><input type="number" step="any" value={form.dw} onChange={(e) => setField("dw", e.target.value)} /></div>
              <div className="field"><label>{t("wall.de")} (mm)</label><input type="number" step="any" value={form.de} onChange={(e) => setField("de", e.target.value)} /></div>
            </div>
            <div className="checkline">
              <input id="wb-useModelThk" type="checkbox" checked={form.useModelThk} onChange={(e) => setField("useModelThk", e.target.checked)} />
              <label htmlFor="wb-useModelThk" style={{ margin: 0 }}>{t("wall.useModelThk")}</label>
              {thicknessMm[selectedId] != null && (
                <span className="hint" style={{ marginLeft: 8, marginBottom: 0 }}>{t("wboard.modelThicknessHint", { thickness: thicknessMm[selectedId] })}</span>
              )}
            </div>
            {!form.useModelThk && (
              <div className="field"><label>{t("wall.thickness")} (mm)</label><input type="number" step="any" value={form.thickness} onChange={(e) => setField("thickness", e.target.value)} /></div>
            )}

            <div className="subhead">{t("common.dimsHintTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("wall.dispThk")}</label><input type="number" value={dispThk} onChange={(e) => setDispThk(e.target.value)} /></div>
              <div className="field"><label>{t("wall.dispLen")}</label><input type="number" value={dispLen} onChange={(e) => setDispLen(e.target.value)} /></div>
            </div>

            {/* --- action bar: save · run analysis · re-check this wall.
                   A rebar save invalidates Gen NX's solve, so 해석 실행 (once)
                   must run before 이 벽 검토 실행. --- */}
            <div className="board-actions">
              <button className="btn primary" type="button" onClick={() => saveGroup(selectedGroup)} disabled={savingId === selectedId}>
                {selectedGroup.members.length > 1 ? t("wboard.saveGroupBtn", { count: selectedGroup.members.length }) : t("common.saveBtn")}
              </button>
              <button className="btn" type="button" onClick={runModelAnalysis} disabled={analyzing}>
                {analyzing ? t("board.analyzing") : t("board.runAnalysisBtn")}
              </button>
              <button className="btn" type="button" onClick={() => handleGroupRecheck(selectedGroup)} disabled={checkingId === selectedId}>
                {checkingId === selectedId ? t("board.checkingWall") : t("board.checkWallBtn")}
              </button>
              <span className="hint save-note">{selectedGroup.members.some((m) => rows[m]?.dirty) ? t("board.unsavedNote") : t("board.savedNote")}</span>
            </div>
            <div className="hint board-actions-hint">{t("board.checkWallHint")}</div>
            {actionMsg && <div className={"status show " + statusClass(actionMsg)}>{statusText(t, actionMsg)}</div>}

            {/* --- Gen NX verdict for the selected wall (P-M / shear ratios) --- */}
            {selectedVerdict && selectedVerdict.source !== "none" && (
              <div className="judge-block">
                <div className="judge-title">
                  {t("board.judgeTitle")}
                  <span className="judge-src gennx">{t("board.verdictGenNx")}</span>
                </div>
                <JudgeBar label={t("board.axialFlexLabel")} sym="Rat" ratio={selectedVerdict.ratPM} cap={null} unit="" t={t} />
                <JudgeBar label={t("board.shearLabel")} sym="Rat" ratio={selectedVerdict.ratShear} cap={null} unit="" t={t} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
