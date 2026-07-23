import type { VercelResponse } from "@vercel/node";

// Shared by every api/*.ts handler that talks to the MIDAS Open API.
// No default export here, so Vercel doesn't turn this into its own route.
//
// Two deployment gotchas hit live 2026-07-22 (both caused every handler to
// fail with ERR_MODULE_NOT_FOUND in production, invisible locally since
// `tsc --noEmit` with moduleResolution:"bundler" doesn't flag either):
//   1. Don't prefix this directory with `_` (e.g. api/_lib) — Vercel
//      excludes underscore-prefixed paths from the deployed function
//      output entirely, so importers can't find it at runtime.
//   2. Import it with an explicit .js extension (`./lib/midas.js`, even
//      though the source file is .ts) — package.json has "type":"module",
//      and Vercel runs each api/*.ts file as-compiled under Node's native
//      ESM loader (no bundling), which requires explicit extensions on
//      relative specifiers unlike a bundler or CommonJS require().

export const MIDAS_BASE: Record<string, string> = {
  gen: "https://moa-engineers.midasit.com:443/gen",
  civil: "https://moa-engineers.midasit.com:443/civil",
};

// KDS 41 20:2022 rebar-editing endpoints, one per member type.
export const ENDPOINTS: Record<string, string> = {
  BEAM: "/DESIGN/RC/KDS-41-20-2022/REBB",
  COLUMN: "/DESIGN/RC/KDS-41-20-2022/REBC",
  WALL: "/DESIGN/RC/KDS-41-20-2022/REBW",
  BRACE: "/DESIGN/RC/KDS-41-20-2022/REBR",
};

export function resolveBase(product: string, baseUrl?: string): string | undefined {
  return (baseUrl || "").trim().replace(/\/$/, "") || MIDAS_BASE[product];
}

export function setCorsPost(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function setCorsGet(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// GET a MIDAS endpoint and return its parsed body, or {} on any failure —
// used where a single missing/unsupported endpoint (e.g. no load combos
// defined yet) shouldn't fail an entire aggregated response.
export async function getJson(base: string, path: string, apiKey: string): Promise<any> {
  try {
    const r = await fetch(`${base}${path}`, { headers: { "MAPI-Key": apiKey } });
    if (!r.ok) return {};
    return (await r.json()) || {};
  } catch {
    return {};
  }
}

// Shared fetch + JSON-parse + error-unwrap for single-purpose handlers that
// need to tell a real failure apart from genuinely empty data (unlike
// getJson() above, which swallows every failure to {} for aggregated
// multi-field endpoints — see api/project-summary.ts). Supports POST with a
// JSON body (e.g. MIDAS's Argument-wrapped table/design endpoints) as well
// as plain GET. Does not catch network/abort errors — callers that need an
// AbortController still wrap this in their own try/catch.
export async function fetchMidas(
  url: string,
  apiKey: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const r = await fetch(url, {
    method: init?.method || "GET",
    headers: {
      "MAPI-Key": apiKey,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    signal: init?.signal,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON response */
  }
  if (!r.ok) {
    const msg = (data && (data.message || (data.error && data.error.message))) || `HTTP ${r.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, data };
}
