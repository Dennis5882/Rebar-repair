import { useMemo, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import { drawSectionSvg, type SectionDims } from "../lib/svg";
import type { MemberPayload, MemberType, SectorKey } from "../types/rebar";

interface SectionPreviewProps {
  type: MemberType;
  titleKey: string;
  before: MemberPayload | null;
  after: MemberPayload | null;
  dims: SectionDims;
  legend: ReactNode;
  singleColumn?: boolean;
  // BEAM only: when set, renders one before/after row per sector (e.g.
  // I/M/J) instead of a single row — previously the preview always drew
  // BAR_SECTOR_M regardless of which sector's rebar was actually edited.
  // Pass a referentially-stable array (e.g. the SECTORS constant) so the
  // memoization below doesn't recompute every render.
  sectorKeys?: SectorKey[];
}

export function SectionPreview({ type, titleKey, before, after, dims, legend, singleColumn, sectorKeys }: SectionPreviewProps) {
  const { t } = useI18n();
  // dims is a fresh object literal from the caller every render; compare it
  // by value (cheap — a couple of numeric-ish fields) so `before` (which is
  // static once loaded) doesn't get re-rendered into a fresh SVG string on
  // every unrelated re-render (e.g. a keystroke in an unrelated field).
  const dimsKey = JSON.stringify(dims);
  const sectorKeysKey = sectorKeys?.join(",");
  const rows: (SectorKey | undefined)[] = sectorKeys && sectorKeys.length ? sectorKeys : [undefined];

  const beforeRows = useMemo(
    () =>
      rows.map((sectorKey) =>
        before ? drawSectionSvg(t, type, before, dims, `${type} ${t("common.loadedCap")} ${t("js.sectionWord")}`, sectorKey) : null
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, before, dimsKey, t, sectorKeysKey]
  );
  const afterRows = useMemo(
    () =>
      rows.map((sectorKey) =>
        after ? drawSectionSvg(t, type, after, dims, `${type} ${t("common.currentCap")} ${t("js.sectionWord")}`, sectorKey) : null
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, after, dimsKey, t, sectorKeysKey]
  );

  // With multiple sector rows (BEAM), an unloaded "Before" repeats the same
  // empty placeholder 3 times (once per I/M/J row) — collapse it into one
  // note above the rows instead, and drop the empty before-boxes entirely,
  // until a member is actually loaded.
  const multiRowNoBefore = !!sectorKeys && !before;

  return (
    <div className="panel">
      <h2>{t(titleKey)}</h2>
      {multiRowNoBefore && (
        <div className="hint" style={{ marginTop: 0 }}>
          {t("common.beforeLoad")}
        </div>
      )}
      {rows.map((sectorKey, idx) => (
        <div key={sectorKey ?? idx} style={idx > 0 ? { marginTop: 14 } : undefined}>
          {sectorKey && (
            <div className="subhead" style={{ fontSize: 12 }}>
              {t(`js.sectorTitle.${sectorKey}`)}
            </div>
          )}
          <div className="diagrams" style={singleColumn || multiRowNoBefore ? { gridTemplateColumns: "1fr" } : undefined}>
            {!multiRowNoBefore && (
              <div className="diagram-box">
                <div className="cap">{t("common.loadedCap")}</div>
                {beforeRows[idx] ? (
                  <div dangerouslySetInnerHTML={{ __html: beforeRows[idx]! }} />
                ) : (
                  <div className="sec-empty">{t("common.beforeLoad")}</div>
                )}
              </div>
            )}
            <div className="diagram-box">
              <div className="cap">{t("common.currentCap")}</div>
              {afterRows[idx] ? <div dangerouslySetInnerHTML={{ __html: afterRows[idx]! }} /> : <div className="sec-empty">-</div>}
            </div>
          </div>
        </div>
      ))}
      <div className="legend">{legend}</div>
    </div>
  );
}
