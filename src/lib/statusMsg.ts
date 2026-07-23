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
  | { ok: false; kind: "listFail"; res: ApiError }
  | { ok: false; kind: "listError"; error: string }
  | { ok: false; kind: "keyRequired" }
  | { ok: true; kind: "saving" }
  | { ok: false; kind: "saveFail"; res: ApiError }
  | { ok: true; kind: "saveDone" }
  | { ok: false; kind: "saveError"; error: string };

export function statusText(t: TFn, s: StatusMsg): string {
  switch (s.kind) {
    case "listLoaded":
      return t("js.listLoaded", { count: s.count });
    case "listFail":
      return t("js.listFail", { error: errText(t, s.res) });
    case "listError":
      return t("js.listError", { error: s.error });
    case "keyRequired":
      return t("js.keyRequired");
    case "saving":
      return t("js.saving");
    case "saveFail":
      return t("js.saveFail", { error: errText(t, s.res) });
    case "saveDone":
      return t("js.saveDone");
    case "saveError":
      return t("js.saveError", { error: s.error });
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
