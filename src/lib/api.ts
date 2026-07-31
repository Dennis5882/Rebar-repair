import type { BeamPayload, MemberPayload, MemberType, SectorKey } from "../types/rebar";
import type { ProjectSummary } from "../types/project";
import type { ModelGeometry } from "../types/geometry";
import type { TFn } from "../i18n/types";

export interface ConnInfo {
  apiKey: string;
  product: string;
  baseUrl: string;
}

export type ErrorCode =
  | "missing_key"
  | "unknown_product"
  | "unknown_member_type"
  | "missing_key_id"
  | "empty_payload"
  | "disconnected"
  | "mismatch"
  | "http"
  | "parse_error"
  | "timeout"
  // BC-ANAL precondition: a rebar/member edit invalidated the solve, so the
  // model needs "해석 실행" (/doc/ANAL) run before the design check can succeed.
  | "need_analysis";

export interface ApiError {
  ok: false;
  code?: ErrorCode;
  error?: string;
  program?: string;
  product?: string;
  memberType?: string;
  httpStatus?: number;
  status?: string;
}

export interface VerifyOk {
  ok: true;
  program?: string;
  user?: string;
}
export type VerifyResult = VerifyOk | ApiError;

// One section group: `name` is the SECT_NAME, `elementKeys` every element
// using it, `payload` the section's shared rebar. Structurally a supertype of
// BeamSectionGroup (below), so sectionGroupLabel works for the beam board too.
export interface SectionGroup<T> {
  name?: string;
  elementKeys: string[];
  payload: T;
}
export interface ListOk<T> {
  ok: true;
  data: Record<string, T>;
  names?: Record<string, string>;
  // WALL only: Wall Mark name and thickness (mm) per Wall ID, for the board's
  // Wall Mark / Thickness grouping modes — see [[genxn-api-schema-findings]].
  marks?: Record<string, string>;
  thicknessMm?: Record<string, number>;
  // WALL only: the model's real story names, bottom-to-top, for the Sub Wall
  // ID story-range dropdowns (STORY.FROM/TO must be an exact story name).
  stories?: string[];
}
export type ListResult<T> = ListOk<T> | ApiError;

// Renders a section's display label (name + element count). Used by the beam
// board; `sid` is a real SECT id, or an `elem:<key>` fallback for an element
// with no resolvable section.
export function sectionGroupLabel<T>(t: TFn, sid: string, grp: SectionGroup<T>): string {
  const name = grp.name || sid.replace(/^elem:/, "");
  return grp.elementKeys.length > 1 ? t("common.sectionOptionLabel", { name, count: grp.elementKeys.length }) : name;
}

// Every beam section in the model (api/beam-sections.ts), including ones with
// no rebar yet. Carries B/H dims (mm) read from /db/SECT so the board can
// compute capacity without the user re-typing section sizes.
export interface BeamSectionGroup {
  name?: string;
  elementKeys: string[];
  payload: BeamPayload;
  dimB?: number;
  dimH?: number;
}
export interface BeamSectionsOk {
  ok: true;
  unit: string;
  sections: Record<string, BeamSectionGroup>;
}
export type BeamSectionsResult = BeamSectionsOk | ApiError;

export function listBeamSections(conn: ConnInfo): Promise<BeamSectionsResult> {
  return post<BeamSectionsResult>("/api/beam-sections", conn);
}

// Generic section listing for the non-beam boards (COLUMN today; WALL/BRACE
// later). Same grouped shape as BeamSectionGroup — every section of the given
// member type, whether or not it already carries a rebar record — but with a
// caller-supplied payload type (ColumnLikePayload for the column board). BEAM
// keeps its own dedicated listBeamSections above.
export interface MemberSectionGroup<T> {
  name?: string;
  elementKeys: string[];
  payload: T;
  dimB?: number;
  dimH?: number;
}
export interface MemberSectionsOk<T> {
  ok: true;
  unit: string;
  sections: Record<string, MemberSectionGroup<T>>;
}
export type MemberSectionsResult<T> = MemberSectionsOk<T> | ApiError;

export function listMemberSections<T>(memberType: MemberType, conn: ConnInfo): Promise<MemberSectionsResult<T>> {
  return post<MemberSectionsResult<T>>("/api/member-sections", { memberType, ...conn });
}

export interface SaveOk {
  ok: true;
  data?: unknown;
}
export type SaveResult = SaveOk | ApiError;

export interface ProjectSummaryOk {
  ok: true;
  data: ProjectSummary;
}
export type ProjectSummaryResult = ProjectSummaryOk | ApiError;

export interface ProjectGeometryOk {
  ok: true;
  data: ModelGeometry;
}
export type ProjectGeometryResult = ProjectGeometryOk | ApiError;

export interface UnitOk {
  ok: true;
  unit: string;
}
export type UnitResult = UnitOk | ApiError;

export interface BeamDemandPoint {
  muNeg?: number;
  muPos?: number;
  vu?: number;
  // Gen NX's own design-check verdict for this position (present only after a
  // BC-TABLE read against a KDS model whose check has been run). `chk`/`chkRbr`
  // are CHK_STR/CHK_RBR ("OK"/"NG"…); ratN/ratP/ratV are demand/capacity ratios
  // for negative moment / positive moment / shear.
  chk?: string;
  chkRbr?: string;
  ratN?: number;
  ratP?: number;
  ratV?: number;
}
export interface BeamDesignResultOk {
  ok: true;
  bySector: Partial<Record<SectorKey, BeamDemandPoint>>;
}
export type BeamDesignResultResult = BeamDesignResultOk | ApiError;

export interface BeamDesignResultsAllOk {
  ok: true;
  // Keyed by the element id that was queried (one representative element per
  // section). `partial` is true if the batch stopped early on its time budget.
  byElem: Record<string, Partial<Record<SectorKey, BeamDemandPoint>>>;
  partial?: boolean;
  // True when the batch got nothing back because the model needs re-analysis
  // (BC-ANAL "please perform analysis") — distinct from a non-KDS empty result.
  needAnalysis?: boolean;
}
export type BeamDesignResultsAllResult = BeamDesignResultsAllOk | ApiError;

export interface RunAnalysisOk {
  ok: true;
  data?: unknown;
}
export type RunAnalysisResult = RunAnalysisOk | ApiError;

// --- COLUMN / WALL design check (CC-TABLE / WC-TABLE via /api/beam-design-result
// with member set). One compact row per element (column) or per WID+Story (wall);
// the board reduces a key's rows to a single OK/NG via memberVerdictFromRows.
export interface MemberCheckRow {
  chk?: string; // CHK_STR ("OK"/"NG"…); "M"/placeholders are ignored downstream
  chkRbr?: string; // CHK_RBR (walls only; a position code for columns)
  ratPM?: number; // governing axial/moment (P-M) ratio
  ratShear?: number; // governing shear ratio
}
export interface MemberCheckOk {
  ok: true;
  // Column: keyed by SECT (the board's section id). Wall: keyed by WID.
  byKey: Record<string, MemberCheckRow[]>;
  // True when *-ANAL reported the "please perform analysis" precondition — run
  // "해석 실행" first (distinct from a non-KDS/empty result).
  needAnalysis?: boolean;
}
export type MemberCheckResult = MemberCheckOk | ApiError;

// Read/re-check column verdicts. `recheck` runs CC-ANAL first (whole model, or
// scoped to one section when `sectionId` is given); omit it to just read the
// results already computed in Gen NX. `elemKeys`, when given, scopes the
// CC-TABLE read to that section's elements (the per-section recheck) so the read
// doesn't return the whole model. Non-KDS models come back with an empty map.
export function runColumnCheck(conn: ConnInfo, opts?: { recheck?: boolean; sectionId?: string; elemKeys?: string[] }): Promise<MemberCheckResult> {
  return post<MemberCheckResult>("/api/beam-design-result", { member: "COLUMN", recheck: opts?.recheck, sectionId: opts?.sectionId, elemKeys: opts?.elemKeys, ...conn });
}

// Read/re-check wall verdicts (keyed by WID). `recheck` runs WC-ANAL "ALL" first
// (cheap; walls have no section-scoped recheck).
export function runWallCheck(conn: ConnInfo, opts?: { recheck?: boolean }): Promise<MemberCheckResult> {
  return post<MemberCheckResult>("/api/beam-design-result", { member: "WALL", recheck: opts?.recheck, ...conn });
}

// Read/re-check brace verdicts (BRC-ANAL/BRC-TABLE, keyed by SECT like columns).
// Same section-scoped recheck as columns. A brace that fails reads a governing-
// mode CHK_STR ("PM-"), handled by memberVerdictFromRows.
export function runBraceCheck(conn: ConnInfo, opts?: { recheck?: boolean; sectionId?: string; elemKeys?: string[] }): Promise<MemberCheckResult> {
  return post<MemberCheckResult>("/api/beam-design-result", { member: "BRACE", recheck: opts?.recheck, sectionId: opts?.sectionId, elemKeys: opts?.elemKeys, ...conn });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    return (await res.json()) as T;
  } catch {
    return { ok: false, code: "parse_error" } as T;
  }
}

export function verifyConnection(conn: ConnInfo): Promise<VerifyResult> {
  return post<VerifyResult>("/api/model", { action: "verify", ...conn });
}

export function listRebar<T = unknown>(memberType: MemberType, conn: ConnInfo): Promise<ListResult<T>> {
  return post<ListResult<T>>("/api/rebar", { action: "list", memberType, ...conn });
}

export function getProjectSummary(conn: ConnInfo): Promise<ProjectSummaryResult> {
  return post<ProjectSummaryResult>("/api/project-summary", conn);
}

export function getProjectGeometry(conn: ConnInfo): Promise<ProjectGeometryResult> {
  return post<ProjectGeometryResult>("/api/project-geometry", conn);
}

export function getModelUnit(conn: ConnInfo): Promise<UnitResult> {
  return post<UnitResult>("/api/model", { action: "unit", ...conn });
}

// Batch demand fetch for the whole board — one representative element per
// section. The backend queries each element separately (BC-TABLE's MEMB
// column can't be trusted to demux a multi-element response), so this can
// take a few seconds on a many-section model; it returns whatever completed
// within its time budget with `partial: true` if it had to stop early.
export function getAllBeamDesignResults(elemKeys: string[], conn: ConnInfo): Promise<BeamDesignResultsAllResult> {
  return post<BeamDesignResultsAllResult>("/api/beam-design-result", { elemKeys, ...conn });
}

// Re-run the model's beam design check (BC-ANAL "ALL") and read every section's
// verdict in one round-trip — the "Gen NX 재검토" button. Same batch response
// shape as getAllBeamDesignResults, but each element's points now carry Gen NX's
// own chk/ratN/ratP/ratV. KDS-only: on a non-KDS model the read comes back
// empty and the board falls back to the in-browser formula.
export function runBeamCheck(elemKeys: string[], conn: ConnInfo): Promise<BeamDesignResultsAllResult> {
  return post<BeamDesignResultsAllResult>("/api/beam-design-result", { elemKeys, recheck: true, ...conn });
}

// Re-check a SINGLE section (the detail drawer's "이 단면 검토 실행") — BC-ANAL
// scoped to that section/element, then read just its verdict. Near-instant vs
// the whole-model runBeamCheck above. `sectionId` is the section id when numeric
// (BC-ANAL SECTIONS); the backend falls back to the element otherwise. `elemKey`
// is the section's representative element, used for the BC-TABLE read-back.
export function runBeamCheckSection(elemKey: string, sectionId: string, conn: ConnInfo): Promise<BeamDesignResultResult> {
  return post<BeamDesignResultResult>("/api/beam-design-result", { elemKey, sectionId, recheck: true, ...conn });
}

// Runs the model's structural analysis (/doc/ANAL). A long solve can outlast
// the serverless function; the handler returns code:"timeout" in that case,
// and post()'s own parse-error fallback (code:"parse_error") covers a raw
// platform 504 — the caller treats both as "still running", not a failure.
export function runAnalysis(conn: ConnInfo): Promise<RunAnalysisResult> {
  return post<RunAnalysisResult>("/api/model", { action: "analyze", ...conn });
}

// BEAM's write endpoint takes the SAME shape it returns on read — the
// canonical BeamPayload (MAIN_BAR_TOP:{LAYER1:{NAME,NUM}} object + item-level
// DT/DB), sent via PUT. This was live-verified 2026-07-24 (see
// genxn-api-schema-findings): the manual's `vMAIN_BAR_TOP`/`MAIN_BAR_DC_TOP`
// "legacy" example shape is silently dropped by the server for populated bars
// (PUT returns 200 with the main bars stripped; POST returns "Wrong Field"),
// so the old toWritePayload() conversion produced a no-op save. Send the
// BeamPayload directly. (POST is create-only here — it 409s "Key Already
// Exist" on an existing section — so writes must use PUT, which the handler
// already does.)
export function saveRebar(memberType: MemberType, key: string, payload: MemberPayload, conn: ConnInfo): Promise<SaveResult> {
  return post<SaveResult>("/api/rebar", { action: "update", memberType, key, payload, ...conn });
}
