import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useDesignCode } from "../context/DesignCodeContext";
import { getBeamDesignResult, listBeamSections, saveRebar, sectionGroupLabel, type ApiError, type BeamSectionGroup } from "../lib/api";
import { formulaFamily } from "../lib/rcBeamCheck";
import { MM_PER_UNIT } from "../data/rcCodePresets";
import {
  buildBeamPayload,
  detectInputMode,
  fillFromPayload,
  sectorsEqual,
  toWritePayload,
  type BeamInputMode,
  type SectorFormValues,
} from "../lib/beamRebarForm";
import type { TFn } from "../i18n/types";
import { judgeSection, type DemandBySector, type MatProps } from "../lib/beamBoard";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
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

function rowFromGroup(grp: BeamSectionGroup, defB: string, defH: string): RowState {
  const filled = fillFromPayload(grp.payload);
  return {
    sectors: filled.sectors,
    dt: filled.dt,
    db: filled.db,
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
function toMm(value: number, unit: string): number {
  const per = MM_PER_UNIT[unit];
  return per ? value * per : NaN;
}

const MODE_LABEL: Record<BeamInputMode, string> = { all: "beam.modeAll", endCenter: "beam.modeEndCenter", each: "beam.modeEach" };

export function BeamBoard() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { designCode, materialDB } = useDesignCode();

  const [sections, setSections] = useState<Record<string, BeamSectionGroup>>({});
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
      setListLoadedOnce(true);
      setStatus({ ok: true, kind: "listLoaded", count: Object.keys(res.sections).length });
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

  // Rebuild working rows whenever a fresh list arrives. Section grouping and
  // the "one section = identical rebar across its elements" rule come from
  // the backend (api/rebar-list.ts); here each group's representative
  // payload seeds one editable row.
  useEffect(() => {
    const sids = Object.keys(sections);
    const next: Record<string, RowState> = {};
    for (const sid of sids) next[sid] = rowFromGroup(sections[sid], defB, defH);
    setRows(next);
    setOrder(sids);
    setDemand({});
    setSelectedSid(sids.length ? sids[0] : null);
  }, [sections, defB, defH]);

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
        lengthUnit,
        n(r.b),
        n(r.h),
        toMm(n(r.dt), lengthUnit),
        toMm(n(r.db), lengthUnit),
        r.sectors,
        demand[sid] || {}
      );
    }
    return out;
  }, [family, order, rows, mat, materialDB, lengthUnit, demand]);

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
    const payload = buildBeamPayload(r.sectors, r.dt, r.db);
    const targets = grp.elementKeys;
    setSavingSid(sid);
    setStatus({ ok: true, kind: "saving" });
    try {
      const failedKeys: string[] = [];
      let lastFailure: ApiError | null = null;
      // Sequential (not Promise.all) — single fragile live Gen NX session,
      // and this yields exactly which elements failed. Same rationale as the
      // old BeamForm save.
      for (const k of targets) {
        const res = await saveRebar("BEAM", k, toWritePayload(payload), conn);
        if (!res.ok) {
          failedKeys.push(k);
          lastFailure = res;
        }
      }
      if (failedKeys.length && failedKeys.length < targets.length) {
        setStatus({ ok: false, kind: "saveBulkPartialFail", failedKeys, totalCount: targets.length, res: lastFailure! });
        return;
      }
      if (failedKeys.length) {
        setStatus({ ok: false, kind: "saveFail", res: lastFailure! });
        return;
      }
      setStatus({ ok: true, kind: "saveDone" });
      setRows((prev) => ({ ...prev, [sid]: { ...prev[sid], dirty: false } }));
    } catch (e) {
      setStatus({ ok: false, kind: "saveError", error: String(e) });
    } finally {
      setSavingSid(null);
    }
  }

  async function fetchDemand(sid: string) {
    const grp = sections[sid];
    if (!grp) return;
    const repKey = [...grp.elementKeys].sort((a, b) => Number(a) - Number(b))[0];
    setFetchingSid(sid);
    try {
      const res = await getBeamDesignResult(repKey, conn);
      if (res.ok) setDemand((prev) => ({ ...prev, [sid]: res.bySector }));
    } finally {
      setFetchingSid(null);
    }
  }

  const selected = selectedSid ? rows[selectedSid] : null;
  const selectedGrp = selectedSid ? sections[selectedSid] : null;
  const selectedJudge = selectedSid ? judgments[selectedSid] : null;

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
          <h2>{t("board.title")} {order.length > 0 && <span className="board-count">({order.length})</span>}</h2>
          <span className="board-hint">{t("board.tableHint")}</span>
        </div>
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
              {order.map((sid) => {
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
                    <td><span className="elem-badge" title={grp.elementKeys.join(", ")}>{t("board.memberCount", { count: grp.elementKeys.length })}</span></td>
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
                <div className="detail-el">{t("board.appliesTo", { count: selectedGrp.elementKeys.length, keys: selectedGrp.elementKeys.join(", ") })}</div>
              </div>
            </div>
            <SectionPreview
              type="BEAM"
              titleKey="beam.previewTitle"
              before={selectedGrp.payload}
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
            {/* --- live judgment bars --- */}
            {selectedJudge && (
              <div className="judge-block">
                <div className="judge-title">{t("board.judgeTitle")}</div>
                <JudgeBar label={t("board.flexLabel")} sym="φMn" ratio={selectedJudge.ratioFlex} cap={selectedJudge.phiMnPos ?? selectedJudge.phiMnNeg} unit="kN·m" t={t} />
                <JudgeBar label={t("board.shearLabel")} sym="φVn" ratio={selectedJudge.ratioShear} cap={selectedJudge.phiVn} unit="kN" t={t} />
                <button className="btn" type="button" style={{ marginTop: 8 }} onClick={() => fetchDemand(selectedSid)} disabled={fetchingSid === selectedSid}>
                  {fetchingSid === selectedSid ? t("board.fetchingDemand") : t("board.fetchDemandBtn")}
                </button>
                <div className="hint" style={{ margin: "6px 0 0" }}>{t("board.fetchDemandHint")}</div>
              </div>
            )}
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
                    <label>{t("common.dist")}</label>
                    <input type="number" value={selected.sectors[key].shearDist} onChange={(e) => updateSector(selectedSid, key, "shearDist", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}

            <div className="seg-title">{t("board.geomTitle")}</div>
            <div className="row2">
              <div className="field"><label>{t("beam.dtLabel")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
                <input type="number" step="any" value={selected.dt} onChange={(e) => patchRow(selectedSid, { dt: e.target.value })} /></div>
              <div className="field"><label>{t("beam.dbLabel")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
                <input type="number" step="any" value={selected.db} onChange={(e) => patchRow(selectedSid, { db: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>{t("common.widthB")} (mm)</label>
                <input type="number" value={selected.b} onChange={(e) => patchRow(selectedSid, { b: e.target.value })} /></div>
              <div className="field"><label>{t("common.heightH")} (mm)</label>
                <input type="number" value={selected.h} onChange={(e) => patchRow(selectedSid, { h: e.target.value })} /></div>
            </div>

            <div className="save-row">
              <button className="btn primary" type="button" onClick={() => saveGroup(selectedSid)} disabled={savingSid === selectedSid}>
                {t("board.saveGroupBtn", { count: selectedGrp.elementKeys.length })}
              </button>
              <span className="hint" style={{ margin: 0 }}>{selected.dirty ? t("board.unsavedNote") : t("board.savedNote")}</span>
            </div>
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
