import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { verifyConnection } from "../lib/api";
import { errText } from "../lib/errText";

export function ConnectionPanel() {
  const { t } = useI18n();
  const { mapiKey, product, baseUrl, setMapiKey, setProduct, setBaseUrl, payload } = useConn();
  const [result, setResult] = useState("");

  async function handleVerify() {
    setResult(t("js.checking"));
    try {
      const res = await verifyConnection(payload);
      if (res.ok) {
        const user = res.user ? " · " + res.user : "";
        setResult(t("js.connOk", { program: res.program || product, user }));
      } else if (res.code === "disconnected") {
        setResult(t("js.connDisconnected"));
      } else if (res.code === "mismatch") {
        setResult(t("js.connMismatch", { program: res.program }));
      } else {
        setResult(t("js.connFail", { error: errText(t, res) || `HTTP ${res.httpStatus || "?"}` }));
      }
    } catch (e) {
      setResult(t("js.connError", { error: String(e) }));
    }
  }

  return (
    <section className="panel">
      <h2>{t("conn.title")}</h2>
      <div className="conn-grid">
        <div className="field">
          <label htmlFor="mapiKey">{t("conn.mapiKey")}</label>
          <input
            id="mapiKey"
            type="password"
            placeholder={t("conn.mapiKeyPlaceholder")}
            value={mapiKey}
            onChange={(e) => setMapiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="product">{t("conn.product")}</label>
          <select id="product" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="gen">Gen NX</option>
            <option value="civil">Civil NX</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="baseUrl">{t("conn.baseUrl")}</label>
          <input
            id="baseUrl"
            type="text"
            placeholder={t("conn.baseUrlPlaceholder")}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn" type="button" onClick={handleVerify}>
          {t("conn.testBtn")}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          {result}
        </span>
      </div>
      <div className="hint">{t("conn.hint")}</div>
    </section>
  );
}
