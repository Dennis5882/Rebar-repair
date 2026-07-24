import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useDesignCode } from "../context/DesignCodeContext";
import { getAllBeamDesignResults, getBeamDesignResult, listBeamSections, runAnalysis, saveRebar, sectionGroupLabel, type BeamSectionGroup } from "../lib/api";
import { formulaFamily } from "../lib/rcBeamCheck";
import { MM_PER_UNIT } from "../data/rcCodePresets";
import {
  buildBeamPayload,
  detectInputMode,
  fillFromPayload,
  sectorsEqual,
  type BeamInputMode,
  type SectorFormValues,
} from "../lib/beamRebarForm";
import type { TFn } from "../i18n/types";
import { judgeSection, type DemandBySector, type MatProps } from "../lib/beamBoard";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
import { compressKeyRanges } from "../lib/keyRange";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import { SECTORS, type SectorKey } from "../types/rebar";

// The BEAM tab's primary interface: every beam section on one board (row =
// section), with live φMn/φVn OK-NG judgment and inline editing — see
// memory/beam-board-redesign.md for why this replaced the old scattered
// single-record form. Deliberately NOT a clone of Gen NX's one-section-at-a-
// time modal; the point is to beat it (whole-model view + instant verdict).

interface RowState {
  sectors: Record<SectorKey, SectorFormValues>;
  dt: string;
  db: string;
  b: string; // section width, mm
  h: string; // section depth, mm
  mode: BeamInputMode;
  dirty: boolean;
}

const DEFAULT_B = "400";
const DEFAULT_H = "600";

function rowFromGroup(grp: BeamSectionGroup, defB: string, defH: string, lengthUnit: string): RowState {
  const filled = fillFromPayload(grp.payload);
  return {
    sectors: shearDistToMm(filled.sectors, lengthUnit),
    // REBB stores cover (DT/DB) in the model's native length unit (e.g. 0.0635
    // when the model is in metres = 63.5 mm). The whole UI works in mm — same
    // as B/H — so convert on the way in and back out again only at save time.
    // Without this, a user typing "100" (thinking mm) into a metre-unit model
    // silently wrote 100 m of cover; and the section diagram, which treats
    // DT/DB as mm, drew a near-zero inset for the raw 0.0635 value.
    dt: coverToMm(filled.dt, lengthUnit),
    db: coverToMm(filled.db, lengthUnit),
    // Dims come from /db/SECT (vSIZE, converted to mm by the backend); fall
    // back to a default only for section shapes we can't read (non-SB).
    b: grp.dimB != null ? String(Math.round(grp.dimB)) : defB,
    h: grp.dimH != null ? String(Math.round(grp.dimH)) : defH,
    mode: detectInputMode(filled.sectors),
    dirty: false,
  };
}

function n(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}
const mmPerUnit = (unit: string): number => MM_PER_UNIT[unit] ?? 1;
// model-unit string -> mm string (blank stays blank; float noise trimmed)
function coverToMm(s: string, unit: string): string {
  if (s.trim() === "") return "";
  const v = Number(s);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * mmPerUnit(unit) * 100) / 100);
}
// mm string -> model-unit string, for writing REBB back
function coverToModel(s: string, unit: string): string {
  if (s.trim() === "") return "";
  const v = Number(s);
  if (!Number.isFinite(v)) return "";
  return String(v / mmPerUnit(unit));
}
// Shear spacing (SHEAR_BAR.DIST) is stored in the model's native length unit
// just like cover. The board works entirely in mm, so convert each sector's
// shearDist on the same load/save boundary as cover — mm in RowState, model
// unit only in the REBB write payload. (These reuse coverToMm/coverToModel,
// which are generic length-string converters despite the "cover" name.)
function shearDistToMm(sectors: Record<SectorKey, SectorFormValues>, unit: string): Record<SectorKey, SectorFormValues> {
  const out = {} as Record<SectorKey, SectorFormValues>;
  for (const k of SECTORS) out[k] = { ...sectors[k], shearDist: coverToMm(sectors[k].shearDist, unit) };
  return out;
}
function shearDistToModel(sectors: Record<SectorKey, SectorFormValues>, unit: string): Record<SectorKey, SectorFormValues> {
  const out = {} as Record<SectorKey, SectorFormValues>;
  for (const k of SECTORS) out[k] = { ...sectors[k], shearDist: coverToModel(sectors[k].shearDist, unit) };
  return out;
}
// Copy of a loaded payload with its cover converted model-unit -> mm, so the
// "before" diagram (which reads DT/DB as mm) matches the "after" diagram built
// from the mm-based form state.
function payloadCoverToMm(p: BeamSectionGroup["payload"], unit: string): BeamSectionGroup["payload"] {
  const it = p.ITEMS?.[0];
  if (!it) return p;
  const dt = it.DT != null ? Number(it.DT) * mmPerUnit(unit) : it.DT;
  const db = it.DB != null ? Number(it.DB) * mmPerUnit(unit) : it.DB;
  return { ...p, ITEMS: [{ ...it, DT: dt, DB: db }] };
}

const MODE_LABEL: Record<BeamInputMode, string> = { all: "beam.modeAll", endCenter: "beam.modeEndCenter", each: "beam.modeEach" };

export function BeamBoard() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { designCode, materialDB } = useDesignCode();

  const [sections, setSections] = useState<Record<string, BeamSectionGroup>>({});
  // Length unit for cover/spacing conversion. The /api/beam-sections response
  // carries the model's own unit, which is authoritative here — ConnContext's
  // lengthUnit is only populated by the connection drawer's "connect" button,
  // so loading sections with just a pasted key (no explicit connect) would
  // otherwise leave it "" and mis-convert every cover. Fall back to lengthUnit.
  const [boardUnit, setBoardUnit] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listBeamSections(conn);
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

  const [fck, setFck] = useState("24");
  const [fy, setFy] = useState("400");
  const [fyt, setFyt] = useState("400");
  const [defB] = useState(DEFAULT_B);
  const [defH] = useState(DEFAULT_H);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [demand, setDemand] = useState<Record<string, DemandBySector>>({});
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [savingSid, setSavingSid] = useState<string | null>(null);
  const [fetchingSid, setFetchingSid] = useState<string | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Per-section action feedback (save / analyze / fetch results). Kept
  // separate from the top-of-board `status` (which only reports the list
  // load) so the message shows next to the action bar down in the detail
  // panel, not scrolled far away at the toolbar.
  const [actionMsg, setActionMsg] = useState<StatusMsg | null>(null);

  // Board filter/sort — the table height is capped and scrolls (see
  // .table-scroll), so a many-section model doesn't stretch the page; these
  // let the user jump to what matters (search by name, NG-only, reorder)
  // instead of paging, which would hide off-page NG rows.
  const [query, setQuery] = useState("");
  const [ngOnly, setNgOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"default" | "name" | "verdict" | "members">("default");

  // The model's length unit for all cover/spacing math on this board. See the
  // boardUnit declaration above for why the endpoint's unit wins over context.
  const unit = boardUnit || lengthUnit;

  // Rebuild working rows whenever a fresh list arrives. Section grouping and
  // the "one section = identical rebar across its elements" rule come from
  // the backend (api/beam-sections.ts); here each group's representative
  // payload seeds one editable row.
  useEffect(() => {
    const sids = Object.keys(sections);
    const next: Record<string, RowState> = {};
    for (const sid of sids) next[sid] = rowFromGroup(sections[sid], defB, defH, unit);
    setRows(next);
    setOrder(sids);
    setDemand({});
    setSelectedSid(sids.length ? sids[0] : null);
  }, [sections, defB, defH, unit]);

  // Save/demand feedback is section-specific, so drop it when the selected
  // section changes — a stale "saved"/"loaded N" message must not appear to
  // describe a different section the user just clicked into.
  useEffect(() => setActionMsg(null), [selectedSid]);

  const family = formulaFamily(designCode);
  const mat: MatProps = useMemo(() => ({ fck: n(fck), fy: n(fy), fyt: n(fyt) }), [fck, fy, fyt]);

  const judgments = useMemo(() => {
    const out: Record<string, ReturnType<typeof judgeSection>> = {};
    if (!family) return out;
    for (const sid of order) {
      const r = rows[sid];
      if (!r) continue;
      out[sid] = judgeSection(
        family,
        mat,
        materialDB,
        n(r.b),
        n(r.h),
        n(r.dt), // cover + spacing are already mm in row state
        n(r.db),
        r.sectors,
        demand[sid] || {}
      );
    }
    return out;
  }, [family, order, rows, mat, materialDB, demand]);

  const summary = useMemo(() => {
    let ok = 0;
    let ng = 0;
    let judged = 0;
    let dirty = 0;
    for (const sid of order) {
      const j = judgments[sid];
      if (j?.ok === true) ok++;
      else if (j?.ok === false) ng++;
      if (j?.ok != null) judged++;
      if (rows[sid]?.dirty) dirty++;
    }
    return { total: order.length, ok, ng, judged, dirty };
  }, [order, judgments, rows]);

  // Filtered + sorted view of `order`. `order` stays the canonical model
  // order; only what the table renders changes. Verdict rank puts NG first
  // (what needs attention), then OK, then not-yet-judged.
  const visibleOrder = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = order.filter((sid) => {
      if (ngOnly && judgments[sid]?.ok !== false) return false;
      if (q) {
        const name = (sections[sid]?.name || sid.replace(/^elem:/, "")).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
    if (sortKey !== "default") {
      const rank = (sid: string) => {
        const ok = judgments[sid]?.ok;
        return ok === false ? 0 : ok === true ? 1 : 2; // NG, OK, unjudged
      };
      list = [...list].sort((a, b) => {
        if (sortKey === "name")
          return (sections[a]?.name || a).localeCompare(sections[b]?.name || b, undefined, { numeric: true });
        if (sortKey === "members")
          return (sections[b]?.elementKeys.length || 0) - (sections[a]?.elementKeys.length || 0);
        return rank(a) - rank(b); // verdict
      });
    }
    return list;
  }, [order, query, ngOnly, sortKey, judgments, sections]);

  function patchRow(sid: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch, dirty: true } }));
  }

  function updateSector(sid: string, key: SectorKey, field: keyof SectorFormValues, value: string) {
    setRows((prev) => {
      const r = prev[sid];
      const nextSec = { ...r.sectors, [key]: { ...r.sectors[key], [field]: value } };
      let synced = nextSec;
      // Keep linked stations identical for the collapsed modes — the saved
      // payload has three independent sector objects, so the linkage must be
      // maintained here rather than at save time.
      if (r.mode === "all") synced = { I: nextSec[key], M: nextSec[key], J: nextSec[key] };
      else if (r.mode === "endCenter" && (key === "I" || key === "J")) synced = { ...nextSec, I: nextSec[key], J: nextSec[key] };
      return { ...prev, [sid]: { ...r, sectors: synced, dirty: true } };
    });
  }

  function changeMode(sid: string, mode: BeamInputMode) {
    const r = rows[sid];
    if (!r) return;
    const wouldDiscard =
      (mode === "all" && !(sectorsEqual(r.sectors.I, r.sectors.M) && sectorsEqual(r.sectors.M, r.sectors.J))) ||
      (mode === "endCenter" && !sectorsEqual(r.sectors.I, r.sectors.J));
    if (wouldDiscard && !window.confirm(t("beam.modeChangeConfirm"))) return;
    setRows((prev) => {
      const cur = prev[sid];
      let sectors = cur.sectors;
      if (mode === "all") sectors = { I: cur.sectors.M, M: cur.sectors.M, J: cur.sectors.M };
      else if (mode === "endCenter") sectors = { I: cur.sectors.I, M: cur.sectors.M, J: cur.sectors.I };
      return { ...prev, [sid]: { ...cur, mode, sectors, dirty: true } };
    });
  }

  async function saveGroup(sid: string) {
    const r = rows[sid];
    const grp = sections[sid];
    if (!r || !grp) return;
    // Row cover AND shear spacing are mm; REBB expects the model's native
    // length unit, so convert both back on the way out.
    const payload = buildBeamPayload(shearDistToModel(r.sectors, unit), coverToModel(r.dt, unit), coverToModel(r.db, unit));
    setSavingSid(sid);
    setActionMsg({ ok: true, kind: "saving" });
    try {
      // REBB is keyed by SECTION number (see api/beam-sections.ts), so this
      // is a single write with the section id as the key — Gen NX applies it
      // to every element using that section automatically. The payload is the
      // canonical read shape (MAIN_BAR_TOP object + DT/DB); the server accepts
      // exactly that on write (live-verified 2026-07-24) and silently drops
      // the old `vMAIN_BAR_TOP` legacy shape, so we do NOT call toWritePayload.
      const res = await saveRebar("BEAM", sid, payload, conn);
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

  async function fetchDemand(sid: string) {
    const grp = sections[sid];
    if (!grp) return;
    // REBB/design tables are keyed per element, so query a representative
    // element of the section group (lowest id, deterministic).
    const repKey = [...grp.elementKeys].sort((a, b) => Number(a) - Number(b))[0];
    setFetchingSid(sid);
    try {
      const res = await getBeamDesignResult(repKey, conn);
      if (!res.ok) {
        setActionMsg({ ok: false, kind: "demandFail", res });
        return;
      }
      setDemand((prev) => ({ ...prev, [sid]: res.bySector }));
      const count = Object.keys(res.bySector).length;
      setActionMsg(count ? { ok: true, kind: "demandLoaded", count } : { ok: false, kind: "demandEmpty" });
    } catch (e) {
      setActionMsg({ ok: false, kind: "demandFail", res: { ok: false, error: String(e) } });
    } finally {
      setFetchingSid(null);
    }
  }

  // Board-wide demand fetch: one representative element (lowest id) per
  // section — same choice as the single fetch above — sent as one batch. The
  // backend queries each element separately (BC-TABLE's MEMB can't demux a
  // multi-element response), so a many-section model takes a few seconds.
  // Merges into existing demand so a section the batch skips keeps whatever
  // was already loaded for it.
  async function fetchAllDemand() {
    if (!order.length) return;
    const repBySid: Record<string, string> = {};
    const repKeys: string[] = [];
    for (const sid of order) {
      const grp = sections[sid];
      if (!grp || !grp.elementKeys.length) continue;
      const rep = [...grp.elementKeys].sort((a, b) => Number(a) - Number(b))[0];
      repBySid[sid] = rep;
      repKeys.push(rep);
    }
    if (!repKeys.length) return;
    setFetchingAll(true);
    setStatus({ ok: true, kind: "demandAllLoading" });
    try {
      const res = await getAllBeamDesignResults(repKeys, conn);
      if (!res.ok) {
        setStatus({ ok: false, kind: "demandFail", res });
        return;
      }
      const next: Record<string, DemandBySector> = {};
      let loaded = 0;
      for (const sid of order) {
        const rep = repBySid[sid];
        const bySector = rep ? res.byElem[rep] : undefined;
        if (bySector && Object.keys(bySector).length) {
          next[sid] = bySector;
          loaded++;
        }
      }
      setDemand((prev) => ({ ...prev, ...next }));
      setStatus({ ok: true, kind: "demandAllLoaded", loaded, total: order.length });
    } catch (e) {
      setStatus({ ok: false, kind: "demandFail", res: { ok: false, error: String(e) } });
    } finally {
      setFetchingAll(false);
    }
  }

  // Run the whole model's structural analysis (/doc/ANAL) so the design-check
  // results the "결과값 불러오기" button reads are up to date. Confirmed first
  // because it refreshes/invalidates the model's existing analysis results.
  // A long solve can outlast the serverless function: code "timeout"
  // (our abort) or "parse_error" (a raw platform 504) means the solve is
  // likely still running in Gen NX, not that it failed.
  async function runModelAnalysis() {
    if (!window.confirm(t("board.analyzeConfirm"))) return;
    setAnalyzing(true);
    setActionMsg({ ok: true, kind: "analyzing" });
    try {
      const res = await runAnalysis(conn);
      if (res.ok) {
        setActionMsg({ ok: true, kind: "analyzeDone" });
      } else if (res.code === "timeout" || res.code === "parse_error") {
        setActionMsg({ ok: false, kind: "analyzeRunning" });
      } else {
        setActionMsg({ ok: false, kind: "analyzeFail", res });
      }
    } catch (e) {
      setActionMsg({ ok: false, kind: "analyzeFail", res: { ok: false, error: String(e) } });
    } finally {
      setAnalyzing(false);
    }
  }

  const selected = selectedSid ? rows[selectedSid] : null;
  const selectedGrp = selectedSid ? sections[selectedSid] : null;
  const selectedJudge = selectedSid ? judgments[selectedSid] : null;
  // Stable reference (SectionPreview memoizes on `before` identity) with cover
  // normalized to mm so the loaded diagram matches the current one.
  const beforePreview = useMemo(
    () => (selectedGrp ? payloadCoverToMm(selectedGrp.payload, unit) : null),
    [selectedGrp, unit]
  );

  const visibleSectors: { key: SectorKey; labelKey: string }[] =
    selected?.mode === "all"
      ? [{ key: "M", labelKey: "beam.modeAllLabel" }]
      : selected?.mode === "endCenter"
        ? [
            { key: "I", labelKey: "beam.modeEndLabel" },
            { key: "M", labelKey: "js.sectorTitle.M" },
          ]
        : SECTORS.map((key) => ({ key, labelKey: `js.sectorTitle.${key}` }));

  function repSector(r: RowState): SectorFormValues {
    return r.sectors.M;
  }

  return (
    <div className="beam-board">
      {/* --- toolbar: connection-driven load + global materials --- */}
      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleList} disabled={listLoading}>
            {listLoading ? t("board.loadingBtn") : t("board.loadBtn")}
          </button>
          {order.length > 0 && (
            <button className="btn board-fetch-all" type="button" onClick={fetchAllDemand} disabled={fetchingAll}>
              {fetchingAll ? t("board.fetchingAll") : t("board.fetchAllBtn")}
            </button>
          )}
          <div className="board-mat">
            <span className="board-mat-title">{t("board.materialTitle")}</span>
            <label className="board-mat-fld">{t("beam.fck")}<input type="number" step="any" value={fck} onChange={(e) => setFck(e.target.value)} /></label>
            <label className="board-mat-fld">{t("beam.fy")}<input type="number" step="any" value={fy} onChange={(e) => setFy(e.target.value)} /></label>
            <label className="board-mat-fld">{t("beam.fyt")}<input type="number" step="any" value={fyt} onChange={(e) => setFyt(e.target.value)} /></label>
          </div>
        </div>
        {status && (
          <div className={"status show " + statusClass(status)} style={{ marginTop: 8 }}>
            {statusText(t, status)}
          </div>
        )}
        {!family && listLoadedOnce && (
          <div className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
            {t("board.unsupportedCode")}
          </div>
        )}
      </div>

      {/* --- summary strip --- */}
      {order.length > 0 && (
        <div className="board-summary">
          <div className="stat"><div className="k">{t("board.summaryTotal")}</div><div className="v">{summary.total}</div></div>
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
            {t("board.title")}{" "}
            {order.length > 0 && (
              <span className="board-count">
                {visibleOrder.length === order.length
                  ? `(${order.length})`
                  : `(${t("board.countFiltered", { shown: visibleOrder.length, total: order.length })})`}
              </span>
            )}
          </h2>
          <span className="board-hint">{t("board.tableHint")}</span>
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
            <button
              type="button"
              className={"board-ng-toggle" + (ngOnly ? " on" : "")}
              onClick={() => setNgOnly((v) => !v)}
              aria-pressed={ngOnly}
            >
              {t("board.ngOnly")}
            </button>
            <label className="board-sort">
              <span>{t("board.sortLabel")}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                <option value="default">{t("board.sortDefault")}</option>
                <option value="name">{t("board.sortName")}</option>
                <option value="verdict">{t("board.sortVerdict")}</option>
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
                <th>{t("board.colMode")}</th>
                <th>{t("js.topSpec")}</th>
                <th>{t("js.botSpec")}</th>
                <th>{t("js.stirrupSpec")}</th>
                <th>{t("board.colCover")}</th>
                <th>{t("board.colVerdict")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrder.map((sid) => {
                const r = rows[sid];
                const grp = sections[sid];
                if (!r || !grp) return null;
                const rep = repSector(r);
                const j = judgments[sid];
                const verdict =
                  j?.ok == null ? (
                    <span className="verdict none">—</span>
                  ) : j.ok ? (
                    <span className="verdict ok">OK <span className="rr">{(j.ratioFlex ?? 0).toFixed(2)}/{(j.ratioShear ?? 0).toFixed(2)}</span></span>
                  ) : (
                    <span className="verdict ng">NG <span className="rr">{(j.ratioFlex ?? 0).toFixed(2)}/{(j.ratioShear ?? 0).toFixed(2)}</span></span>
                  );
                return (
                  <tr key={sid} className={sid === selectedSid ? "sel" : ""} onClick={() => setSelectedSid(sid)}>
                    <td className="cell-section">
                      <span className="dirty-dot" style={{ visibility: r.dirty ? "visible" : "hidden" }} />
                      <span className="sect-nm">{grp.name || sid.replace(/^elem:/, "")}</span>
                    </td>
                    <td><span className="elem-badge" title={compressKeyRanges(grp.elementKeys)}>{t("board.memberCount", { count: grp.elementKeys.length })}</span></td>
                    <td><span className="mode-chip">{t(MODE_LABEL[r.mode])}</span></td>
                    <td className="mono">{rep.topNum && rep.topName ? <><b>{rep.topNum}</b>×<span className="bar-main">{rep.topName}</span></> : "—"}</td>
                    <td className="mono">{rep.botNum && rep.botName ? <><b>{rep.botNum}</b>×<span className="bar-main">{rep.botName}</span></> : "—"}</td>
                    <td className="mono">{rep.shearName ? <><span className="bar-stir">{rep.shearName}</span>@{rep.shearDist || "?"}</> : "—"}</td>
                    <td className="mono">{r.dt || "?"}/{r.db || "?"}</td>
                    <td>{verdict}</td>
                  </tr>
                );
              })}
              {order.length === 0 && (
                <tr>
                  <td colSpan={8} className="board-empty">{listLoadedOnce ? t("board.emptyList") : t("board.notLoaded")}</td>
                </tr>
              )}
              {order.length > 0 && visibleOrder.length === 0 && (
                <tr>
                  <td colSpan={8} className="board-empty">{t("board.filterEmpty")}</td>
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
              type="BEAM"
              titleKey="beam.previewTitle"
              before={beforePreview}
              after={buildBeamPayload(selected.sectors, selected.dt, selected.db)}
              dims={{ B: selected.b, H: selected.h }}
              sectorKeys={SECTORS}
              legend={
                <>
                  <span><i className="dot" style={{ background: "var(--main-bar)" }} />{t("common.mainBar")}</span>
                  <span><i className="dot" style={{ background: "var(--hoop)" }} />{t("beam.stirrup")}</span>
                </>
              }
            />
          </div>

          <div className="panel board-editor-card">
            <div className="board-detail-head">
              <div className="modeseg">
                {(["all", "endCenter", "each"] as BeamInputMode[]).map((m) => (
                  <button key={m} type="button" className={selected.mode === m ? "on" : ""} onClick={() => changeMode(selectedSid, m)}>
                    {t(MODE_LABEL[m])}
                  </button>
                ))}
              </div>
            </div>

            {visibleSectors.map(({ key, labelKey }) => (
              <div key={key} className="seg-edit">
                <div className="seg-title">{t(labelKey)}</div>
                <div className="row2">
                  <div className="field">
                    <label>{t("js.topSpec")}</label>
                    <BarSelect id={`bd-${key}-top`} placeholder="D22" value={selected.sectors[key].topName} onChange={(v) => updateSector(selectedSid, key, "topName", v)} />
                  </div>
                  <div className="field">
                    <label>{t("js.topCount")}</label>
                    <input type="number" value={selected.sectors[key].topNum} onChange={(e) => updateSector(selectedSid, key, "topNum", e.target.value)} />
                  </div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label>{t("js.botSpec")}</label>
                    <BarSelect id={`bd-${key}-bot`} placeholder="D22" value={selected.sectors[key].botName} onChange={(v) => updateSector(selectedSid, key, "botName", v)} />
                  </div>
                  <div className="field">
                    <label>{t("js.botCount")}</label>
                    <input type="number" value={selected.sectors[key].botNum} onChange={(e) => updateSector(selectedSid, key, "botNum", e.target.value)} />
                  </div>
                </div>
                <div className="row3">
                  <div className="field">
                    <label>{t("js.stirrupSpec")}</label>
                    <BarSelect id={`bd-${key}-stir`} placeholder="D13" value={selected.sectors[key].shearName} onChange={(v) => updateSector(selectedSid, key, "shearName", v)} />
                  </div>
                  <div className="field">
                    <label>{t("js.legCount")}</label>
                    <input type="number" value={selected.sectors[key].shearLeg} onChange={(e) => updateSector(selectedSid, key, "shearLeg", e.target.value)} />
                  </div>
                  <div className="field">
                    <label>{t("common.dist")} (mm)</label>
                    <input type="number" value={selected.sectors[key].shearDist} onChange={(e) => updateSector(selectedSid, key, "shearDist", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}

            <div className="seg-title">{t("board.geomTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("beam.dtLabel")} (mm)</label>
                <input type="number" step="any" value={selected.dt} onChange={(e) => patchRow(selectedSid, { dt: e.target.value })} /></div>
              <div className="field"><label>{t("beam.dbLabel")} (mm)</label>
                <input type="number" step="any" value={selected.db} onChange={(e) => patchRow(selectedSid, { db: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>{t("common.widthB")} (mm)</label>
                <input type="number" value={selected.b} onChange={(e) => patchRow(selectedSid, { b: e.target.value })} /></div>
              <div className="field"><label>{t("common.heightH")} (mm)</label>
                <input type="number" value={selected.h} onChange={(e) => patchRow(selectedSid, { h: e.target.value })} /></div>
            </div>

            {/* --- action bar: save · run analysis · load results --- */}
            <div className="board-actions">
              <button className="btn primary" type="button" onClick={() => saveGroup(selectedSid)} disabled={savingSid === selectedSid}>
                {t("board.saveGroupBtn", { count: selectedGrp.elementKeys.length })}
              </button>
              <button className="btn" type="button" onClick={runModelAnalysis} disabled={analyzing}>
                {analyzing ? t("board.analyzing") : t("board.runAnalysisBtn")}
              </button>
              <button className="btn" type="button" onClick={() => fetchDemand(selectedSid)} disabled={fetchingSid === selectedSid}>
                {fetchingSid === selectedSid ? t("board.fetchingDemand") : t("board.fetchDemandBtn")}
              </button>
              <span className="hint save-note">{selected.dirty ? t("board.unsavedNote") : t("board.savedNote")}</span>
            </div>
            <div className="hint board-actions-hint">{t("board.fetchDemandHint")}</div>
            {actionMsg && <div className={"status show " + statusClass(actionMsg)}>{statusText(t, actionMsg)}</div>}

            {/* --- live judgment (실시간 판정), directly under the action bar --- */}
            {selectedJudge && (
              <div className="judge-block">
                <div className="judge-title">{t("board.judgeTitle")}</div>
                <JudgeBar label={t("board.flexLabel")} sym="φMn" ratio={selectedJudge.ratioFlex} cap={selectedJudge.phiMnPos ?? selectedJudge.phiMnNeg} unit="kN·m" t={t} />
                <JudgeBar label={t("board.shearLabel")} sym="φVn" ratio={selectedJudge.ratioShear} cap={selectedJudge.phiVn} unit="kN" t={t} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JudgeBar({ label, sym, ratio, cap, unit, t }: { label: string; sym: string; ratio?: number; cap: number | null; unit: string; t: TFn }) {
  const has = ratio != null;
  const ok = (ratio ?? 0) <= 1;
  const pct = Math.min(ratio ?? 0, 1.15) * (100 / 1.15);
  return (
    <div className="judge-row">
      <div className="judge-row-top">
        <span className="judge-name">{label} <span>{sym}</span></span>
        <span className="judge-val">
          {cap != null ? `${cap.toFixed(0)} ${unit}` : "—"}
          {has && <b className={ok ? "ok" : "ng"}> · {ratio!.toFixed(2)}</b>}
        </span>
      </div>
      <div className="judge-track">
        {has && <div className={"judge-fill " + (ok ? "ok" : "ng")} style={{ width: pct.toFixed(1) + "%" }} />}
        <div className="judge-mark" style={{ left: (100 / 1.15).toFixed(1) + "%" }} />
      </div>
      {!has && <div className="judge-nodem">{t("board.noDemand")}</div>}
    </div>
  );
}
