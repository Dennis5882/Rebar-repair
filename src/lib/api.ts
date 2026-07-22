import type { MemberPayload, MemberType } from "../types/rebar";
import type { ProjectSummary } from "../types/project";

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
  | "parse_error";

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

export function saveRebar(
  memberType: MemberType,
  key: string,
  payload: MemberPayload,
  conn: ConnInfo
): Promise<SaveResult> {
  return post<SaveResult>("/api/rebar-update", { memberType, key, payload, ...conn });
}
