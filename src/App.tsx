import { useState } from "react";
import "./style.css";
import { I18nProvider } from "./i18n/I18nProvider";
import { useI18n } from "./i18n/useI18n";
import { ConnProvider } from "./context/ConnContext";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { Tabs } from "./components/Tabs";
import { BeamForm } from "./components/BeamForm";
import { ColumnLikeForm } from "./components/ColumnLikeForm";
import { WallForm } from "./components/WallForm";
import { FooterHint } from "./components/FooterHint";
import { Byline } from "./components/Byline";
import type { MemberType } from "./types/rebar";

function AppShell() {
  const { t } = useI18n();
  const [active, setActive] = useState<MemberType>("BEAM");

  return (
    <div className="wrap">
      <LanguageSwitcher />
      <h1>{t("app.title")}</h1>
      <div className="subtitle">{t("app.subtitle")}</div>

      <ConnectionPanel />
      <Tabs active={active} onChange={setActive} />

      <div className={"tab-panel" + (active === "BEAM" ? " active" : "")}>
        <BeamForm />
      </div>
      <div className={"tab-panel" + (active === "COLUMN" ? " active" : "")}>
        <ColumnLikeForm type="COLUMN" isColumn defaultB="500" defaultH="500" mainPlaceholder="D25" hoopPlaceholder="D13" />
      </div>
      <div className={"tab-panel" + (active === "WALL" ? " active" : "")}>
        <WallForm />
      </div>
      <div className={"tab-panel" + (active === "BRACE" ? " active" : "")}>
        <ColumnLikeForm type="BRACE" isColumn={false} defaultB="400" defaultH="400" mainPlaceholder="D22" hoopPlaceholder="D10" />
      </div>

      <FooterHint />
      <Byline />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ConnProvider>
        <AppShell />
      </ConnProvider>
    </I18nProvider>
  );
}
