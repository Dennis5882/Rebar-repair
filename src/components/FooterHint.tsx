import { useI18n } from "../i18n/useI18n";

export function FooterHint() {
  const { t } = useI18n();
  return (
    <p className="hint" style={{ marginTop: 24 }}>
      {t("app.footerHint")}
    </p>
  );
}
