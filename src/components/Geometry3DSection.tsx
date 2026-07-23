import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/useI18n";
import { useConn } from "../context/ConnContext";
import { getProjectGeometry } from "../lib/api";
import { errText } from "../lib/errText";
import type { ModelGeometry } from "../types/geometry";
import type { GeoVisibility } from "./GeometryCanvas";

// three.js + @react-three/* are a large dependency — code-split via
// React.lazy so they only load once the 3D view is actually opened,
// same intent as the old CDN-loaded Plotly setup.
const GeometryCanvas = lazy(() => import("./GeometryCanvas"));

class GeometryErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const DEFAULT_VISIBILITY: GeoVisibility = { cols: true, beams: true, braces: true, walls: true, nodes: false, supports: true };

const CHIPS: { key: keyof GeoVisibility; labelKey: string; color: string }[] = [
  { key: "cols", labelKey: "geo3d.legendCol", color: "#2a78d6" },
  { key: "beams", labelKey: "geo3d.legendBeam", color: "#38b6d6" },
  { key: "braces", labelKey: "geo3d.legendBrace", color: "#9b8cff" },
  { key: "walls", labelKey: "geo3d.legendWall", color: "#9b8cff" },
  { key: "nodes", labelKey: "geo3d.legendNode", color: "#898781" },
  { key: "supports", labelKey: "geo3d.legendSupport", color: "#e34948" },
];

export function Geometry3DSection() {
  const { t } = useI18n();
  const { payload } = useConn();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [geometry, setGeometry] = useState<ModelGeometry | null>(null);
  const [visibility, setVisibility] = useState<GeoVisibility>(DEFAULT_VISIBILITY);

  function toggle(key: keyof GeoVisibility) {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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
          <>
            <div className="geo3d-legend">
              {CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={"geo3d-chip" + (visibility[c.key] ? "" : " off")}
                  onClick={() => toggle(c.key)}
                >
                  <span className="dot" style={{ background: c.color }} />
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
            <div className="geo3d-plot">
              <GeometryErrorBoundary fallback={<div className="hint" style={{ margin: 0 }}>{t("geo3d.sceneLoadError")}</div>}>
                <Suspense fallback={<div className="hint" style={{ margin: 0 }}>{t("geo3d.loading")}</div>}>
                  <GeometryCanvas geo={geometry} visibility={visibility} />
                </Suspense>
              </GeometryErrorBoundary>
            </div>
          </>
        ))}
    </div>
  );
}
