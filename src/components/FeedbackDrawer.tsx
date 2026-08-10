import { useState } from "react";
import { useI18n } from "../i18n/useI18n";

// Formspree form ID — free plan, no backend needed (stays inside the
// Hobby-plan 12-function ceiling, see CLAUDE.md). Formspree emails this
// form's owner on every submission, which is the whole ask here.
const FORMSPREE_FORM_ID = "mljrjoel";
const FORMSPREE_ENDPOINT = `https://formspree.io/f/${FORMSPREE_FORM_ID}`;

type SendState = "idle" | "sending" | "sent" | "error";

export function FeedbackDrawer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SendState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setState("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: (() => {
          const fd = new FormData();
          fd.set("message", message);
          if (email.trim()) fd.set("email", email);
          fd.set("_subject", "QuickRebar NX API — feedback");
          return fd;
        })(),
      });
      if (res.ok) {
        setState("sent");
        setMessage("");
        setEmail("");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button type="button" className="feedback-tab" onClick={() => setOpen(true)} aria-label={t("feedback.openBtn")}>
        {t("feedback.pillLabel")}
      </button>
      <div className={"guide-backdrop" + (open ? " open" : "")} onClick={() => setOpen(false)} />
      <aside className={"guide-drawer conn-drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="guide-drawer-header">
          <h2 style={{ margin: 0, fontSize: 13, textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}>
            {t("feedback.title")}
          </h2>
          <button type="button" className="guide-close" onClick={() => setOpen(false)} aria-label={t("feedback.closeBtn")}>
            ×
          </button>
        </div>
        <div className="guide-drawer-body">
          <p className="hint" style={{ marginTop: 0 }}>
            {t("feedback.intro")}
          </p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="fb-message">{t("feedback.messageLabel")}</label>
              <textarea
                id="fb-message"
                rows={5}
                placeholder={t("feedback.messagePlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="fb-email">{t("feedback.emailLabel")}</label>
              <input
                id="fb-email"
                type="email"
                placeholder={t("feedback.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {/* Formspree honeypot — bots fill it, humans never see it. */}
            <input type="text" name="_gotcha" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

            <div className="btn-row">
              <button className="btn primary" type="submit" disabled={state === "sending" || !message.trim()}>
                {state === "sending" ? t("feedback.sendingBtn") : t("feedback.sendBtn")}
              </button>
            </div>
            {state === "sent" && <div className="status show ok">{t("feedback.sentMsg")}</div>}
            {state === "error" && <div className="status show err">{t("feedback.errorMsg")}</div>}
          </form>
        </div>
      </aside>
    </>
  );
}
