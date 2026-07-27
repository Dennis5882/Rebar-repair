import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";

export type GlyphKind = "beam" | "column" | "wall" | "brace";

// Decorative section sketches for the empty boards — schematic on purpose
// (SectionPreview draws the real thing, but that needs loaded data). Uses the
// same tokens as the real previews — concrete fill, main-bar dots, stirrup
// dashes — so an empty board still reads as a rebar section, not a grey box.
function SectionGlyph({ kind }: { kind: GlyphKind }) {
  const dot = (cx: number, cy: number, i: number) => <circle key={i} cx={cx} cy={cy} r="3.2" fill="var(--main-bar)" stroke="none" />;
  return (
    <svg className="board-empty-glyph" width="176" height="122" viewBox="0 0 104 72" aria-hidden="true">
      <g fill="var(--concrete)" stroke="var(--line-strong)" strokeWidth="1.5">
        {kind === "beam" && (
          <>
            <rect x="14" y="12" width="76" height="48" rx="3" />
            <rect x="21" y="19" width="62" height="34" rx="2" fill="none" stroke="var(--hoop)" strokeDasharray="4 3" />
            {[30, 44, 58, 72].map((x, i) => dot(x, 25, i))}
            {[30, 44, 58, 72].map((x, i) => dot(x, 47, i + 10))}
          </>
        )}
        {kind === "column" && (
          <>
            <rect x="30" y="4" width="44" height="64" rx="3" />
            <rect x="37" y="11" width="30" height="50" rx="2" fill="none" stroke="var(--hoop)" strokeDasharray="4 3" />
            {[14, 28, 44, 58].map((y, i) => dot(37, y, i))}
            {[14, 28, 44, 58].map((y, i) => dot(67, y, i + 10))}
          </>
        )}
        {kind === "wall" && (
          <>
            <rect x="6" y="24" width="92" height="24" rx="2" />
            {/* boundary elements at both ends, same tint as the real preview */}
            <rect x="6" y="24" width="20" height="24" fill="var(--be-zone)" stroke="none" />
            <rect x="78" y="24" width="20" height="24" fill="var(--be-zone)" stroke="none" />
            <path d="M26 24 L26 48 M78 24 L78 48" fill="none" stroke="var(--hoop)" strokeDasharray="3 3" />
            {[13, 19, 36, 48, 60, 85, 91].map((x, i) => dot(x, 30, i))}
            {[13, 19, 36, 48, 60, 85, 91].map((x, i) => dot(x, 42, i + 10))}
          </>
        )}
        {kind === "brace" && (
          // Diagonal member drawn in elevation (a brace has no upright
          // cross-section to show) — the member band plus its ties.
          <>
            <path d="M26.4 67.5 L86.4 19.5 L77.6 8.5 L17.6 56.5 Z" />
            {/* longitudinal bars run along the member, so they read as lines
                here rather than the section dots the other glyphs use */}
            <path d="M24.2 64.7 L84.2 16.7 M19.8 59.3 L79.8 11.3" fill="none" stroke="var(--main-bar)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M44.4 53.1 L35.6 42.1 M56.4 43.5 L47.6 32.5 M68.4 33.9 L59.6 22.9" fill="none" stroke="var(--hoop)" strokeWidth="1.5" strokeDasharray="3 2" />
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * Replaces the table on a board that has nothing to show yet: a section
 * sketch, why it is empty, and the same load button as the toolbar (an
 * empty screen should carry its own way out). Before a key is entered it
 * points at the connection drawer instead.
 */
export function BoardEmptyState({
  kind,
  title,
  loadedOnce,
  onLoad,
  loading,
  loadLabel,
}: {
  kind: GlyphKind;
  title: string;
  /** A load already ran and came back with nothing — don't tell them to load. */
  loadedOnce: boolean;
  onLoad: () => void;
  loading: boolean;
  loadLabel: string;
}) {
  const { t } = useI18n();
  const { mapiKey, requestOpenConn } = useConn();
  const needsConn = !mapiKey.trim();
  const sub = needsConn ? t("board.emptyNeedConn") : loadedOnce ? "" : t("board.emptySub");

  return (
    <div className="board-empty-state">
      <SectionGlyph kind={kind} />
      <div className="board-empty-title">{title}</div>
      {sub && <div className="board-empty-sub">{sub}</div>}
      <div className="board-empty-actions">
        {needsConn ? (
          <button className="btn primary" type="button" onClick={requestOpenConn}>
            {t("conn.pillLabel")}
          </button>
        ) : (
          <button className="btn primary" type="button" onClick={onLoad} disabled={loading}>
            {loadLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Dashed stand-ins for the summary strip, so the board keeps its shape. */
export function BoardSummaryPlaceholder({ totalLabel }: { totalLabel: string }) {
  const { t } = useI18n();
  const labels = [totalLabel, t("board.summaryOk"), t("board.summaryNg"), t("board.summaryChanged")];
  return (
    <div className="board-summary">
      {labels.map((label, i) => (
        <div className="stat placeholder" key={i}>
          <div className="k">{label}</div>
          <div className="v">—</div>
        </div>
      ))}
    </div>
  );
}
