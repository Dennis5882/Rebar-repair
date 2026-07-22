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

function ElementsSection({ summary, t }: { summary: ProjectSummary; t: TFn }) {
  const types = Object.entries(summary.elements.byType).sort((a, b) => b[1] - a[1]);
  return (
    <div className="subhead-block">
      <div className="subhead">{t("project.elementsTitle")}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("project.totalCount", { count: summary.elements.total })}
      </div>
      {types.length === 0 ? (
        <div className="hint" style={{ margin: 0 }}>
          {t("project.emptyList")}
        </div>
      ) : (
        <table className="summary-table">
          <thead>
            <tr>
              <th>{t("project.colType")}</th>
              <th>{t("project.colCount")}</th>
            </tr>
          </thead>
          <tbody>
            {types.map(([ty, count]) => (
              <tr key={ty}>
                <td>{ty}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface Column<T> {
  header: string;
  cell: (item: T) => ReactNode;
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
    <div className="subhead-block">
      <div className="subhead">{t(titleKey)}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("project.totalCount", { count: total })}
      </div>
      {shown.length === 0 ? (
        <div className="hint" style={{ margin: 0 }}>
          {t("project.emptyList")}
        </div>
      ) : (
        <>
          <table className="summary-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.header}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={rowKey(item)}>
                  {columns.map((c) => (
                    <td key={c.header}>{c.cell(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenCount > 0 && (
            <div className="hint" style={{ margin: "4px 0 0" }}>
              {t("project.moreHidden", { count: hiddenCount })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
