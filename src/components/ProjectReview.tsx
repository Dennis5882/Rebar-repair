import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { useLoadAll } from "../context/LoadAllContext";
import { getProjectSummary } from "../lib/api";
import { errText } from "../lib/errText";
import type { ProjectSummary } from "../types/project";
import type { TFn } from "../i18n/types";
import { Geometry3DSection } from "./Geometry3DSection";

export function ProjectReview() {
  const { t } = useI18n();
  const { payload } = useConn();
  const { nonce: loadAllNonce, requestLoadAll } = useLoadAll();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    setStatus(t("project.loading"));
    try {
      const res = await getProjectSummary(payload);
      if (res.ok) {
        setSummary(res.data);
        setStatus("");
      } else {
        setSummary(null);
        setStatus(t("project.loadFail", { error: errText(t, res) || `HTTP ${res.httpStatus || "?"}` }));
      }
    } catch (e) {
      setSummary(null);
      setStatus(t("project.loadError", { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }

  // "모든 정보 한번에 불러오기" also loads this tab's own summary (its nonce
  // effect below fires alongside every board's).
  useEffect(() => {
    if (loadAllNonce > 0) handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAllNonce]);

  // Same stacked-card board layout as the member tabs (.beam-board): a toolbar
  // card with the load control, an optional summary strip, then one bordered
  // .board-wrap card per data list — so switching to this tab reads as the
  // same app, not a differently-styled page.
  return (
    <div className="beam-board">
      <div className="board-toolbar panel">
        <div className="board-toolbar-row loadall-row">
          <div>
            <div className="board-mat-title">{t("project.loadAllTitle")}</div>
            <div className="hint" style={{ margin: "3px 0 0" }}>{t("project.loadAllHint")}</div>
          </div>
          <button className="btn primary" type="button" onClick={requestLoadAll}>
            {t("project.loadAllBtn")}
          </button>
        </div>
      </div>

      <Geometry3DSection />

      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleLoad} disabled={loading}>
            {t("project.loadBtn")}
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>{t("project.hint")}</div>
        {status && <div className="hint" style={{ marginTop: 6, marginBottom: 0 }}>{status}</div>}
      </div>

      {summary && (
        <>
          <div className="board-summary">
            <SummaryStat label={t("project.sumElements")} value={summary.elements.total} />
            <SummaryStat label={t("project.sumSections")} value={summary.sections.total} />
            <SummaryStat label={t("project.sumMaterials")} value={summary.materials.total} />
            <SummaryStat label={t("project.sumLoads")} value={summary.loadCombinations.total} />
            <SummaryStat label={t("project.sumConstraints")} value={summary.constraints.total} />
          </div>

          <ElementsSection summary={summary} t={t} />
          <SummaryTable
            titleKey="project.sectionsTitle"
            total={summary.sections.total}
            items={summary.sections.items}
            rowKey={(it) => it.id}
            columns={[
              { header: t("project.colId"), cell: (it) => it.id },
              { header: t("project.colName"), cell: (it) => it.name },
              { header: t("project.colType"), cell: (it) => it.type },
            ]}
            t={t}
          />
          <SummaryTable
            titleKey="project.materialsTitle"
            total={summary.materials.total}
            items={summary.materials.items}
            rowKey={(it) => it.id}
            columns={[
              { header: t("project.colId"), cell: (it) => it.id },
              { header: t("project.colName"), cell: (it) => it.name },
              { header: t("project.colType"), cell: (it) => it.type },
            ]}
            t={t}
          />
          <SummaryTable
            titleKey="project.loadCombosTitle"
            total={summary.loadCombinations.total}
            items={summary.loadCombinations.items}
            rowKey={(it) => it.id}
            columns={[
              { header: t("project.colId"), cell: (it) => it.id },
              { header: t("project.colName"), cell: (it) => it.name },
              { header: t("project.colActive"), cell: (it) => it.active },
            ]}
            t={t}
          />
          <SummaryTable
            titleKey="project.constraintsTitle"
            total={summary.constraints.total}
            items={summary.constraints.items}
            rowKey={(it) => it.nodeId}
            columns={[
              { header: t("project.colNodeId"), cell: (it) => it.nodeId },
              { header: t("project.colGroup"), cell: (it) => it.groupName },
              { header: t("project.colConstraint"), cell: (it) => it.constraint },
            ]}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

// One bordered board card: uppercase title + inline count in the head, table
// (or an empty note) below — the same shell the member boards use. The table
// scrolls inside .table-scroll, so the full list is shown (no row cap).
function DataSection({ title, total, empty, emptyLabel, children }: {
  title: string;
  total: number;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="board-wrap">
      <div className="board-head">
        <h2>
          {title} <span className="board-count">({total})</span>
        </h2>
      </div>
      {empty ? <div className="board-empty">{emptyLabel}</div> : <div className="table-scroll">{children}</div>}
    </div>
  );
}

function ElementsSection({ summary, t }: { summary: ProjectSummary; t: TFn }) {
  const types = Object.entries(summary.elements.byType).sort((a, b) => b[1] - a[1]);
  return (
    <DataSection title={t("project.elementsTitle")} total={summary.elements.total} empty={types.length === 0} emptyLabel={t("project.emptyList")}>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("project.colType")}</th>
            <th className="num-col">{t("project.colCount")}</th>
          </tr>
        </thead>
        <tbody>
          {types.map(([ty, count]) => (
            <tr key={ty}>
              <td className="type-cell">{ty}</td>
              <td className="num-col">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataSection>
  );
}

interface Column<T> {
  header: string;
  cell: (item: T) => ReactNode;
  numeric?: boolean;
}

function SummaryTable<T>({
  titleKey,
  total,
  items,
  rowKey,
  columns,
  t,
}: {
  titleKey: string;
  total: number;
  items: T[];
  rowKey: (item: T) => string;
  columns: Column<T>[];
  t: TFn;
}) {
  return (
    <DataSection title={t(titleKey)} total={total} empty={items.length === 0} emptyLabel={t("project.emptyList")}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.header} className={c.numeric ? "num-col" : i === 0 ? "id-col" : undefined}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={rowKey(item)}>
              {columns.map((c, i) => (
                <td key={c.header} className={c.numeric ? "num-col" : i === 0 ? "id-cell" : undefined}>{c.cell(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataSection>
  );
}
