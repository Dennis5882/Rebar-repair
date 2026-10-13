import releases from "../data/releases.json";

// Release history, newest first. releases.json is the single list: each entry's
// notes are the locale keys guide.release.<id>.item1..item<items>. New entries
// are added only by `npm run release` (scripts/release.mjs), and
// scripts/release-check.mjs (run in `npm run build`) fails the build unless the
// top entry's version equals package.json's and every note is written in all
// four locales — so a version bump can never ship without its release notes.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  id: string; // locale key segment
  items: number;
}
export const RELEASES: Release[] = releases;

// The footer version opens the Guide drawer straight on its release tab. The
// drawer owns its open state, so this is a window event rather than lifted state.
export const OPEN_RELEASE_NOTES = "quickrebar:open-release-notes";
export function openReleaseNotes(): void {
  window.dispatchEvent(new Event(OPEN_RELEASE_NOTES));
}
