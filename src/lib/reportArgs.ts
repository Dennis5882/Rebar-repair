// Builds the Argument for Gen NX's design-check report export
// (DESIGN/RC/KDS-41-20-2022/{BC,CC,BRC,WC}-REPORT). Pure and dependency-free
// so api/beam-design-result.ts can import it (see CLAUDE.md rule 2) and it can
// be unit-tested. Live-verified 2026-10-12 on a GB/T50010-10 model (the
// KDS-path report serves GB results too):
// - EXPORT_PATH must use forward slashes. With backslashes the server
//   unescapes the path a second time ("C:\Users\…" became "C:Users…") and the
//   files land somewhere else while it still reports SUCCESS.
// - Graphic writes .jpg + .emf + .bmp (the bmp is ~24 MB per page); Detail and
//   Summary write .txt (the manual says DOC for Detail — it is text).
// - The file lands on the PC running Gen NX, not in the browser.

export type ReportMember = "BEAM" | "COLUMN" | "BRACE" | "WALL";
export type ReportBy = "MEMB" | "PROP" | "WID+STORY" | "WID";
export type ReportMode = "Graphic" | "Detail" | "Summary" | "PMCurve";

export interface ReportRequest {
  member: ReportMember;
  by: ReportBy;
  mode: ReportMode;
  elemKeys?: Array<string | number>; // BEAM/COLUMN/BRACE by MEMB
  sectionIds?: Array<string | number>; // BEAM/COLUMN/BRACE by PROP
  wallIds?: Array<string | number>; // WALL — omitted/empty = every wall
  positions?: { endI?: boolean; mid?: boolean; endJ?: boolean }; // Detail only
  exportPath: string;
  outputName?: string;
}

export type ReportBuild =
  | { ok: true; path: string; argument: Record<string, unknown> }
  | { ok: false; code: ReportErrorCode };

export type ReportErrorCode = "bad_member" | "bad_mode" | "no_targets" | "bad_path";

const REPORT_PATH: Record<ReportMember, string> = {
  BEAM: "/DESIGN/RC/KDS-41-20-2022/BC-REPORT",
  COLUMN: "/DESIGN/RC/KDS-41-20-2022/CC-REPORT",
  BRACE: "/DESIGN/RC/KDS-41-20-2022/BRC-REPORT",
  WALL: "/DESIGN/RC/KDS-41-20-2022/WC-REPORT",
};

/** Which formats each "by" accepts — the manual's oneOf lists per mode key. */
export const REPORT_MODES: Record<ReportBy, ReportMode[]> = {
  MEMB: ["Graphic", "Detail", "Summary"],
  PROP: ["Graphic", "Summary"],
  "WID+STORY": ["Graphic", "Detail", "Summary", "PMCurve"],
  WID: ["Graphic", "Summary", "PMCurve"],
};

/** "C:\MIDAS\Report" / "C:/MIDAS/Report/" → "C:/MIDAS/Report/"; null if not an absolute Windows path. */
export function normalizeExportPath(raw: string): string | null {
  const p = String(raw || "").trim().replace(/\\+/g, "/").replace(/\/{2,}/g, "/");
  if (!/^[A-Za-z]:\//.test(p)) return null;
  return p.endsWith("/") ? p : p + "/";
}

/** Keep a plain file stem: no folders, no characters Windows forbids. */
export function sanitizeOutputName(raw: string | undefined, fallback: string): string {
  const s = String(raw || "").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\.+$/, "");
  return s || fallback;
}

function ids(list: Array<string | number> | undefined): number[] {
  return (list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

export function buildReportArgument(req: ReportRequest): ReportBuild {
  const path = REPORT_PATH[req.member];
  if (!path) return { ok: false, code: "bad_member" };
  const isWall = req.member === "WALL";
  const byOk = isWall ? req.by === "WID+STORY" || req.by === "WID" : req.by === "MEMB" || req.by === "PROP";
  if (!byOk || !REPORT_MODES[req.by]?.includes(req.mode)) return { ok: false, code: "bad_mode" };
  const exportPath = normalizeExportPath(req.exportPath);
  if (!exportPath) return { ok: false, code: "bad_path" };
  const outputName = sanitizeOutputName(req.outputName, `${req.member}_${req.by.replace("+", "_")}_${req.mode}`);

  const argument: Record<string, unknown> = { REPORT_TYPE: req.by, EXPORT_PATH: exportPath, OUTPUT_NAME: outputName };
  if (isWall) {
    argument[req.by === "WID" ? "CURRENT_MODE_WID" : "CURRENT_MODE_WID_STORY"] = req.mode;
    const walls = ids(req.wallIds);
    if (walls.length) argument.SELECTIONS = [{ WALL_IDS: { KEYS: walls } }];
  } else if (req.by === "MEMB") {
    const elems = ids(req.elemKeys);
    if (!elems.length) return { ok: false, code: "no_targets" };
    argument.CURRENT_MODE_MEMB = req.mode;
    argument.ELEMS = { KEYS: elems };
    if (req.mode === "Detail") {
      const p = req.positions || {};
      const pos = { END_I: p.endI ?? true, MID: p.mid ?? false, END_J: p.endJ ?? false };
      argument.DETAIL_POSITIONS = pos.END_I || pos.MID || pos.END_J ? pos : { END_I: true, MID: false, END_J: false };
    }
  } else {
    const secs = ids(req.sectionIds);
    if (!secs.length) return { ok: false, code: "no_targets" };
    argument.CURRENT_MODE_PROP = req.mode;
    argument.SECTIONS = secs;
  }
  return { ok: true, path, argument };
}
