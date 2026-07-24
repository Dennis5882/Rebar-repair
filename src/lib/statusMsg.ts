import type { TFn } from "../i18n/types";
import type { ApiError } from "./api";
import { errText } from "./errText";

// Status/keylist strings used to be resolved to plain text via t() at the
// moment an action happened (e.g. inside handleSave) and stored as-is in
// React state. That baked in whatever language was active at click time —
// switching the UI language afterward left old messages stuck in the old
// language until the next action overwrote them. Storing the *intent*
// (kind + raw data) instead and resolving via t() at render time fixes
// this: language switches re-render every component reading useI18n(),
// so the text now always matches the current language.
export type StatusMsg =
  | { ok: true; kind: "listLoaded"; count: number }
  // Beam board's own list-loaded message ("단면정보 N건 불러옴") — distinct
  // from listLoaded (shared with the column/wall forms, which count elements
  // not sections) so its wording can say "sections" without misdescribing
  // what those forms load.
  | { ok: true; kind: "sectionsLoaded"; count: number }
  | { ok: false; kind: "listFail"; res: ApiError }
  | { ok: false; kind: "listError"; error: string }
  | { ok: false; kind: "keyRequired" }
  | { ok: false; kind: "keyExists" }
  | { ok: true; kind: "saving" }
  | { ok: false; kind: "saveFail"; res: ApiError }
  | { ok: true; kind: "saveDone" }
  | { ok: false; kind: "saveError"; error: string }
  // A bulk (section-group) save where SOME elements succeeded and some
  // failed — distinct from saveFail (nothing succeeded) so the message can
  // tell the user their live model is now in a partially-updated state,
  // not silently imply the whole save was a no-op.
  | { ok: false; kind: "saveBulkPartialFail"; failedKeys: string[]; totalCount: number; res: ApiError }
  // Run-analysis (/doc/ANAL) feedback for the beam board's "해석 실행" button.
  // analyzeRunning is the timeout/parse-error case: a long solve can outlast
  // the serverless function, so a missing/late response means "still solving
  // in Gen NX", NOT a hard failure (see api/run-analysis.ts).
  | { ok: true; kind: "analyzing" }
  | { ok: true; kind: "analyzeDone" }
  | { ok: false; kind: "analyzeRunning" }
  | { ok: false; kind: "analyzeFail"; res: ApiError }
  // Design-result (BC-TABLE) fetch feedback for the "결과값 불러오기" button.
  | { ok: true; kind: "demandLoaded"; count: number }
  | { ok: false; kind: "demandEmpty" }
  | { ok: false; kind: "demandFail"; res: ApiError };

const LIST_KINDS = new Set(["listLoaded", "sectionsLoaded", "listFail", "listError"]);

// Distinguishes a list-load result from a save result so each can be shown
// next to the action that produced it (list status near the "목록
// 불러오기" button, save status near the save button) instead of both
// sharing one status box far from whichever button was actually clicked.
export function isListStatus(s: StatusMsg): boolean {
  return LIST_KINDS.has(s.kind);
}

// "status show ok"/"status show err" className logic used to be
// hand-derived at every call site (7 near-identical copies across
// BeamForm/WallForm/ColumnLikeForm/ConnDrawer/BeamCheckSection) — centralized
// here alongside the text resolvers so a new status kind only has to teach
// its ok/err-ness in one place.
export function statusClass(s: StatusMsg): "ok" | "err" {
  return s.ok ? "ok" : "err";
}

export function statusText(t: TFn, s: StatusMsg): string {
  switch (s.kind) {
    case "listLoaded":
      return t("js.listLoaded", { count: s.count });
    case "sectionsLoaded":
      return t("board.sectionsLoaded", { count: s.count });
    case "listFail":
      return t("js.listFail", { error: errText(t, s.res) });
    case "listError":
      return t("js.listError", { error: s.error });
    case "keyRequired":
      return t("js.keyRequired");
    case "keyExists":
      return t("js.keyExists");
    case "saving":
      return t("js.saving");
    case "saveFail":
      return t("js.saveFail", { error: errText(t, s.res) });
    case "saveDone":
      return t("js.saveDone");
    case "saveError":
      return t("js.saveError", { error: s.error });
    case "saveBulkPartialFail":
      return t("js.saveBulkPartialFail", {
        failed: s.failedKeys.length,
        total: s.totalCount,
        keys: s.failedKeys.join(", "),
        error: errText(t, s.res),
      });
    case "analyzing":
      return t("board.analyzing");
    case "analyzeDone":
      return t("board.analyzeDone");
    case "analyzeRunning":
      return t("board.analyzeRunning");
    case "analyzeFail":
      return t("board.analyzeFail", { error: errText(t, s.res) });
    case "demandLoaded":
      return t("board.demandLoaded", { count: s.count });
    case "demandEmpty":
      return t("board.demandEmpty");
    case "demandFail":
      return t("board.demandFail", { error: errText(t, s.res) });
  }
}

export type KeylistMsg = { kind: "itemsFound"; count: number; keys: string[] } | { kind: "noItems" } | null;

export function keylistText(t: TFn, s: KeylistMsg): string {
  if (!s) return "";
  if (s.kind === "noItems") return t("js.noItems");
  return t("js.itemsFound", { count: s.count, keys: s.keys.join(", ") });
}

// Same rationale as StatusMsg above, for ConnDrawer's connect-test result.
export type ConnStatus =
  | { kind: "checking" }
  | { kind: "connOk"; program: string }
  | { kind: "connDisconnected" }
  | { kind: "connMismatch"; program?: string }
  | { kind: "connFail"; res: ApiError }
  | { kind: "connError"; error: string };

export function connStatusClass(s: ConnStatus): "ok" | "err" {
  return s.kind === "connOk" ? "ok" : "err";
}

export function connStatusText(t: TFn, s: ConnStatus): string {
  switch (s.kind) {
    case "checking":
      return t("js.checking");
    case "connOk":
      return t("js.connOk", { program: s.program });
    case "connDisconnected":
      return t("js.connDisconnected");
    case "connMismatch":
      return t("js.connMismatch", { program: s.program });
    case "connFail":
      return t("js.connFail", { error: errText(t, s.res) || `HTTP ${s.res.httpStatus || "?"}` });
    case "connError":
      return t("js.connError", { error: s.error });
  }
}

// Same rationale as StatusMsg above, for BeamCheckSection's "Gen NX 결과
// 불러오기" (fetch Mu/Vu from BC-TABLE) button.
export type BeamResultStatus =
  | { kind: "fetching" }
  | { kind: "fetchOk"; count: number }
  | { kind: "fetchEmpty" }
  | { kind: "fetchFail"; res: ApiError }
  | { kind: "fetchError"; error: string };

export function beamResultStatusClass(s: BeamResultStatus): "ok" | "err" {
  return s.kind === "fetchOk" ? "ok" : "err";
}

export function beamResultStatusText(t: TFn, s: BeamResultStatus): string {
  switch (s.kind) {
    case "fetching":
      return t("beam.fetching");
    case "fetchOk":
      return t("beam.fetchOk", { count: s.count });
    case "fetchEmpty":
      return t("beam.fetchEmpty");
    case "fetchFail":
      return t("beam.fetchFail", { error: errText(t, s.res) });
    case "fetchError":
      return t("beam.fetchError", { error: s.error });
  }
}
