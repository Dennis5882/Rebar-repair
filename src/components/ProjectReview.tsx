import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { getProjectSummary } from "../lib/api";
import { errText } from "../lib/errText";
import type { ProjectSummary } from "../types/project";
import type { TFn } from "../i18n/types";
import { Geometry3DSection } from "./Geometry3DSection";

const LIST_CAP = 30;

function capped<T>(items: T[]): { shown: T[]; hiddenCount: number } {
  if (items.length <= LIST_CAP) return { shown: items, hiddenCount: 0 };
  return { shown: items.slice(0, LIST_CAP), hiddenCount: items.length - LIST_CAP };
}

export function ProjectReview() {
  const { t } = useI18n();
  const { payload } = useConn();
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

  // Same stacked-card board layout as the member tabs (.beam-board): a toolbar
  // card with the load control, an optional summary strip, then one bordered
  // .board-wrap card per data list — so switching to this tab reads as the
  // same app, not a differently-styled page.
  return (
    <div className="beam-board">
      <div className="board-toolbar panel">
        <div className="board-toolbar-row">
          <button className="btn primary" type="button" onClick={handleLoad} disabled={loading}>
            {t("project.loadBtn")}
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>{t("project.hint")}</div>
        {status && <div className="hint" style={{ marginTop: 6, marginBottom: 0 }}>{status}</div>}
      </div>

      <Geometry3DSection />

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
// (or an empty note) below — the same shell the member boards use.
function DataSection({ title, total, empty, emptyLabel, moreHidden, moreLabel, children }: {
  title: string;
  total: number;
  empty: boolean;
  emptyLabel: string;
  moreHidden?: number;
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="board-wrap">
      <div className="board-head">
        <h2>
          {title} <span className="board-count">({total})</span>
        </h2>
        {moreHidden ? <span className="board-hint">{moreLabel}</span> : null}
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
  const { shown, hiddenCount } = capped(items);
  return (
    <DataSection
      title={t(titleKey)}
      total={total}
      empty={shown.length === 0}
      emptyLabel={t("project.emptyList")}
      moreHidden={hiddenCount}
      moreLabel={t("project.moreHidden", { count: hiddenCount })}
    >
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.header} className={c.numeric ? "num-col" : i === 0 ? "id-col" : undefined}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => (
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
