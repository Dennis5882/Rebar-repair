import type { VercelResponse } from "@vercel/node";

// Shared by every api/*.ts handler that talks to the MIDAS Open API.
// Files under api/_lib are not turned into routes by Vercel (leading
// underscore), so this is safe to keep alongside the actual endpoints.

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
