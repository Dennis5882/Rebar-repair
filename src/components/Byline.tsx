import { useI18n } from "../i18n/useI18n";
import { openReleaseNotes } from "../lib/releaseNotes";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Byline() {
  const { t } = useI18n();
  return (
    <p className="hint byline">
      <span>
        {t("app.plannerLabel")}: Gavi · {t("app.developerLabel")}: Dennis
      </span>
      <span>
        <button type="button" className="byline-version" onClick={openReleaseNotes} title={t("guide.releaseTitle")}>
          v{__APP_VERSION__}
        </button>
        {" · "}
        {t("app.lastUpdateLabel")}: {__BUILD_DATE__}
      </span>
      <ThemeSwitcher />
    </p>
  );
}
