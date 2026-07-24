import type { BeamPayload, BeamWritePayload, MemberPayload, MemberType, SectorKey } from "../types/rebar";
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
  | "timeout";

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

// One entry per section (or per orphaned element with no resolvable
// section — see api/rebar-list.ts). `elementKeys` is every element sharing
// that section; `payload` is one representative element's data, used as
// the shared value for the whole group (practitioners give a section its
// own copy instead of varying rebar within one).
export interface SectionGroup<T> {
  name?: string;
  elementKeys: string[];
  payload: T;
}
export interface ListOk<T> {
  ok: true;
  data: Record<string, T>;
  names?: Record<string, string>;
  sections?: Record<string, SectionGroup<T>>;
}
export type ListResult<T> = ListOk<T> | ApiError;

// Shared by any member-type tab that adopts section-based (rather than
// element-based) list selection — currently BeamForm.tsx, but generic over
// T so COLUMN/BRACE/WALL can reuse it as-is instead of each writing their
// own copy. `sid` is either a real SECT id or api/rebar-list.ts's
// `elem:<key>` fallback for an element with no resolvable section.
export function sectionGroupLabel<T>(t: TFn, sid: string, grp: SectionGroup<T>): string {
  const name = grp.name || sid.replace(/^elem:/, "");
  return grp.elementKeys.length > 1 ? t("common.sectionOptionLabel", { name, count: grp.elementKeys.length }) : name;
}

// Every beam section in the model (api/beam-sections.ts), including ones with
// no rebar yet — unlike ListOk.sections which only groups elements that
// already have a REBB record. Carries B/H dims (mm) read from /db/SECT so the
// board can compute capacity without the user re-typing section sizes.
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
}
export interface BeamDesignResultOk {
  ok: true;
  bySector: Partial<Record<SectorKey, BeamDemandPoint>>;
}
export type BeamDesignResultResult = BeamDesignResultOk | ApiError;

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
  return post<VerifyResult>("/api/verify", conn);
}

export function listRebar<T = unknown>(memberType: MemberType, conn: ConnInfo): Promise<ListResult<T>> {
  return post<ListResult<T>>("/api/rebar-list", { memberType, ...conn });
}

export function getProjectSummary(conn: ConnInfo): Promise<ProjectSummaryResult> {
  return post<ProjectSummaryResult>("/api/project-summary", conn);
}

export function getProjectGeometry(conn: ConnInfo): Promise<ProjectGeometryResult> {
  return post<ProjectGeometryResult>("/api/project-geometry", conn);
}

export function getModelUnit(conn: ConnInfo): Promise<UnitResult> {
  return post<UnitResult>("/api/unit", conn);
}

export function getBeamDesignResult(elemKey: string, conn: ConnInfo): Promise<BeamDesignResultResult> {
  return post<BeamDesignResultResult>("/api/beam-design-result", { elemKey, ...conn });
}

// BEAM's write endpoint needs the legacy BeamWritePayload shape (see
// toWritePayload() in BeamForm.tsx and the doc comment on BeamWriteItem).
// Overloading on memberType catches a wrong-member-type payload (e.g.
// accidentally passing a WallPayload for "BEAM"). It does NOT catch passing
// BEAM's own canonical BeamPayload where BeamWritePayload is expected —
// both are structurally "weak types" (every field optional) with enough
// overlapping field names that TypeScript accepts the substitution anyway.
// Always call toWritePayload() explicitly at the BEAM save call site.
export function saveRebar(memberType: "BEAM", key: string, payload: BeamWritePayload, conn: ConnInfo): Promise<SaveResult>;
export function saveRebar(
  memberType: Exclude<MemberType, "BEAM">,
  key: string,
  payload: MemberPayload,
  conn: ConnInfo
): Promise<SaveResult>;
export function saveRebar(
  memberType: MemberType,
  key: string,
  payload: MemberPayload | BeamWritePayload,
  conn: ConnInfo
): Promise<SaveResult> {
  return post<SaveResult>("/api/rebar-update", { memberType, key, payload, ...conn });
}
