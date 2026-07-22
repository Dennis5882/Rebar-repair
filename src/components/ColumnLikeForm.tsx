import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { listRebar, saveRebar } from "../lib/api";
import { errText } from "../lib/errText";
import { SectionPreview } from "./SectionPreview";
import type { ColumnLikeItem, ColumnLikePayload } from "../types/rebar";

interface FormState {
  mainName: string;
  mainNum: string;
  mainRow: string;
  useCorner: boolean;
  cornerName: string;
  endName: string;
  endLegY: string;
  endLegZ: string;
  endDist: string;
  cenName: string;
  cenLegY: string;
  cenLegZ: string;
  cenDist: string;
  doVal: string;
  hoopType: string;
  hookType: string;
}

const EMPTY: FormState = {
  mainName: "",
  mainNum: "",
  mainRow: "",
  useCorner: false,
  cornerName: "",
  endName: "",
  endLegY: "",
  endLegZ: "",
  endDist: "",
  cenName: "",
  cenLegY: "",
  cenLegZ: "",
  cenDist: "",
  doVal: "",
  hoopType: "Ties",
  hookType: "0",
};

function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function buildPayload(form: FormState, isColumn: boolean): ColumnLikePayload {
  const item: ColumnLikeItem = {
    MAIN_BAR: { NAME: form.mainName, NUM: num(form.mainNum), ROW: num(form.mainRow) },
    SHEAR_BAR_END: { NAME: form.endName, LEG_Y: num(form.endLegY), LEG_Z: num(form.endLegZ), DIST: num(form.endDist) },
    SHEAR_BAR_CEN: { NAME: form.cenName, LEG_Y: num(form.cenLegY), LEG_Z: num(form.cenLegZ), DIST: num(form.cenDist) },
    DO: num(form.doVal),
    HOOP_TYPE: form.hoopType,
  };
  if (isColumn) {
    item.MAIN_BAR!.USE_CORNER = form.useCorner;
    if (form.useCorner) item.MAIN_BAR!.NAME_CORNER = form.cornerName;
    item.HOOK_TYPE = Number(form.hookType);
  }
  return { ITEMS: [item] };
}

function fillForm(payload: ColumnLikePayload, isColumn: boolean): FormState {
  const it: ColumnLikeItem = payload.ITEMS?.[0] || {};
  const mb = it.MAIN_BAR || {};
  const se = it.SHEAR_BAR_END || {};
  const sc = it.SHEAR_BAR_CEN || {};
  return {
    mainName: toStr(mb.NAME),
    mainNum: toStr(mb.NUM),
    mainRow: toStr(mb.ROW),
    useCorner: isColumn ? !!mb.USE_CORNER : false,
    cornerName: toStr(mb.NAME_CORNER),
    endName: toStr(se.NAME),
    endLegY: toStr(se.LEG_Y),
    endLegZ: toStr(se.LEG_Z),
    endDist: toStr(se.DIST),
    cenName: toStr(sc.NAME),
    cenLegY: toStr(sc.LEG_Y),
    cenLegZ: toStr(sc.LEG_Z),
    cenDist: toStr(sc.DIST),
    doVal: toStr(it.DO),
    hoopType: it.HOOP_TYPE || "Ties",
    hookType: isColumn ? toStr(it.HOOK_TYPE ?? 0) : "0",
  };
}

interface Props {
  type: "COLUMN" | "BRACE";
  isColumn: boolean;
  defaultB: string;
  defaultH: string;
  mainPlaceholder: string;
  hoopPlaceholder: string;
}

export function ColumnLikeForm({ type, isColumn, defaultB, defaultH, mainPlaceholder, hoopPlaceholder }: Props) {
  const { t } = useI18n();
  const { payload: conn } = useConn();

  const [keyInput, setKeyInput] = useState("");
  const [list, setList] = useState<Record<string, ColumnLikePayload>>({});
  const [existingKey, setExistingKey] = useState("");
  const [keylistText, setKeylistText] = useState("");
  const [loaded, setLoaded] = useState<ColumnLikePayload | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [dimB, setDimB] = useState(defaultB);
  const [dimH, setDimH] = useState(defaultH);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);

  const afterPayload = useMemo(() => buildPayload(form, isColumn), [form, isColumn]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listRebar<ColumnLikePayload>(type, conn);
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
    setForm(fillForm(payload, isColumn));
  }

  async function handleSave() {
    if (!keyInput) {
      setStatus({ ok: false, msg: t("js.keyRequired") });
      return;
    }
    const payload = buildPayload(form, isColumn);
    setSaving(true);
    setStatus({ ok: true, msg: t("js.saving") });
    try {
      const res = await saveRebar(type, keyInput, payload, conn);
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

  return (
    <div className="editor-grid">
      <div className="panel">
        <h2>{t("common.targetTitle")}</h2>
        <div className="select-row">
          <div className="field">
            <label>{t("common.sectionKeyLabel")}</label>
            <input type="text" placeholder={t("common.keyPlaceholderGeneric")} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          </div>
          <button className="btn" type="button" onClick={handleList} disabled={listLoading}>
            {t("common.loadListBtn")}
          </button>
        </div>
        <div className="field">
          <label>{t("common.existingSectionLabel")}</label>
          <select value={existingKey} onChange={(e) => handleSelectExisting(e.target.value)}>
            <option value="">{listLoadedOnce ? t("js.selectDefault") : t("common.existingDefaultOption")}</option>
            {Object.keys(list).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="keylist">{keylistText}</div>

        <div className="subhead">{t("common.mainBarTitle")}</div>
        <div className="row3">
          <div className="field">
            <label>{t("common.spec")}</label>
            <input placeholder={mainPlaceholder} value={form.mainName} onChange={(e) => set("mainName", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.totalCount")}</label>
            <input type="number" value={form.mainNum} onChange={(e) => set("mainNum", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.rowCount")}</label>
            <input type="number" value={form.mainRow} onChange={(e) => set("mainRow", e.target.value)} />
          </div>
        </div>

        {isColumn && (
          <>
            <div className="checkline">
              <input
                id={`${type}-useCorner`}
                type="checkbox"
                checked={form.useCorner}
                onChange={(e) => set("useCorner", e.target.checked)}
              />
              <label htmlFor={`${type}-useCorner`} style={{ margin: 0 }}>
                {t("column.useCorner")}
              </label>
            </div>
            {form.useCorner && (
              <div className="field">
                <label>{t("column.cornerSpec")}</label>
                <input placeholder="D29" value={form.cornerName} onChange={(e) => set("cornerName", e.target.value)} />
              </div>
            )}
          </>
        )}

        <div className="subhead">{t("common.endHoopTitle")}</div>
        <div className="row4">
          <div className="field">
            <label>{t("common.spec")}</label>
            <input placeholder={hoopPlaceholder} value={form.endName} onChange={(e) => set("endName", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.legY")}</label>
            <input type="number" value={form.endLegY} onChange={(e) => set("endLegY", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.legZ")}</label>
            <input type="number" value={form.endLegZ} onChange={(e) => set("endLegZ", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.dist")}</label>
            <input type="number" step="any" value={form.endDist} onChange={(e) => set("endDist", e.target.value)} />
          </div>
        </div>

        <div className="subhead">{t("common.cenHoopTitle")}</div>
        <div className="row4">
          <div className="field">
            <label>{t("common.spec")}</label>
            <input placeholder={hoopPlaceholder} value={form.cenName} onChange={(e) => set("cenName", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.legY")}</label>
            <input type="number" value={form.cenLegY} onChange={(e) => set("cenLegY", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.legZ")}</label>
            <input type="number" value={form.cenLegZ} onChange={(e) => set("cenLegZ", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.dist")}</label>
            <input type="number" step="any" value={form.cenDist} onChange={(e) => set("cenDist", e.target.value)} />
          </div>
        </div>

        <div className="subhead">{t("common.etcTitle")}</div>
        <div className={isColumn ? "row3" : "row2"}>
          <div className="field">
            <label>{t("common.coverDO")}</label>
            <input type="number" step="any" value={form.doVal} onChange={(e) => set("doVal", e.target.value)} />
          </div>
          <div className="field">
            <label>{t("common.hoopType")}</label>
            <select value={form.hoopType} onChange={(e) => set("hoopType", e.target.value)}>
              <option value="Ties">Ties</option>
              <option value="Spirals">Spirals</option>
            </select>
          </div>
          {isColumn && (
            <div className="field">
              <label>{t("column.hookType")}</label>
              <select value={form.hookType} onChange={(e) => set("hookType", e.target.value)}>
                <option value="0">{t("column.hookType90")}</option>
                <option value="1">{t("column.hookTypeBoth")}</option>
              </select>
            </div>
          )}
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
        type={type}
        titleKey="common.previewTitleSimple"
        before={loaded}
        after={afterPayload}
        dims={{ B: dimB, H: dimH }}
        legend={
          <>
            <span>
              <i className="dot" style={{ background: "var(--main-bar)" }} />
              {t("common.mainBar")}
            </span>
            {isColumn && (
              <span>
                <i className="dot" style={{ background: "var(--corner)" }} />
                {t("column.cornerBar")}
              </span>
            )}
            <span>
              <i className="dot" style={{ background: "var(--hoop)" }} />
              {t("common.hoop")}
            </span>
          </>
        }
      />
    </div>
  );
}
