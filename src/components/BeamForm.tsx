import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { saveRebar } from "../lib/api";
import { errText } from "../lib/errText";
import { useRebarList } from "../hooks/useRebarList";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import {
  SECTORS,
  type BeamItem,
  type BeamPayload,
  type BeamSector,
  type BeamWriteItem,
  type BeamWritePayload,
  type BeamWriteSector,
  type RcBeamMainBarLayerEntry,
  type RebarLayer,
  type SectorKey,
} from "../types/rebar";

interface SectorFormValues {
  topName: string;
  topNum: string;
  botName: string;
  botNum: string;
  shearName: string;
  shearLeg: string;
  shearDist: string;
  skinName: string;
  skinNum: string;
}

const EMPTY_SECTOR: SectorFormValues = {
  topName: "",
  topNum: "",
  botName: "",
  botNum: "",
  shearName: "",
  shearLeg: "",
  shearDist: "",
  skinName: "",
  skinNum: "",
};

function emptySectors(): Record<SectorKey, SectorFormValues> {
  return { I: { ...EMPTY_SECTOR }, M: { ...EMPTY_SECTOR }, J: { ...EMPTY_SECTOR } };
}

function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}
function firstLayer(obj?: Record<string, RebarLayer>): RebarLayer {
  if (!obj) return {};
  const keys = Object.keys(obj);
  return keys.length ? obj[keys[0]] : {};
}

function buildBeamSector(vals: SectorFormValues): BeamSector {
  const sector: BeamSector = {};
  const topNum = num(vals.topNum);
  if (vals.topName && topNum) sector.MAIN_BAR_TOP = { LAYER1: { NAME: vals.topName, NUM: topNum } };
  const botNum = num(vals.botNum);
  if (vals.botName && botNum) sector.MAIN_BAR_BOT = { LAYER1: { NAME: vals.botName, NUM: botNum } };
  if (vals.shearName) sector.SHEAR_BAR = { NAME: vals.shearName, LEG: num(vals.shearLeg), DIST: num(vals.shearDist) };
  if (vals.skinName) {
    sector.SKIN_BAR_NAME = vals.skinName;
    sector.SKIN_BAR_NUM = num(vals.skinNum);
  }
  return sector;
}

function buildBeamPayload(sectors: Record<SectorKey, SectorFormValues>, dt: string, db: string): BeamPayload {
  return {
    ITEMS: [
      {
        BAR_SECTOR_I: buildBeamSector(sectors.I),
        BAR_SECTOR_M: buildBeamSector(sectors.M),
        BAR_SECTOR_J: buildBeamSector(sectors.J),
        DT: num(dt),
        DB: num(db),
      },
    ],
  };
}

function fillFromPayload(payload: BeamPayload): { sectors: Record<SectorKey, SectorFormValues>; dt: string; db: string } {
  const it: Partial<BeamItem> = payload.ITEMS?.[0] || {};
  const sectors = emptySectors();
  for (const key of SECTORS) {
    const sector: BeamSector = it[`BAR_SECTOR_${key}`] || {};
    const top = firstLayer(sector.MAIN_BAR_TOP);
    const bot = firstLayer(sector.MAIN_BAR_BOT);
    const shear = sector.SHEAR_BAR || {};
    sectors[key] = {
      topName: toStr(top.NAME),
      topNum: toStr(top.NUM),
      botName: toStr(bot.NAME),
      botNum: toStr(bot.NUM),
      shearName: toStr(shear.NAME),
      shearLeg: toStr(shear.LEG),
      shearDist: toStr(shear.DIST),
      skinName: toStr(sector.SKIN_BAR_NAME),
      skinNum: toStr(sector.SKIN_BAR_NUM),
    };
  }
  return { sectors, dt: toStr(it.DT), db: toStr(it.DB) };
}

// GET returns MAIN_BAR_TOP/BOT as LAYER-keyed objects with DT/DB flat on the
// item (confirmed live). Writing back uses a different, older field-naming
// convention that the manual's own worked example and the midas-nx SDK's
// live-verified write test both use instead — see the BeamWriteItem doc
// comment in types/rebar.ts. This converts the canonical (read-shape) form
// state into that write shape only at the point of actually saving, so the
// live preview diagram (which reads the canonical shape) is unaffected.
function toWriteSector(sector: BeamSector): BeamWriteSector {
  const write: BeamWriteSector = {};
  if (sector.MAIN_BAR_TOP) {
    write.vMAIN_BAR_TOP = Object.values(sector.MAIN_BAR_TOP).map(
      (layer, i): RcBeamMainBarLayerEntry => ({ LAYER: (i + 1) as 1 | 2, NAME: layer.NAME || "", NUM: layer.NUM || 0 })
    );
  }
  if (sector.MAIN_BAR_BOT) {
    write.vMAIN_BAR_BOT = Object.values(sector.MAIN_BAR_BOT).map(
      (layer, i): RcBeamMainBarLayerEntry => ({ LAYER: (i + 1) as 1 | 2, NAME: layer.NAME || "", NUM: layer.NUM || 0 })
    );
  }
  if (sector.SHEAR_BAR) write.SHEAR_BAR = sector.SHEAR_BAR;
  if (sector.SKIN_BAR_NAME) {
    write.SKIN_BAR_NAME = sector.SKIN_BAR_NAME;
    write.SKIN_BAR_NUM = sector.SKIN_BAR_NUM;
  }
  return write;
}

function toWritePayload(payload: BeamPayload): BeamWritePayload {
  const it: Partial<BeamItem> = payload.ITEMS?.[0] || {};
  const item: BeamWriteItem = {
    BAR_SECTOR_I: toWriteSector(it.BAR_SECTOR_I || {}),
    BAR_SECTOR_M: toWriteSector(it.BAR_SECTOR_M || {}),
    BAR_SECTOR_J: toWriteSector(it.BAR_SECTOR_J || {}),
    MAIN_BAR_DC_TOP: it.DT,
    MAIN_BAR_DC_BOT: it.DB,
  };
  return { ITEMS: [item] };
}

export function BeamForm() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { list, names, keylistText, listLoading, listLoadedOnce, status, setStatus, handleList } = useRebarList<BeamPayload>(
    "BEAM",
    conn
  );

  const [keyInput, setKeyInput] = useState("");
  const [existingKey, setExistingKey] = useState("");
  const [loaded, setLoaded] = useState<BeamPayload | null>(null);
  const [sectors, setSectors] = useState<Record<SectorKey, SectorFormValues>>(emptySectors());
  const [dt, setDt] = useState("");
  const [db, setDb] = useState("");
  const [dimB, setDimB] = useState("300");
  const [dimH, setDimH] = useState("600");
  const [saving, setSaving] = useState(false);

  const afterPayload = useMemo(() => buildBeamPayload(sectors, dt, db), [sectors, dt, db]);

  function updateSector(key: SectorKey, field: keyof SectorFormValues, value: string) {
    setSectors((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function copyMtoIJ() {
    setSectors((prev) => ({ I: { ...prev.M }, M: prev.M, J: { ...prev.M } }));
  }

  function handleSelectExisting(key: string) {
    setExistingKey(key);
    if (!key) return;
    setKeyInput(key);
    const payload = list[key];
    setLoaded(payload);
    const filled = fillFromPayload(payload);
    setSectors(filled.sectors);
    setDt(filled.dt);
    setDb(filled.db);
  }

  async function handleSave() {
    if (!keyInput) {
      setStatus({ ok: false, msg: t("js.keyRequired") });
      return;
    }
    const payload = buildBeamPayload(sectors, dt, db);
    setSaving(true);
    setStatus({ ok: true, msg: t("js.saving") });
    try {
      const res = await saveRebar("BEAM", keyInput, toWritePayload(payload), conn);
      if (!res.ok) {
        setStatus({ ok: false, msg: t("js.saveFail", { error: errText(t, res) }) });
        return;
      }
      setStatus({ ok: true, msg: t("js.saveDone") });
      setLoaded(payload);
    } catch (e) {
      setStatus({ ok: false, msg: t("js.saveError", { error: String(e) }) });
    } finally {
      setSaving(false);
    }
  }

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
    <div className="editor-grid">
      <div className="panel">
        <h2>{t("common.targetTitle")}</h2>
        <div className="select-row">
          <div className="field">
            <label htmlFor="BEAM-key">{t("common.sectionKeyLabel")}</label>
            <input id="BEAM-key" type="text" placeholder={t("beam.keyPlaceholder")} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          </div>
          <button className="btn" type="button" onClick={handleList} disabled={listLoading}>
            {t("common.loadListBtn")}
          </button>
        </div>
        <div className="field">
          <label htmlFor="BEAM-existing">{t("common.existingSectionLabel")}</label>
          <select id="BEAM-existing" value={existingKey} onChange={(e) => handleSelectExisting(e.target.value)}>
            <option value="">{listLoadedOnce ? t("js.selectDefault") : t("common.existingDefaultOption")}</option>
            {Object.keys(list).map((k) => (
              <option key={k} value={k}>
                {names[k] ? `${names[k]} — ${k}` : k}
              </option>
            ))}
          </select>
        </div>
        <div className="keylist">{keylistText}</div>

        <h2 style={{ marginTop: 16 }}>{t("beam.sectorsTitle")}</h2>
        <div>
          {SECTORS.map((key) => (
            <div key={key}>
              <div className="subhead">
                {t(`js.sectorTitle.${key}`)}
                {key === "M" && (
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

        <div className="btn-row">
          <button className="btn primary" type="button" onClick={handleSave} disabled={saving}>
            {t("common.saveBtn")}
          </button>
        </div>
        {status && <div className={"status show " + (status.ok ? "ok" : "err")}>{status.msg}</div>}
      </div>

      <SectionPreview
        type="BEAM"
        titleKey="beam.previewTitle"
        before={loaded}
        after={afterPayload}
        dims={{ B: dimB, H: dimH }}
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
  );
}
