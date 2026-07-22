// Must match MIDAS_BASE in api/lib/midas.ts (the single source of truth for
// every api/*.ts handler's product-URL fallback).
export const DEFAULT_BASE_URL: Record<string, string> = {
  gen: "https://moa-engineers.midasit.com:443/gen",
  civil: "https://moa-engineers.midasit.com:443/civil",
};
