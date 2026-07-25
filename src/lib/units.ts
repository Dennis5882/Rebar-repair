import { MM_PER_UNIT } from "../data/rcCodePresets";

// Length-unit conversion at the board load/save boundary. REBB/REBC/REBR/REBW
// store length values (cover, spacing, thickness, etc.) in the model's active
// length unit; every board works in mm end-to-end (so the user always sees and
// types mm, matching rebar convention and the section diagrams). These convert
// a length string model-unit <-> mm at that boundary. Counts/legs/ids are NOT
// lengths and must not be passed through here.

export function mmPerUnit(unit: string): number {
  return MM_PER_UNIT[unit] ?? 1;
}

// model-unit string -> mm string (blank stays blank; float noise trimmed to 2dp)
export function lenToMm(s: string, unit: string): string {
  if (s.trim() === "") return "";
  const v = Number(s);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * mmPerUnit(unit) * 100) / 100);
}

// mm string -> model-unit string, for writing a length back to the API
export function lenToModel(s: string, unit: string): string {
  if (s.trim() === "") return "";
  const v = Number(s);
  if (!Number.isFinite(v)) return "";
  return String(v / mmPerUnit(unit));
}

// model-unit number -> mm number (for converting a loaded payload's length so
// the "before" section diagram matches the mm-based "after"). Passes through
// undefined/non-finite unchanged.
export function numToMm(v: number | undefined, unit: string): number | undefined {
  if (v == null || !Number.isFinite(v)) return v;
  return v * mmPerUnit(unit);
}

// mm number -> model-unit number, for writing a numeric length back to the API.
export function numToModel(v: number | undefined, unit: string): number | undefined {
  if (v == null || !Number.isFinite(v)) return v;
  return v / mmPerUnit(unit);
}
