import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import type { LangCode } from "../i18n/types";

// Rough default so the code-reference country selector starts on something
// sensible without a second IP lookup — reuses the language already detected
// via IP in I18nProvider (see [[i18n-multilingual-system]] in memory).
const COUNTRY_BY_LANG: Record<LangCode, string> = {
  en: "US",
  ko: "KR",
  "zh-CN": "CN",
  "zh-TW": "TW",
};

const COUNTRIES: { code: string; labelKey: string }[] = [
  { code: "KR", labelKey: "guide.country.kr" },
  { code: "US", labelKey: "guide.country.us" },
  { code: "CN", labelKey: "guide.country.cn" },
  { code: "TW", labelKey: "guide.country.tw" },
];

export function GuideDrawer() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"guide" | "release">("guide");
  const [country, setCountry] = useState(() => COUNTRY_BY_LANG[lang] || "KR");

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
                  <div className="subhead" style={{ marginTop: 4 }}>
                    {t("guide.codeTableTitle")}
                  </div>
                  <div className="field">
                    <label htmlFor="guideCountry">{t("guide.codeTableCountryLabel")}</label>
                    <select id="guideCountry" value={country} onChange={(e) => setCountry(e.target.value)}>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {t(c.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="hint" style={{ marginTop: 0 }}>
                    {t("guide.codeTablePlaceholder")}
                  </p>
                </>
              ) : (
                <div className="release-notes">
                  <div className="release-entry">
                    <div className="release-date">2026-07-22</div>
                    <ul>
                      <li>{t("guide.release.d260722.item1")}</li>
                      <li>{t("guide.release.d260722.item2")}</li>
                      <li>{t("guide.release.d260722.item3")}</li>
                      <li>{t("guide.release.d260722.item4")}</li>
                      <li>{t("guide.release.d260722.item5")}</li>
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
