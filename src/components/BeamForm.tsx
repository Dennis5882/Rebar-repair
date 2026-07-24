import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { saveRebar, sectionGroupLabel, type ApiError } from "../lib/api";
import { isListStatus, keylistText, statusClass, statusText } from "../lib/statusMsg";
import { useRebarList } from "../hooks/useRebarList";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import { BeamCheckSection } from "./BeamCheckSection";
import { BeamRebarTable } from "./BeamRebarTable";
import {
  buildBeamPayload,
  detectInputMode,
  emptySectors,
  fillFromPayload,
  sectorsEqual,
  toWritePayload,
  type BeamInputMode,
  type SectorFormValues,
} from "../lib/beamRebarForm";
import { SECTORS, type BeamPayload, type SectorKey } from "../types/rebar";

export function BeamForm() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { list, names, sections, keylistMsg, listLoading, listLoadedOnce, status, setStatus, handleList } = useRebarList<BeamPayload>(
    "BEAM",
    conn
  );

  const [keyInput, setKeyInput] = useState("");
  const [existingKey, setExistingKey] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [loaded, setLoaded] = useState<BeamPayload | null>(null);
  const [sectors, setSectors] = useState<Record<SectorKey, SectorFormValues>>(emptySectors());
  const [dt, setDt] = useState("");
  const [db, setDb] = useState("");
  const [dimB, setDimB] = useState("300");
  const [dimH, setDimH] = useState("600");
  const [saving, setSaving] = useState(false);
  const [tableMode, setTableMode] = useState(false);
  const [inputMode, setInputMode] = useState<BeamInputMode>("each");

  const afterPayload = useMemo(() => buildBeamPayload(sectors, dt, db), [sectors, dt, db]);

  // Derived, not its own state — deriving from selectedSectionId + the
  // current `sections` means a stale group can never be saved: if the list
  // is refreshed while a section is selected, this recomputes from the
  // fresh grouping (or empties out if that section no longer exists)
  // instead of keeping a frozen snapshot from before the refresh.
  const selectedElementKeys = useMemo(
    () => (selectedSectionId ? sections[selectedSectionId]?.elementKeys ?? [] : []),
    [selectedSectionId, sections]
  );

  // In "all"/"endCenter" mode, editing one sector's field must also write
  // through to whichever sectors it's linked to (I<->J, or I<->M<->J) so
  // the underlying I/M/J data actually stays identical — the payload sent
  // to Gen NX has no separate "mode" flag, only three independent sector
  // objects, so the sync has to happen here rather than at save time.
  function updateSector(key: SectorKey, field: keyof SectorFormValues, value: string) {
    setSectors((prev) => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } };
      if (inputMode === "all") return { I: next[key], M: next[key], J: next[key] };
      if (inputMode === "endCenter" && (key === "I" || key === "J")) return { ...next, I: next[key], J: next[key] };
      return next;
    });
  }

  function copyMtoIJ() {
    setSectors((prev) => ({ I: { ...prev.M }, M: prev.M, J: { ...prev.M } }));
  }

  // A mode switch silently collapses whichever sector(s) it hides into a
  // copy of the one it keeps — harmless if they already matched, but a real
  // discard if they didn't (e.g. a loaded "each"-mode beam with genuinely
  // different J, switched to "endCenter"). Only interrupt with a confirm
  // when something would actually be lost.
  function handleModeChange(mode: BeamInputMode) {
    const wouldDiscard =
      (mode === "all" && !(sectorsEqual(sectors.I, sectors.M) && sectorsEqual(sectors.M, sectors.J))) ||
      (mode === "endCenter" && !sectorsEqual(sectors.I, sectors.J));
    if (wouldDiscard && !window.confirm(t("beam.modeChangeConfirm"))) return;
    setInputMode(mode);
    setSectors((prev) => {
      if (mode === "all") return { I: prev.M, M: prev.M, J: prev.M };
      if (mode === "endCenter") return { I: prev.I, M: prev.M, J: prev.I };
      return prev;
    });
  }

  function handleKeyInputChange(value: string) {
    setKeyInput(value);
    // Typing a different key by hand means "target just this one element",
    // not the section group that happened to be picked from the dropdown
    // before — otherwise a stale group could silently get bulk-saved.
    // Clearing existingKey too, not just the section/group state, matters
    // because existingKey alone drives BeamCheckSection's design-result
    // fetch and SectionPreview's "loaded" hint — leaving it pointed at the
    // previous selection would silently show/check the wrong element.
    setSelectedSectionId("");
    setExistingKey("");
  }

  function loadMember(key: string, payload: BeamPayload) {
    setExistingKey(key);
    setKeyInput(key);
    setLoaded(payload);
    const filled = fillFromPayload(payload);
    setSectors(filled.sectors);
    setInputMode(detectInputMode(filled.sectors));
    setDt(filled.dt);
    setDb(filled.db);
  }

  function handleSelectExisting(sid: string) {
    setSelectedSectionId(sid);
    if (!sid) {
      setExistingKey("");
      return;
    }
    const grp = sections[sid];
    if (!grp) return;
    const repKey = [...grp.elementKeys].sort((a, b) => Number(a) - Number(b))[0];
    loadMember(repKey, grp.payload);
  }

  // Lets a user inspect any individual element within a multi-element
  // section group (not just the lowest-numbered representative) — the
  // group's own REBB record, not just the representative's, since `list`
  // already holds every element's real saved data. Saving still applies
  // whatever's now in the form to every element in `selectedElementKeys`.
  function handleSelectMember(key: string) {
    const payload = list[key];
    if (!payload) return;
    loadMember(key, payload);
  }

  async function handleSave() {
    if (!keyInput) {
      setStatus({ ok: false, kind: "keyRequired" });
      return;
    }
    const payload = buildBeamPayload(sectors, dt, db);
    const targets = selectedElementKeys.length ? selectedElementKeys : [keyInput];
    setSaving(true);
    setStatus({ ok: true, kind: "saving" });
    try {
      // Sequential, not Promise.all — this API bridges to a single live Gen
      // NX desktop session (not a scalable stateless service), and this
      // project has documented that session hanging/crashing under other
      // concurrent-call patterns. Sequential writes also make it possible
      // to know exactly which elements succeeded vs failed below.
      const failedKeys: string[] = [];
      let lastFailure: ApiError | null = null;
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
      setLoaded(payload);
    } catch (e) {
      setStatus({ ok: false, kind: "saveError", error: String(e) });
    } finally {
      setSaving(false);
    }
  }

  const visibleSectors: { key: SectorKey; labelKey: string }[] =
    inputMode === "all"
      ? [{ key: "M", labelKey: "beam.modeAllLabel" }]
      : inputMode === "endCenter"
        ? [
            { key: "I", labelKey: "beam.modeEndLabel" },
            { key: "M", labelKey: "js.sectorTitle.M" },
          ]
        : SECTORS.map((key) => ({ key, labelKey: `js.sectorTitle.${key}` }));

  const sectorField = (key: SectorKey, field: keyof SectorFormValues, type: "text" | "number" = "text", placeholder?: string) => (
    <input
      id={`BEAM-${key}-${field}`}
      type={type}
      step={type === "number" ? "any" : undefined}
      placeholder={placeholder}
      value={sectors[key][field]}
      onChange={(e) => updateSector(key, field, e.target.value)}
    />
  );

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>{t("common.targetTitle")}</h2>
        <div className="select-row">
          <div className="field">
            <label htmlFor="BEAM-key">{t("common.sectionKeyLabel")}</label>
            <input id="BEAM-key" type="text" placeholder={t("beam.keyPlaceholder")} value={keyInput} onChange={(e) => handleKeyInputChange(e.target.value)} />
          </div>
          <button className="btn" type="button" onClick={handleList} disabled={listLoading}>
            {t("common.loadListBtn")}
          </button>
        </div>
        {status && isListStatus(status) && (
          <div className={"status show " + statusClass(status)} style={{ marginTop: 4 }}>
            {statusText(t, status)}
          </div>
        )}
        <div className="field">
          <label htmlFor="BEAM-existing">{t("common.existingSectionLabel")}</label>
          <select id="BEAM-existing" value={selectedSectionId} onChange={(e) => handleSelectExisting(e.target.value)}>
            <option value="">{listLoadedOnce ? t("js.selectDefault") : t("common.existingDefaultOption")}</option>
            {Object.entries(sections).map(([sid, grp]) => (
              <option key={sid} value={sid}>
                {sectionGroupLabel(t, sid, grp)}
              </option>
            ))}
          </select>
        </div>
        <div className="keylist">{keylistText(t, keylistMsg)}</div>

        {selectedElementKeys.length > 1 && (
          <div className="field">
            <label htmlFor="BEAM-member">{t("beam.memberPreviewLabel")}</label>
            <select id="BEAM-member" value={existingKey} onChange={(e) => handleSelectMember(e.target.value)}>
              {selectedElementKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <div className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
              {t("beam.memberPreviewHint")}
            </div>
          </div>
        )}

        <div className="field" style={{ marginTop: 8 }}>
          <label>{t("beam.modeLabel")}</label>
          <div className="radio-row">
            {(["all", "endCenter", "each"] as BeamInputMode[]).map((mode) => (
              <label key={mode} className="radio-option">
                <input type="radio" name="BEAM-inputMode" checked={inputMode === mode} onChange={() => handleModeChange(mode)} />
                {t(`beam.mode${mode === "all" ? "All" : mode === "endCenter" ? "EndCenter" : "Each"}`)}
              </label>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
            {t("beam.modeHint")}
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn" type="button" onClick={() => setTableMode((v) => !v)}>
            {tableMode ? t("common.formViewBtn") : t("common.tableViewBtn")}
          </button>
        </div>
        {tableMode && <div className="hint" style={{ marginTop: 6, marginBottom: 0 }}>{t("common.tableHint")}</div>}
      </div>

      {/* Both branches stay mounted, toggled via display instead of a
          conditional unmount/remount — BeamRebarTable keeps its own
          per-row edit state locally, and unmounting it (as a ternary would)
          silently threw away any unsaved cell edits the moment the user
          switched views, even just to glance at the single-item preview. */}
      <div style={{ display: tableMode ? undefined : "none" }}>
        <BeamRebarTable list={list} names={names} conn={conn} />
      </div>
      <div style={{ display: tableMode ? "none" : undefined }}>
        <div className="editor-grid">
          <div className="panel">
            <h2>{t("beam.sectorsTitle")}</h2>
            <div>
              {visibleSectors.map(({ key, labelKey }) => (
            <div key={key}>
              <div className="subhead">
                {t(labelKey)}
                {inputMode === "each" && key === "M" && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "2px 8px", fontSize: 11, marginLeft: 6 }}
                    onClick={copyMtoIJ}
                  >
                    {t("js.copyToIJ")}
                  </button>
                )}
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor={`BEAM-${key}-topName`}>{t("js.topSpec")}</label>
                  <BarSelect
                    id={`BEAM-${key}-topName`}
                    placeholder="D25"
                    value={sectors[key].topName}
                    onChange={(v) => updateSector(key, "topName", v)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`BEAM-${key}-topNum`}>{t("js.topCount")}</label>
                  {sectorField(key, "topNum", "number")}
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor={`BEAM-${key}-botName`}>{t("js.botSpec")}</label>
                  <BarSelect
                    id={`BEAM-${key}-botName`}
                    placeholder="D22"
                    value={sectors[key].botName}
                    onChange={(v) => updateSector(key, "botName", v)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`BEAM-${key}-botNum`}>{t("js.botCount")}</label>
                  {sectorField(key, "botNum", "number")}
                </div>
              </div>
              <div className="row3">
                <div className="field">
                  <label htmlFor={`BEAM-${key}-shearName`}>{t("js.stirrupSpec")}</label>
                  <BarSelect
                    id={`BEAM-${key}-shearName`}
                    placeholder="D13"
                    value={sectors[key].shearName}
                    onChange={(v) => updateSector(key, "shearName", v)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`BEAM-${key}-shearLeg`}>{t("js.legCount")}</label>
                  {sectorField(key, "shearLeg", "number")}
                </div>
                <div className="field">
                  <label htmlFor={`BEAM-${key}-shearDist`}>{t("common.dist")}</label>
                  {sectorField(key, "shearDist", "number")}
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor={`BEAM-${key}-skinName`}>{t("js.skinSpec")}</label>
                  <BarSelect
                    id={`BEAM-${key}-skinName`}
                    placeholder="D13"
                    value={sectors[key].skinName}
                    onChange={(v) => updateSector(key, "skinName", v)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`BEAM-${key}-skinNum`}>{t("js.skinCount")}</label>
                  {sectorField(key, "skinNum", "number")}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="subhead">{t("beam.coverTitle")}</div>
        <div className="row2">
          <div className="field">
            <label htmlFor="BEAM-dt">{t("beam.dtLabel")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
            <input id="BEAM-dt" type="number" step="any" value={dt} onChange={(e) => setDt(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="BEAM-db">{t("beam.dbLabel")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
            <input id="BEAM-db" type="number" step="any" value={db} onChange={(e) => setDb(e.target.value)} />
          </div>
        </div>

        <div className="subhead">{t("common.dimsHintTitle")}</div>
        <div className="row2">
          <div className="field">
            <label htmlFor="BEAM-dimB">{t("common.widthB")}</label>
            <input id="BEAM-dimB" type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="BEAM-dimH">{t("common.heightH")}</label>
            <input id="BEAM-dimH" type="number" value={dimH} onChange={(e) => setDimH(e.target.value)} />
          </div>
        </div>

        {selectedElementKeys.length > 1 && (
          <div className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            {t("common.bulkSaveHint", { count: selectedElementKeys.length, keys: selectedElementKeys.join(", ") })}
          </div>
        )}
        <div className="btn-row">
          <button className="btn primary" type="button" onClick={handleSave} disabled={saving}>
            {t("common.saveBtn")}
          </button>
        </div>
        {status && !isListStatus(status) && <div className={"status show " + statusClass(status)}>{statusText(t, status)}</div>}

        <BeamCheckSection memberKey={existingKey} sectors={sectors} dimB={dimB} dimH={dimH} dt={dt} db={db} lengthUnit={lengthUnit} />
      </div>

      <SectionPreview
        type="BEAM"
        titleKey="beam.previewTitle"
        before={loaded}
        after={afterPayload}
        dims={{ B: dimB, H: dimH }}
        sectorKeys={SECTORS}
        loadedInfo={existingKey ? { key: existingKey, name: names[existingKey] } : undefined}
        legend={
          <>
            <span>
              <i className="dot" style={{ background: "var(--main-bar)" }} />
              {t("common.mainBar")}
            </span>
            <span>
              <i className="dot" style={{ background: "var(--hoop)" }} />
              {t("beam.stirrup")}
            </span>
          </>
        }
      />
        </div>
      </div>
    </div>
  );
}
