import { useI18n } from "../i18n/useI18n";
import { THEMES, useTheme, type Theme } from "../lib/theme";

// Swatch = the theme's page colour over its accent (same values as the tokens).
const SWATCH: Record<Theme, [string, string]> = {
  dark: ["#0f141a", "#4c9be8"],
  light: ["#f4f6f8", "#1e5fa8"],
  teal: ["#04090c", "#38e1d6"],
};

export function ThemeSwitcher() {
  const { t } = useI18n();
  const [theme, set] = useTheme();
  return (
    <span className="theme-switch">
      <span className="theme-lbl">{t("theme.label")}</span>
      <span className="theme-seg" role="radiogroup" aria-label={t("theme.label")}>
        {THEMES.map((th) => (
          <button
            key={th}
            type="button"
            role="radio"
            aria-checked={theme === th}
            className={theme === th ? "on" : ""}
            title={t(`theme.${th}.title`)}
            onClick={() => set(th)}
          >
            <span className="sw" style={{ background: `linear-gradient(135deg, ${SWATCH[th][0]} 50%, ${SWATCH[th][1]} 50%)` }} />
            {t(`theme.${th}`)}
          </button>
        ))}
      </span>
    </span>
  );
}
