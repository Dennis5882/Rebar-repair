import { useI18n } from "../i18n/useI18n";
import { useDesignCode } from "../context/DesignCodeContext";

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

// A quick-pick menu (driven by the globally selected design code's rebar
// size table) next to the actual text field. The dropdown only ever writes
// into the text input — the input stays the source of truth, so existing
// values that aren't in the current code's table (a different code was
// used when the data was saved, a non-standard size, etc.) are never
// clobbered or hidden.
export function BarSelect({ id, value, onChange, placeholder }: Props) {
  const { t } = useI18n();
  const { bars } = useDesignCode();

  if (!bars.length) {
    return <input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className="bar-select">
      <select
        aria-label={t("common.pickBarOption")}
        value={bars.some((b) => b.label === value) ? value : ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      >
        <option value="">{t("common.pickBarOption")}</option>
        {bars.map((b) => (
          <option key={b.label} value={b.label}>
            {b.label}
          </option>
        ))}
      </select>
      <input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
