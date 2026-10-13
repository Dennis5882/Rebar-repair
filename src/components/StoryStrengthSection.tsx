import { useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useDesignCode } from "../context/DesignCodeContext";
import { useLoadAll } from "../context/LoadAllContext";
import { rcCheckFamily } from "../data/rcCodePresets";
import { getStoryStrength } from "../lib/api";
import { errText } from "../lib/errText";
import { MODEL_CHANGED } from "../lib/modelEvents";
import { judgeStrengthRatio, type StoryStrengthRow, type StrengthClass } from "../lib/storyStrength";

// 楼层受剪承载力比 card on the project tab: Gen NX's own story shear strength
// per direction (CAPACITY_IRREGULARITY), each storey vs the one above. GB
// models get the JGJ 3 3.5.3 / GB 50011 3.4.3 verdict (A级 80 % · 65 %, B级
// 75 %); other codes show Gen NX's own remark. Read-only.
export function StoryStrengthSection() {
  const { t } = useI18n();
  const { payload } = useConn();
  const { nonce: loadAllNonce } = useLoadAll();
  const { designCode } = useDesignCode();
  const isGb = rcCheckFamily(designCode) === "GB";
  const [rows, setRows] = useState<StoryStrengthRow[] | null>(null);
  const [cls, setCls] = useState<StrengthClass>("A");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // A rebar save or analysis run after the read leaves the rows out of date.
  const [stale, setStale] = useState(false);

  async function load() {
    setBusy(true);
    setMsg("");
    setStale(false);
    try {
      const r = await getStoryStrength(payload);
      if (!r.ok) {
        setRows(null);
        setMsg(t("story.loadFail", { error: errText(t, r) || "?" }));
      } else {
        setRows(r.rows);
        if (!r.rows.length) setMsg(t("story.empty"));
      }
    } catch (e) {
      setMsg(t("story.loadFail", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (loadAllNonce > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAllNonce]);
  useEffect(() => {
    const onChange = () => setStale(true);
    window.addEventListener(MODEL_CHANGED, onChange);
    return () => window.removeEventListener(MODEL_CHANGED, onChange);
  }, []);

  const cell = (d: StoryStrengthRow["dirs"][number]) => {
    const v = isGb ? judgeStrengthRatio(d.ratio, cls) : null;
    return (
      <>
        <td className="mono">{d.strength.toFixed(0)}</td>
        <td className="mono">{d.ratio != null ? d.ratio.toFixed(3) : "—"}</td>
        <td>
          {isGb ? (
            v ? <span className={"verdict " + (v === "ok" ? "ok" : v === "warn" ? "warnv" : "ng")}>{t(`story.v.${v}`)}</span> : "—"
          ) : (
            <span className="mono">{d.remark || "—"}</span>
          )}
        </td>
      </>
    );
  };

  return (
    <div className="board-wrap">
      <div className="board-head">
        <h2>{t("story.title")}</h2>
        <span className="board-hint">{t(isGb ? "story.hintGb" : "story.hint")}</span>
      </div>
      <div className="board-filter">
        <button className="btn primary" type="button" onClick={load} disabled={busy}>
          {busy ? t("story.loading") : t("story.loadBtn")}
        </button>
        {isGb && (
          <label className="board-sort">
            <span>{t("story.classLabel")}</span>
            <select value={cls} onChange={(e) => setCls(e.target.value as StrengthClass)}>
              <option value="A">{t("story.classA")}</option>
              <option value="B">{t("story.classB")}</option>
            </select>
          </label>
        )}
      </div>
      {msg && <div className="hint" style={{ margin: "6px 0" }}>{msg}</div>}
      {stale && rows && rows.length > 0 && <div className="hint warn" style={{ margin: "6px 0" }}>{t("story.stale")}</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="board-table" style={stale ? { opacity: 0.55 } : undefined}>
            <thead>
              <tr>
                <th>{t("story.colStory")}</th>
                <th>{t("story.colHeight")} <span className="th-unit">(m)</span></th>
                <th>{t("story.colStrength", { angle: rows[0].dirs[0].angle.toFixed(0) })} <span className="th-unit">(kN)</span></th>
                <th>{t("story.colRatio")}</th>
                <th>{t("story.colVerdict")}</th>
                <th>{t("story.colStrength", { angle: rows[0].dirs[1].angle.toFixed(0) })} <span className="th-unit">(kN)</span></th>
                <th>{t("story.colRatio")}</th>
                <th>{t("story.colVerdict")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.story}>
                  <td className="cell-section"><span className="sect-nm">{r.story}</span></td>
                  <td className="mono">{r.height.toFixed(2)}</td>
                  {cell(r.dirs[0])}
                  {cell(r.dirs[1])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="hint" style={{ marginTop: 6 }}>{t(isGb ? "story.noteGb" : "story.note")}</div>
    </div>
  );
}
