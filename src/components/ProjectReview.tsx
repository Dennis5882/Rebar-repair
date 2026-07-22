import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { getProjectSummary } from "../lib/api";
import { errText } from "../lib/errText";
import type { ProjectSummary, NamedItem, LoadCombinationItem, ConstraintItem } from "../types/project";
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
          <NamedListSection
            titleKey="project.sectionsTitle"
            total={summary.sections.total}
            items={summary.sections.items}
            t={t}
          />
          <NamedListSection
            titleKey="project.materialsTitle"
            total={summary.materials.total}
            items={summary.materials.items}
            t={t}
          />
          <LoadCombinationSection summary={summary} t={t} />
          <ConstraintSection summary={summary} t={t} />
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

function NamedListSection({
  titleKey,
  total,
  items,
  t,
}: {
  titleKey: string;
  total: number;
  items: NamedItem[];
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
                <th>{t("project.colId")}</th>
                <th>{t("project.colName")}</th>
                <th>{t("project.colType")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td>{it.name}</td>
                  <td>{it.type}</td>
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

function ConstraintSection({ summary, t }: { summary: ProjectSummary; t: TFn }) {
  const { shown, hiddenCount } = capped<ConstraintItem>(summary.constraints.items);
  return (
    <div className="subhead-block">
      <div className="subhead">{t("project.constraintsTitle")}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("project.totalCount", { count: summary.constraints.total })}
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
                <th>{t("project.colNodeId")}</th>
                <th>{t("project.colGroup")}</th>
                <th>{t("project.colConstraint")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.nodeId}>
                  <td>{it.nodeId}</td>
                  <td>{it.groupName}</td>
                  <td>{it.constraint}</td>
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

function LoadCombinationSection({ summary, t }: { summary: ProjectSummary; t: TFn }) {
  const { shown, hiddenCount } = capped<LoadCombinationItem>(summary.loadCombinations.items);
  return (
    <div className="subhead-block">
      <div className="subhead">{t("project.loadCombosTitle")}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("project.totalCount", { count: summary.loadCombinations.total })}
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
                <th>{t("project.colId")}</th>
                <th>{t("project.colName")}</th>
                <th>{t("project.colActive")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td>{it.name}</td>
                  <td>{it.active}</td>
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
