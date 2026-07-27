import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";

export type GlyphKind = "beam" | "column" | "wall" | "brace";

// Decorative section sketches for the empty boards — schematic on purpose
// (SectionPreview draws the real thing, but that needs loaded data). Strokes
// inherit currentColor so the parent's muted colour drives them.
function SectionGlyph({ kind }: { kind: GlyphKind }) {
  const dot = (cx: number, cy: number, i: number) => <circle key={i} cx={cx} cy={cy} r="3" fill="currentColor" />;
  return (
    <svg className="board-empty-glyph" width="104" height="72" viewBox="0 0 104 72" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {kind === "beam" && (
          <>
            <rect x="14" y="14" width="76" height="44" rx="3" />
            <rect x="21" y="21" width="62" height="30" rx="2" strokeDasharray="4 3" />
            {[30, 44, 58, 72].map((x, i) => dot(x, 27, i))}
            {[30, 44, 58, 72].map((x, i) => dot(x, 45, i + 10))}
          </>
        )}
        {kind === "column" && (
          <>
            <rect x="30" y="6" width="44" height="60" rx="3" />
            <rect x="37" y="13" width="30" height="46" rx="2" strokeDasharray="4 3" />
            {[16, 30, 44, 56].map((y, i) => dot(37, y, i))}
            {[16, 30, 44, 56].map((y, i) => dot(67, y, i + 10))}
          </>
        )}
        {kind === "wall" && (
          <>
            <rect x="8" y="26" width="88" height="20" rx="2" />
            <line x1="26" y1="26" x2="26" y2="46" strokeDasharray="3 3" />
            <line x1="78" y1="26" x2="78" y2="46" strokeDasharray="3 3" />
            {[15, 34, 45, 56, 67, 89].map((x, i) => dot(x, 31, i))}
            {[15, 34, 45, 56, 67, 89].map((x, i) => dot(x, 41, i + 10))}
          </>
        )}
        {kind === "brace" && (
          // Diagonal member drawn in elevation (a brace has no upright
          // cross-section to show) — two edges, end faces, and its ties.
          <>
            <path d="M25 64 L85 16" />
            <path d="M19 56 L79 8" />
            <path d="M25 64 L19 56 M85 16 L79 8" />
            <path
              d="M43 50 L37 42 M55 40 L49 32 M67 30 L61 22"
              strokeDasharray="3 2"
            />
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
