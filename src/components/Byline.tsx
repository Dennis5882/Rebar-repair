import { useI18n } from "../i18n/useI18n";

export function Byline() {
  const { t } = useI18n();
  return (
    <p className="hint byline">
      {t("app.developerLabel")}: Dennis v260716 · {t("app.plannerLabel")}: Gavi
    </p>
  );
}
