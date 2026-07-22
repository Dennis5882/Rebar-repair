import type { VercelResponse } from "@vercel/node";

// Shared by every api/*.ts handler that talks to the MIDAS Open API.
// No default export here, so Vercel doesn't turn this into its own route —
// but do NOT prefix this directory with `_`: Vercel excludes underscore-
// prefixed paths from the deployed function output entirely, which breaks
// every handler's relative import at runtime (confirmed live 2026-07-22 —
// every function failed with ERR_MODULE_NOT_FOUND for api/_lib/midas).

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
