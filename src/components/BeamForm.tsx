import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { listRebar, saveRebar } from "../lib/api";
import { errText } from "../lib/errText";
import { SectionPreview } from "./SectionPreview";
import { SECTORS, type BeamItem, type BeamPayload, type BeamSector, type RebarLayer, type SectorKey } from "../types/rebar";

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

export function BeamForm() {
  const { t } = useI18n();
  const { payload: conn } = useConn();

  const [keyInput, setKeyInput] = useState("");
  const [list, setList] = useState<Record<string, BeamPayload>>({});
  const [existingKey, setExistingKey] = useState("");
  const [keylistText, setKeylistText] = useState("");
  const [loaded, setLoaded] = useState<BeamPayload | null>(null);
  const [sectors, setSectors] = useState<Record<SectorKey, SectorFormValues>>(emptySectors());
  const [dt, setDt] = useState("");
  const [db, setDb] = useState("");
  const [dimB, setDimB] = useState("300");
  const [dimH, setDimH] = useState("600");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);

  const afterPayload = useMemo(() => buildBeamPayload(sectors, dt, db), [sectors, dt, db]);

  function updateSector(key: SectorKey, field: keyof SectorFormValues, value: string) {
    setSectors((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function copyMtoIJ() {
    setSectors((prev) => ({ I: { ...prev.M }, M: prev.M, J: { ...prev.M } }));
  }

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listRebar<BeamPayload>("BEAM", conn);
      if (!res.ok) {
        setStatus({ ok: false, msg: t("js.listFail", { error: errText(t, res) }) });
        return;
      }
      setList(res.data);
      setListLoadedOnce(true);
      const keys = Object.keys(res.data);
      setKeylistText(keys.length ? t("js.itemsFound", { count: keys.length, keys: keys.join(", ") }) : t("js.noItems"));
      setStatus({ ok: true, msg: t("js.listLoaded", { count: keys.length }) });
    } catch (e) {
      setStatus({ ok: false, msg: t("js.listError", { error: String(e) }) });
    } finally {
      setListLoading(false);
    }
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
      const res = await saveRebar("BEAM", keyInput, payload, conn);
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
                {k}
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
                  <label>{t("js.topSpec")}</label>
                  {sectorField(key, "topName", "text", "D25")}
                </div>
                <div className="field">
                  <label>{t("js.topCount")}</label>
                  {sectorField(key, "topNum", "number")}
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>{t("js.botSpec")}</label>
                  {sectorField(key, "botName", "text", "D22")}
                </div>
                <div className="field">
                  <label>{t("js.botCount")}</label>
                  {sectorField(key, "botNum", "number")}
                </div>
              </div>
              <div className="row3">
                <div className="field">
                  <label>{t("js.stirrupSpec")}</label>
                  {sectorField(key, "shearName", "text", "D13")}
                </div>
                <div className="field">
                  <label>{t("js.legCount")}</label>
                  {sectorField(key, "shearLeg", "number")}
                </div>
                <div className="field">
                  <label>{t("common.dist")}</label>
                  {sectorField(key, "shearDist", "number")}
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>{t("js.skinSpec")}</label>
                  {sectorField(key, "skinName", "text", "D13")}
                </div>
                <div className="field">
                  <label>{t("js.skinCount")}</label>
                  {sectorField(key, "skinNum", "number")}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="subhead">{t("beam.coverTitle")}</div>
        <div className="row2">
          <div className="field">
            <label>{t("beam.dtLabel")}</label>
            <input type="number" step="any" value={dt} onChange={(e) => setDt(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("beam.dbLabel")}</label>
            <input type="number" step="any" value={db} onChange={(e) => setDb(e.target.value)} />
          </div>
        </div>

        <div className="subhead">{t("common.dimsHintTitle")}</div>
        <div className="row2">
          <div className="field">
            <label>{t("common.widthB")}</label>
            <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.heightH")}</label>
            <input type="number" value={dimH} onChange={(e) => setDimH(e.target.value)} />
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
