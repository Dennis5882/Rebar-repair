import type { ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import { drawSectionSvg, type SectionDims } from "../lib/svg";
import type { MemberPayload, MemberType } from "../types/rebar";

interface SectionPreviewProps {
  type: MemberType;
  titleKey: string;
  before: MemberPayload | null;
  after: MemberPayload | null;
  dims: SectionDims;
  legend: ReactNode;
  singleColumn?: boolean;
}

export function SectionPreview({ type, titleKey, before, after, dims, legend, singleColumn }: SectionPreviewProps) {
  const { t } = useI18n();

  const beforeHtml = before
    ? drawSectionSvg(t, type, before, dims, `${type} ${t("common.loadedCap")} ${t("js.sectionWord")}`)
    : null;
  const afterHtml = after
    ? drawSectionSvg(t, type, after, dims, `${type} ${t("common.currentCap")} ${t("js.sectionWord")}`)
    : null;

  return (
    <div className="panel">
      <h2>{t(titleKey)}</h2>
      <div className="diagrams" style={singleColumn ? { gridTemplateColumns: "1fr" } : undefined}>
        <div className="diagram-box">
          <div className="cap">{t("common.loadedCap")}</div>
          {beforeHtml ? (
            <div dangerouslySetInnerHTML={{ __html: beforeHtml }} />
          ) : (
            <div className="sec-empty">{t("common.beforeLoad")}</div>
          )}
        </div>
        <div className="diagram-box">
          <div className="cap">{t("common.currentCap")}</div>
          {afterHtml ? <div dangerouslySetInnerHTML={{ __html: afterHtml }} /> : <div className="sec-empty">-</div>}
        </div>
      </div>
      <div className="legend">{legend}</div>
    </div>
  );
}
