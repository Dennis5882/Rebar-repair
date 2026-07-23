import type { BeamWritePayload, MemberPayload, MemberType, SectorKey } from "../types/rebar";
import type { ProjectSummary } from "../types/project";
import type { ModelGeometry } from "../types/geometry";

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

export interface ListOk<T> {
  ok: true;
  data: Record<string, T>;
  names?: Record<string, string>;
}
export type ListResult<T> = ListOk<T> | ApiError;

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
