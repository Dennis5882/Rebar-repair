// Must match the MIDAS_BASE fallback in api/verify.ts, api/rebar-list.ts, api/rebar-update.ts.
export const DEFAULT_BASE_URL: Record<string, string> = {
  gen: "https://moa-engineers.midasit.com:443/gen",
  civil: "https://moa-engineers.midasit.com:443/civil",
};
