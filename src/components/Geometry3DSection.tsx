import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { getProjectGeometry } from "../lib/api";
import { errText } from "../lib/errText";
import { loadPlotly } from "../lib/loadPlotly";
import { buildGeometryTraces } from "../lib/geometryPlot";
import type { ModelGeometry } from "../types/geometry";

export function Geometry3DSection() {
  const { t } = useI18n();
  const { payload } = useConn();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [geometry, setGeometry] = useState<ModelGeometry | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!geometry || !geometry.nodes.length || !plotRef.current) return;
    let cancelled = false;
    loadPlotly()
      .then((Plotly) => {
        if (cancelled || !plotRef.current) return;
        const traces = buildGeometryTraces(geometry, t);
        Plotly.newPlot(
          plotRef.current,
          traces,
          {
            paper_bgcolor: "rgba(0,0,0,0)",
            scene: {
              aspectmode: "data",
              xaxis: { title: "X" },
              yaxis: { title: "Y" },
              zaxis: { title: "Z" },
            },
            margin: { l: 0, r: 0, t: 0, b: 0 },
            legend: { orientation: "h", y: 1.02 },
          },
          { displayModeBar: true, responsive: true }
        );
      })
      .catch((e) => setStatus(t("geo3d.plotlyLoadError", { error: String(e) })));
    return () => {
      cancelled = true;
    };
  }, [geometry, t]);

  async function handleLoad() {
    setLoading(true);
    setStatus(t("geo3d.loading"));
    try {
      const res = await getProjectGeometry(payload);
      if (res.ok) {
        setGeometry(res.data);
        setStatus("");
      } else {
        setGeometry(null);
        setStatus(t("geo3d.loadFail", { error: errText(t, res) || `HTTP ${res.httpStatus || "?"}` }));
      }
    } catch (e) {
      setGeometry(null);
      setStatus(t("geo3d.loadError", { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="subhead-block">
      <div className="subhead">{t("geo3d.title")}</div>
      <div className="hint" style={{ margin: "0 0 8px" }}>
        {t("geo3d.hint")}
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn" type="button" onClick={handleLoad} disabled={loading}>
          {t("geo3d.loadBtn")}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          {status}
        </span>
      </div>
      {geometry &&
        (geometry.nodes.length === 0 ? (
          <div className="hint" style={{ margin: 0 }}>
            {t("project.emptyList")}
          </div>
        ) : (
          <div ref={plotRef} className="geo3d-plot" />
        ))}
    </div>
  );
}
