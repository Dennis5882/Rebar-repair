// Plotly.js is loaded from CDN on demand (only when the 3D view is opened)
// rather than bundled, matching the pattern in the sibling `story` project's
// 3D viewer (E:\AI Study\story\index.html) and keeping it out of the main
// bundle since it's a large library.
const PLOTLY_SRC = "https://cdn.plot.ly/plotly-2.35.2.min.js";

declare global {
  interface Window {
    Plotly?: any;
  }
}

let plotlyPromise: Promise<any> | null = null;

export function loadPlotly(): Promise<any> {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (plotlyPromise) return plotlyPromise;
  plotlyPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLOTLY_SRC;
    script.async = true;
    script.onload = () => (window.Plotly ? resolve(window.Plotly) : reject(new Error("Plotly failed to initialize")));
    script.onerror = () => reject(new Error("Failed to load Plotly from CDN"));
    document.head.appendChild(script);
  });
  return plotlyPromise;
}
