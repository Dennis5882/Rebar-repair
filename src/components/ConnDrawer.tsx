import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { verifyConnection } from "../lib/api";
import { errText } from "../lib/errText";

// Connection settings live in a right-side drawer (triggered by a status
// pill in the top-right corner) instead of an always-visible inline panel —
// same pattern as the MIDAS API settings drawer in the sibling `story`
// project (see [[story-3d-viewer-pattern]]), just mirrored to the right
// edge since GuideDrawer already owns the left edge.
export function ConnDrawer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { mapiKey, product, baseUrl, setMapiKey, setProduct, setBaseUrl, payload } = useConn();
  const [result, setResult] = useState("");
  const [connected, setConnected] = useState(false);

  async function handleVerify() {
    setResult(t("js.checking"));
    try {
      const res = await verifyConnection(payload);
      if (res.ok) {
        const user = res.user ? " · " + res.user : "";
        setResult(t("js.connOk", { program: res.program || product, user }));
        setConnected(true);
      } else if (res.code === "disconnected") {
        setResult(t("js.connDisconnected"));
        setConnected(false);
      } else if (res.code === "mismatch") {
        setResult(t("js.connMismatch", { program: res.program }));
        setConnected(false);
      } else {
        setResult(t("js.connFail", { error: errText(t, res) || `HTTP ${res.httpStatus || "?"}` }));
        setConnected(false);
      }
    } catch (e) {
      setResult(t("js.connError", { error: String(e) }));
      setConnected(false);
    }
  }

  return (
    <>
      <button type="button" className="conn-pill" onClick={() => setOpen(true)} aria-label={t("conn.openBtn")}>
        <span className={"conn-dot" + (connected ? " ok" : "")} />
        {connected ? t("conn.pillConnected") : t("conn.pillDisconnected")}
      </button>
      {open && (
        <>
          <div className="guide-backdrop" onClick={() => setOpen(false)} />
          <aside className="guide-drawer conn-drawer">
            <div className="guide-drawer-header">
              <h2 style={{ margin: 0, fontSize: 13, textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}>
                {t("conn.title")}
              </h2>
              <button type="button" className="guide-close" onClick={() => setOpen(false)} aria-label={t("conn.closeBtn")}>
                ×
              </button>
            </div>
            <div className="guide-drawer-body">
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
              <div className="btn-row" style={{ marginTop: 0 }}>
                <button className="btn" type="button" onClick={handleVerify}>
                  {t("conn.testBtn")}
                </button>
                <span className="hint" style={{ margin: 0 }}>
                  {result}
                </span>
              </div>
              <div className="hint">{t("conn.hint")}</div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
