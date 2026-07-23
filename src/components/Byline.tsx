import { useI18n } from "../i18n/useI18n";

export function Byline() {
  const { t } = useI18n();
  return (
    <p className="hint byline">
      <span>
        {t("app.plannerLabel")}: Gavi · {t("app.developerLabel")}: Dennis
      </span>
      <span>{t("app.lastUpdateLabel")}: {__BUILD_DATE__}</span>
    </p>
  );
}
