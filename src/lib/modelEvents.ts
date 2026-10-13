// Fired after a rebar save or an analysis run, so read-only views computed from
// the model (e.g. the storey-strength table) can mark what they show as stale.
export const MODEL_CHANGED = "quickrebar:model-changed";
export function notifyModelChanged(): void {
  window.dispatchEvent(new Event(MODEL_CHANGED));
}
