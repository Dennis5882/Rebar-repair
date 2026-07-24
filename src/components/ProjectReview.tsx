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

  return (
    <section className="panel">
      <h2>{t("project.title")}</h2>
      <div className="hint">{t("project.hint")}</div>

      <Geometry3DSection />

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary" type="button" onClick={handleLoad} disabled={loading}>
          {t("project.loadBtn")}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          {status}
        </span>
      </div>

      {summary && (
        <>
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
    </section>
  );
}

// Shared section wrapper: a title with a monospace count pill over a rounded,
// bordered data-table card — the engineering-board look applied to the
// read-only model summary.
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
    <div className="data-section">
      <div className="data-section-head">
        <h3>{title}</h3>
        <span className="count-pill">{total}</span>
      </div>
      {empty ? (
        <div className="hint" style={{ margin: 0 }}>{emptyLabel}</div>
      ) : (
        <>
          <div className="data-table-wrap">{children}</div>
          {moreHidden ? <div className="hint" style={{ margin: "6px 0 0" }}>{moreLabel}</div> : null}
        </>
      )}
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
