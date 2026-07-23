import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { CodeReferenceSection } from "./CodeReferenceSection";

export function GuideDrawer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"guide" | "release">("guide");

  return (
    <>
      <button type="button" className="guide-tab" onClick={() => setOpen(true)} aria-label={t("guide.openBtn")}>
        {t("guide.title")}
      </button>
      {open && (
        <>
          <div className="guide-backdrop" onClick={() => setOpen(false)} />
          <aside className="guide-drawer">
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
                    <li>{t("guide.step5")}</li>
                    <li>{t("guide.step6")}</li>
                  </ol>
                  <div className="subhead" style={{ marginTop: 4 }}>
                    {t("guide.codeTableTitle")}
                  </div>
                  <CodeReferenceSection />
                </>
              ) : (
                <div className="release-notes">
                  <div className="release-entry">
                    <div className="release-date">2026-07-23</div>
                    <ul>
                      <li>{t("guide.release.d260723.item1")}</li>
                      <li>{t("guide.release.d260723.item2")}</li>
                      <li>{t("guide.release.d260723.item3")}</li>
                      <li>{t("guide.release.d260723.item4")}</li>
                      <li>{t("guide.release.d260723.item5")}</li>
                      <li>{t("guide.release.d260723.item6")}</li>
                      <li>{t("guide.release.d260723.item7")}</li>
                    </ul>
                  </div>
                  <div className="release-entry">
                    <div className="release-date">2026-07-22</div>
                    <ul>
                      <li>{t("guide.release.d260722.item1")}</li>
                      <li>{t("guide.release.d260722.item2")}</li>
                      <li>{t("guide.release.d260722.item3")}</li>
                      <li>{t("guide.release.d260722.item4")}</li>
                      <li>{t("guide.release.d260722.item5")}</li>
                      <li>{t("guide.release.d260722.item6")}</li>
                    </ul>
                  </div>
                  <div className="release-entry">
                    <div className="release-date">2026-07-16</div>
                    <ul>
                      <li>{t("guide.release.d260716.item1")}</li>
                      <li>{t("guide.release.d260716.item2")}</li>
                      <li>{t("guide.release.d260716.item3")}</li>
                      <li>{t("guide.release.d260716.item4")}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
