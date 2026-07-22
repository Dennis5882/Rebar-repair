import { LANGS } from "../i18n/types";
import { useI18n } from "../i18n/useI18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-row">
      <label htmlFor="langSelect">{t("lang.label")}</label>
      <select id="langSelect" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
