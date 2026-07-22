import type { MemberType } from "../types/rebar";
import { useI18n } from "../i18n/useI18n";

export type TabKey = MemberType | "PROJECT";

const TABS: { type: TabKey; key: string }[] = [
  { type: "BEAM", key: "tab.beam" },
  { type: "COLUMN", key: "tab.column" },
  { type: "WALL", key: "tab.wall" },
  { type: "BRACE", key: "tab.brace" },
  { type: "PROJECT", key: "tab.project" },
];

export function Tabs({ active, onChange }: { active: TabKey; onChange: (type: TabKey) => void }) {
  const { t } = useI18n();
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.type}
          type="button"
          className={"tab-btn" + (active === tab.type ? " active" : "")}
          onClick={() => onChange(tab.type)}
        >
          {t(tab.key)}
        </button>
      ))}
    </div>
  );
}
