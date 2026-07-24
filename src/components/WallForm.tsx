import { useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { saveRebar } from "../lib/api";
import { isListStatus, keylistText, statusClass, statusText } from "../lib/statusMsg";
import { useRebarList } from "../hooks/useRebarList";
import { SectionPreview } from "./SectionPreview";
import { BarSelect } from "./BarSelect";
import type { WallItem, WallPayload } from "../types/rebar";

interface FormState {
  createSub: boolean;
  subId: string;
  storyFrom: string;
  storyTo: string;
  vName: string;
  vDist: string;
  hName: string;
  hDist: string;
  useEnd: boolean;
  endName: string;
  endNum: string;
  endDist: string;
  beName: string;
  beDist: string;
  beLen: string;
  dw: string;
  de: string;
  useModelThk: boolean;
  thickness: string;
}

const EMPTY: FormState = {
  createSub: false,
  subId: "",
  storyFrom: "",
  storyTo: "",
  vName: "",
  vDist: "",
  hName: "",
  hDist: "",
  useEnd: false,
  endName: "",
  endNum: "",
  endDist: "",
  beName: "",
  beDist: "",
  beLen: "",
  dw: "",
  de: "",
  useModelThk: true,
  thickness: "",
};

function num(s: string): number | undefined {
  return s === "" ? undefined : Number(s);
}
function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function buildWallItem(form: FormState): WallItem {
  const item: WallItem = {
    CREATE_SUB_WALL_ID: form.createSub,
    VERTICAL_REBAR: { NAME: form.vName, DIST: num(form.vDist) },
    HORIZONTAL_REBAR: { NAME: form.hName, DIST: num(form.hDist) },
    USE_END_REBAR: form.useEnd,
    CONCRETE_FACE_TO_CENTER_OF_REBAR: { DW: num(form.dw), DE: num(form.de) },
    USE_MODEL_THICKNESS: form.useModelThk,
  };
  if (item.CREATE_SUB_WALL_ID) {
    item.SUB_WALL_ID = num(form.subId);
    item.STORY = { FROM: form.storyFrom, TO: form.storyTo };
  }
  if (item.USE_END_REBAR) {
    item.END_REBAR = { NAME: form.endName, NUM: num(form.endNum), DIST: num(form.endDist) };
  }
  if (form.beName) item.BE_HORIZONTAL_REBAR = { NAME: form.beName, DIST: num(form.beDist) };
  const beLen = num(form.beLen);
  if (beLen !== undefined) item.BOUNDARY_ELEMENT_LENGTH = beLen;
  if (!item.USE_MODEL_THICKNESS) item.THICKNESS = num(form.thickness);
  return item;
}

function segmentLabel(item: WallItem, index: number): string {
  const parts = [`#${index + 1}`];
  if (item.SUB_WALL_ID !== undefined) parts.push(`ID ${item.SUB_WALL_ID}`);
  const from = item.STORY?.FROM;
  const to = item.STORY?.TO;
  if (from || to) parts.push(`${from || "?"}~${to || "?"}`);
  return parts.join(" · ");
}

function fillWallForm(it: WallItem): FormState {
  const vr = it.VERTICAL_REBAR || {};
  const hr = it.HORIZONTAL_REBAR || {};
  const er = it.END_REBAR || {};
  const be = it.BE_HORIZONTAL_REBAR || {};
  const cc = it.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
  return {
    createSub: !!it.CREATE_SUB_WALL_ID,
    subId: toStr(it.SUB_WALL_ID),
    storyFrom: toStr((it.STORY || {}).FROM),
    storyTo: toStr((it.STORY || {}).TO),
    vName: toStr(vr.NAME),
    vDist: toStr(vr.DIST),
    hName: toStr(hr.NAME),
    hDist: toStr(hr.DIST),
    useEnd: !!it.USE_END_REBAR,
    endName: toStr(er.NAME),
    endNum: toStr(er.NUM),
    endDist: toStr(er.DIST),
    beName: toStr(be.NAME),
    beDist: toStr(be.DIST),
    beLen: toStr(it.BOUNDARY_ELEMENT_LENGTH),
    dw: toStr(cc.DW),
    de: toStr(cc.DE),
    useModelThk: it.USE_MODEL_THICKNESS !== false,
    thickness: toStr(it.THICKNESS),
  };
}

export function WallForm() {
  const { t } = useI18n();
  const { payload: conn, lengthUnit } = useConn();
  const { list, names, keylistMsg, listLoading, listLoadedOnce, status, setStatus, handleList } =
    useRebarList<WallPayload>("WALL", conn);

  const [keyInput, setKeyInput] = useState("");
  const [existingKey, setExistingKey] = useState("");
  const [loaded, setLoaded] = useState<WallItem | null>(null);
  // Full ITEMS array for the loaded key — a wall can have multiple segments
  // (one per SUB_WALL_ID/story range). Only `segmentIndex` is being edited;
  // the rest must be preserved verbatim on save or they'd silently be lost.
  const [allItems, setAllItems] = useState<WallItem[]>([]);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [dispThk, setDispThk] = useState("300");
  const [dispLen, setDispLen] = useState("3000");
  const [saving, setSaving] = useState(false);

  const afterItem = useMemo(() => buildWallItem(form), [form]);
  const afterPayload = useMemo(() => ({ ITEMS: [afterItem] }), [afterItem]);
  const beforePayload = useMemo(() => (loaded ? { ITEMS: [loaded] } : null), [loaded]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSelectExisting(key: string) {
    setExistingKey(key);
    if (!key) return;
    setKeyInput(key);
    const items = list[key]?.ITEMS || [];
    setAllItems(items);
    setSegmentIndex(0);
    setLoaded(items[0] || null);
    setForm(fillWallForm(items[0] || {}));
  }

  function handleSelectSegment(index: number) {
    setSegmentIndex(index);
    const item = allItems[index] || {};
    setLoaded(item);
    setForm(fillWallForm(item));
  }

  async function handleSave() {
    if (!keyInput) {
      setStatus({ ok: false, kind: "keyRequired" });
      return;
    }
    const item = buildWallItem(form);
    // allItems only reflects the segments of whichever key was last loaded
    // via the dropdown — if the user has since retyped keyInput to a
    // different key, those segments belong to that OTHER wall and must not
    // be merged in here, or they'd get written onto the wrong key.
    const keyMatchesLoaded = keyInput === existingKey && allItems.length > 0;
    const items = keyMatchesLoaded ? [...allItems] : [item];
    if (keyMatchesLoaded) items[segmentIndex] = item;
    const payload: WallPayload = { ITEMS: items };
    setSaving(true);
    setStatus({ ok: true, kind: "saving" });
    try {
      const res = await saveRebar("WALL", keyInput, payload, conn);
      if (!res.ok) {
        setStatus({ ok: false, kind: "saveFail", res });
        return;
      }
      setStatus({ ok: true, kind: "saveDone" });
      setExistingKey(keyInput);
      setAllItems(items);
      setSegmentIndex(keyMatchesLoaded ? segmentIndex : 0);
      setLoaded(item);
    } catch (e) {
      setStatus({ ok: false, kind: "saveError", error: String(e) });
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
            <label htmlFor="WALL-key">{t("wall.keyLabel")}</label>
            <input id="WALL-key" type="text" placeholder={t("common.keyPlaceholderGeneric")} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
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
          <label htmlFor="WALL-existing">{t("wall.existingLabel")}</label>
          <select id="WALL-existing" value={existingKey} onChange={(e) => handleSelectExisting(e.target.value)}>
            <option value="">{listLoadedOnce ? t("js.selectDefault") : t("common.existingDefaultOption")}</option>
            {Object.keys(list).map((k) => (
              <option key={k} value={k}>
                {names[k] ? `${k}: ${names[k]}` : k}
              </option>
            ))}
          </select>
        </div>
        <div className="keylist">{keylistText(t, keylistMsg)}</div>

        {keyInput === existingKey && allItems.length > 1 && (
          <div className="field">
            <label htmlFor="WALL-segment">{t("wall.segmentLabel")}</label>
            <select id="WALL-segment" value={segmentIndex} onChange={(e) => handleSelectSegment(Number(e.target.value))}>
              {allItems.map((it, idx) => (
                <option key={idx} value={idx}>
                  {segmentLabel(it, idx)}
                </option>
              ))}
            </select>
            <div className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
              {t("wall.segmentHint", { count: allItems.length })}
            </div>
          </div>
        )}

        <div className="checkline">
          <input id="WALL-createSub" type="checkbox" checked={form.createSub} onChange={(e) => set("createSub", e.target.checked)} />
          <label htmlFor="WALL-createSub" style={{ margin: 0 }}>
            {t("wall.createSub")}
          </label>
        </div>
        {form.createSub && (
          <div className="row3">
            <div className="field">
              <label htmlFor="WALL-subId">{t("wall.subId")}</label>
              <input id="WALL-subId" type="number" value={form.subId} onChange={(e) => set("subId", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="WALL-storyFrom">{t("wall.storyFrom")}</label>
              <input id="WALL-storyFrom" value={form.storyFrom} onChange={(e) => set("storyFrom", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="WALL-storyTo">{t("wall.storyTo")}</label>
              <input id="WALL-storyTo" value={form.storyTo} onChange={(e) => set("storyTo", e.target.value)} />
            </div>
          </div>
        )}

        <div className="subhead">{t("wall.vhRebarTitle")}</div>
        <div className="row2">
          <div className="field">
            <label htmlFor="WALL-vName">{t("wall.vSpec")}</label>
            <BarSelect id="WALL-vName" placeholder="D16" value={form.vName} onChange={(v) => set("vName", v)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-vDist">{t("wall.vDistLabel")}</label>
            <input id="WALL-vDist" type="number" step="any" value={form.vDist} onChange={(e) => set("vDist", e.target.value)} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="WALL-hName">{t("wall.hSpec")}</label>
            <BarSelect id="WALL-hName" placeholder="D13" value={form.hName} onChange={(v) => set("hName", v)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-hDist">{t("wall.hDistLabel")}</label>
            <input id="WALL-hDist" type="number" step="any" value={form.hDist} onChange={(e) => set("hDist", e.target.value)} />
          </div>
        </div>

        <div className="checkline">
          <input id="WALL-useEnd" type="checkbox" checked={form.useEnd} onChange={(e) => set("useEnd", e.target.checked)} />
          <label htmlFor="WALL-useEnd" style={{ margin: 0 }}>
            {t("wall.useEndRebar")}
          </label>
        </div>
        {form.useEnd && (
          <div className="row3">
            <div className="field">
              <label htmlFor="WALL-endName">{t("common.spec")}</label>
              <BarSelect id="WALL-endName" placeholder="D22" value={form.endName} onChange={(v) => set("endName", v)} />
            </div>
            <div className="field">
              <label htmlFor="WALL-endNum">{t("common.count")}</label>
              <input id="WALL-endNum" type="number" value={form.endNum} onChange={(e) => set("endNum", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="WALL-endDist">{t("common.dist")}</label>
              <input id="WALL-endDist" type="number" step="any" value={form.endDist} onChange={(e) => set("endDist", e.target.value)} />
            </div>
          </div>
        )}

        <div className="subhead">{t("wall.beTitle")}</div>
        <div className="row3">
          <div className="field">
            <label htmlFor="WALL-beName">{t("wall.hSpec")}</label>
            <BarSelect id="WALL-beName" placeholder="D13" value={form.beName} onChange={(v) => set("beName", v)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-beDist">{t("wall.hDistLabel")}</label>
            <input id="WALL-beDist" type="number" step="any" value={form.beDist} onChange={(e) => set("beDist", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-beLen">{t("wall.beLen")}</label>
            <input id="WALL-beLen" type="number" step="any" value={form.beLen} onChange={(e) => set("beLen", e.target.value)} />
          </div>
        </div>

        <div className="subhead">{t("wall.coverThkTitle")}</div>
        <div className="row2">
          <div className="field">
            <label htmlFor="WALL-dw">{t("wall.dw")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
            <input id="WALL-dw" type="number" step="any" value={form.dw} onChange={(e) => set("dw", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-de">{t("wall.de")}{lengthUnit ? ` (${lengthUnit})` : ""}</label>
            <input id="WALL-de" type="number" step="any" value={form.de} onChange={(e) => set("de", e.target.value)} />
          </div>
        </div>
        <div className="checkline">
          <input id="WALL-useModelThk" type="checkbox" checked={form.useModelThk} onChange={(e) => set("useModelThk", e.target.checked)} />
          <label htmlFor="WALL-useModelThk" style={{ margin: 0 }}>
            {t("wall.useModelThk")}
          </label>
        </div>
        {!form.useModelThk && (
          <div className="field">
            <label htmlFor="WALL-thickness">{t("wall.thickness")}</label>
            <input id="WALL-thickness" type="number" step="any" value={form.thickness} onChange={(e) => set("thickness", e.target.value)} />
          </div>
        )}

        <div className="subhead">{t("common.dimsHintTitle")}</div>
        <div className="row2">
          <div className="field">
            <label htmlFor="WALL-dispThk">{t("wall.dispThk")}</label>
            <input id="WALL-dispThk" type="number" value={dispThk} onChange={(e) => setDispThk(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="WALL-dispLen">{t("wall.dispLen")}</label>
            <input id="WALL-dispLen" type="number" value={dispLen} onChange={(e) => setDispLen(e.target.value)} />
          </div>
        </div>

        <div className="btn-row">
          <button className="btn primary" type="button" onClick={handleSave} disabled={saving}>
            {t("common.saveBtn")}
          </button>
        </div>
        {status && !isListStatus(status) && <div className={"status show " + statusClass(status)}>{statusText(t, status)}</div>}
      </div>

      <SectionPreview
        type="WALL"
        titleKey="wall.previewTitle"
        before={beforePayload}
        after={afterPayload}
        dims={{ THICKNESS: dispThk, LENGTH: dispLen }}
        singleColumn
        loadedInfo={existingKey ? { key: existingKey, name: names[existingKey] } : undefined}
        legend={
          <>
            <span>
              <i className="dot" style={{ background: "var(--main-bar)" }} />
              {t("wall.legendV")}
            </span>
            <span>
              <i className="dot" style={{ background: "var(--endbar)" }} />
              {t("wall.legendEnd")}
            </span>
            <span>
              <i className="dot" style={{ background: "var(--hoop)" }} />
              {t("wall.legendH")}
            </span>
            <span>
              <i className="dot" style={{ background: "var(--be-zone)" }} />
              {t("wall.legendBE")}
            </span>
          </>
        }
      />
    </div>
  );
}
