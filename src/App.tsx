import { useState } from "react";
// Vite + React app (NOT Next.js), so the correct entrypoint is /react —
// @vercel/analytics/next only works under a Next.js runtime.
import { Analytics } from "@vercel/analytics/react";
import "./style.css";
import { I18nProvider } from "./i18n/I18nProvider";
import { useI18n } from "./i18n/useI18n";
import { ConnProvider } from "./context/ConnContext";
import { DesignCodeProvider } from "./context/DesignCodeContext";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { ConnDrawer } from "./components/ConnDrawer";
import { DesignCodeSelector } from "./components/DesignCodeSelector";
import { Tabs, type TabKey } from "./components/Tabs";
import { BeamBoard } from "./components/BeamBoard";
import { ColumnLikeBoard } from "./components/ColumnLikeBoard";
import { WallBoard } from "./components/WallBoard";
import { ProjectReview } from "./components/ProjectReview";
import { FooterHint } from "./components/FooterHint";
import { Byline } from "./components/Byline";
import { GuideDrawer } from "./components/GuideDrawer";

function AppShell() {
  const { t } = useI18n();
  const [active, setActive] = useState<TabKey>("BEAM");

  return (
    <div className="wrap">
      <GuideDrawer />
      <div className="topbar">
        <ConnDrawer />
        <LanguageSwitcher />
      </div>
      <h1>{t("app.title")}</h1>
      <div className="subtitle">{t("app.subtitle")}</div>

      <DesignCodeSelector />
      <Tabs active={active} onChange={setActive} />

      <div className={"tab-panel" + (active === "BEAM" ? " active" : "")}>
        <BeamBoard />
      </div>
      <div className={"tab-panel" + (active === "COLUMN" ? " active" : "")}>
        <ColumnLikeBoard type="COLUMN" isColumn ns="cboard" mainPlaceholder="D25" hoopPlaceholder="D13" />
      </div>
      <div className={"tab-panel" + (active === "WALL" ? " active" : "")}>
        <WallBoard />
      </div>
      <div className={"tab-panel" + (active === "BRACE" ? " active" : "")}>
        <ColumnLikeBoard type="BRACE" isColumn={false} ns="bboard" mainPlaceholder="D22" hoopPlaceholder="D10" />
      </div>
      <div className={"tab-panel" + (active === "PROJECT" ? " active" : "")}>
        <ProjectReview />
      </div>

      <FooterHint />
      <Byline />
      <Analytics />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ConnProvider>
        <DesignCodeProvider>
          <AppShell />
        </DesignCodeProvider>
      </ConnProvider>
    </I18nProvider>
  );
}
