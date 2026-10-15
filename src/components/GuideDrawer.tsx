import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useEscapeClose } from "../lib/useEscapeClose";
import { CodeReferenceSection } from "./CodeReferenceSection";
import { OPEN_RELEASE_NOTES, RELEASES } from "../lib/releaseNotes";

export function GuideDrawer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"guide" | "release">("guide");
  const close = useCallback(() => setOpen(false), []);
  useEscapeClose(open, close);

  // Footer version link (Byline) → open straight on the release tab.
  useEffect(() => {
    const show = () => {
      setSection("release");
      setOpen(true);
    };
    window.addEventListener(OPEN_RELEASE_NOTES, show);
    return () => window.removeEventListener(OPEN_RELEASE_NOTES, show);
  }, []);

  return (
    <>
      <button type="button" className={"guide-tab" + (open ? " tucked" : "")} onClick={() => setOpen(true)} aria-label={t("guide.openBtn")}>
        {t("guide.title")}
      </button>
      {/* Kept mounted so opening/closing can animate (see .guide-drawer). */}
      <div className={"guide-backdrop" + (open ? " open" : "")} onClick={() => setOpen(false)} />
      <aside className={"guide-drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="guide-drawer-header">
          <div className="guide-drawer-tabs">
            <button
              type="button"
              className={"tab-btn" + (section === "guide" ? " active" : "")}
              onClick={() => setSection("guide")}
            >
              {t("guide.title")}
            </button>
            <button
              type="button"
              className={"tab-btn" + (section === "release" ? " active" : "")}
              onClick={() => setSection("release")}
            >
              {t("guide.releaseTitle")}
            </button>
          </div>
          <button type="button" className="guide-close" onClick={() => setOpen(false)} aria-label={t("guide.closeBtn")}>
            ×
          </button>
        </div>

        <div className="guide-drawer-body">
          {section === "guide" ? (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                {t("guide.intro")}
              </p>
              <ol className="guide-steps">
                <li>{t("guide.step1")}</li>
                <li>{t("guide.step2")}</li>
                <li>{t("guide.step3")}</li>
                <li>{t("guide.step4")}</li>
                <li>{t("guide.step7")}</li>
                <li>{t("guide.step5")}</li>
                <li>{t("guide.step6")}</li>
                <li>{t("guide.step8")}</li>
              </ol>
              <div className="subhead" style={{ marginTop: 4 }}>
                {t("guide.codeTableTitle")}
              </div>
              <CodeReferenceSection />
            </>
          ) : (
            <div className="release-notes">
              {RELEASES.map((r) => (
                <div className="release-entry" key={r.version}>
                  <div className="release-date">
                    <span className="release-ver">v{r.version}</span> · {r.date}{r.time ? ` ${r.time}` : ""}
                  </div>
                  <ul>
                    {Array.from({ length: r.items }, (_, i) => (
                      <li key={i}>{t(`guide.release.${r.id}.item${i + 1}`)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
