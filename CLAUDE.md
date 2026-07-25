# CLAUDE.md — Rebar-repair (QuickRebar NX API)

Web tool to edit MIDAS **Gen NX** rebar over the Gen NX Open API. Anyone pastes
their own MAPI key and edits their own running Gen NX model. Deployed at
**https://rebar-repair.vercel.app** (repo `Dennis5882/Rebar-repair`, `main`).

## Stack & layout

- **Frontend**: TypeScript + Vite + React 18 in `src/` (`index.html` is the Vite
  entry). 3D view via React Three Fiber. No CSS framework — one `src/style.css`.
- **Backend**: Vercel Node serverless functions in `api/*.ts` (`@vercel/node`).
  Shared helpers in `api/lib/*.ts`. Each function proxies the MIDAS Open API
  (`https://moa-engineers.midasit.com:443/gen`, `MAPI-Key` header).
- **i18n**: `public/locales/{en,ko,zh-CN,zh-TW}.json`, flat key→string. Loaded
  lazily at runtime by `src/i18n/`.
- **State**: React context — `ConnContext` (MAPI key/product/lengthUnit),
  `DesignCodeContext` (design code + rebar material DB).
- **Tabs are all section-centric "boards"** (row = section, summary strip,
  search/sort, detail editor drawer), and **all four member types now show a live
  Gen NX OK/NG verdict** (재검토 button → `*-ANAL` then read `*-TABLE`):
  `BeamBoard.tsx` (Gen NX verdict + in-browser formula fallback),
  `ColumnLikeBoard.tsx` (COLUMN + BRACE, `isColumn` flag now only toggles the
  corner-bar/hook structural controls; both get Gen NX verdicts, `runCheck` picks
  CC vs BRC by `type`), `WallBoard.tsx` (row = Wall ID, edits one segment at a
  time, Gen NX verdict per WID), and `ProjectReview.tsx` (read-only). Form<->
  payload conversion is pure in `src/lib/*RebarForm.ts`; beam capacity/formula in
  `rcBeamCheck.ts`/`beamBoard.ts`; the shared column/wall/brace verdict reducer +
  CC/WC/BRC-TABLE parsers are pure in `src/lib/memberCheck.ts` (with a shared
  `useMemberVerdict` hook + `MemberVerdictCell`).
- **Analytics**: `@vercel/analytics` `<Analytics/>` from the **`/react`** entry
  (this is a Vite SPA, not Next — `/next` fails at runtime). Needs Web Analytics
  enabled in the Vercel dashboard to collect.

## Commands

```bash
npm run dev            # vite dev server
npm run build          # tsc --noEmit && vite build  (frontend only)
npm test               # vitest run — pure-logic unit tests in src/lib/__tests__/
npx vercel build       # REQUIRED for any api/ change — see below
```

Tests cover the pure conversion/math helpers only (no live API): `keyRange`,
`beamRebarForm`, `columnRebarForm`, `wallRebarForm`, `rcBeamCheck`, `beamBoard`
(`genVerdictFromDemand`), `memberCheck` (`memberVerdictFromRows` + the CC/WC/BRC
table parsers). Add a test alongside when you touch one of these.

## ⚠️ Deploy / api rules — read before touching `api/` or deploying

1. **Hobby plan caps a deployment at 12 Serverless Functions, and every
   non-underscore file under `api/` (including `api/lib/*.ts`) compiles into its
   own `.func`.** `api/lib/midas.ts` already costs 1, so the practical ceiling is
   **≤11 route functions**. Exceeding 12 makes the deploy fail *silently* at
   "Deploying outputs" (after a green build) and prod freezes at the last good
   deploy. Need a new endpoint? Consolidate an existing one. Verify:
   `npx vercel build && find .vercel/output/functions -name "*.func" | wc -l`.
   Currently **9 functions**: routes `beam-design-result`, `beam-sections`,
   `geo-lang`, `member-sections`, `model`, `project-geometry`, `project-summary`,
   `rebar` + `lib/midas`. Several routes are **multiplexed on an `action`/type
   field** to save slots — `model` = verify | unit | analyze; `rebar` =
   list | update; `member-sections` = COLUMN | BRACE; **`beam-design-result` =
   beam (`elemKey`/`elemKeys[]`) | member check (`member` = COLUMN | WALL |
   BRACE)** — the one endpoint runs every design check (BC/CC/WC/BRC-ANAL +
   `*-TABLE`). Extend the switch inside one of these before adding a new file.
2. **ESM**: `package.json` is `"type": "module"` and Vercel runs each `api/*.ts`
   under native ESM with no bundling. Relative imports **must** use an explicit
   `.js` extension (`./lib/midas.js`, even from a `.ts` source). Do **not**
   underscore-prefix the lib dir (`api/_lib` is excluded from output → imports
   crash at runtime). `tsc`/`vite` do NOT catch either — only `vercel build`
   + inspecting `.vercel/output/functions/api/<name>.func/` does. **An `api/*.ts`
   may import a PURE module from `src/lib/` (e.g. `../src/lib/memberCheck.js`,
   note the `.js`) — verified it rides along inside the importer's `.func` and
   does NOT add a function; the shared module must be dependency-free (only
   `import type` from elsewhere, which erases) or its transitive value imports
   get traced in too. Re-inspect the `.func` after adding such an import.**
3. **A 200 from the MIDAS API does not mean success.** Several endpoints return
   HTTP 200 with an `{error:{message}}` body. Check for it explicitly.
4. **Deploy**: plain `git push` auto-deploys via the GitHub↔Vercel integration —
   *if the deploy stays within limits*. If prod looks stale after a push, run
   `npx vercel --prod` to surface the real failure reason (the CLI is authed as
   the user). Don't run manual deploys as routine.

## MIDAS Gen NX domain rules (hard-won, live-verified)

- **REBB/REBC/REBR are keyed by SECTION number, not element id.** Save once with
  the section id; Gen NX applies it to every element using that section. **REBW
  (walls) is keyed by Wall ID** and holds multiple segments (`ITEMS[]`).
- **BEAM REBB write shape == read shape** — send the canonical `BeamPayload`
  (`MAIN_BAR_TOP:{LAYER1:{NAME,NUM}}` + item-level `DT`/`DB`) via **PUT**. The
  manual's `vMAIN_BAR_*` "legacy" shape is silently dropped (200 no-op). Always
  read back to confirm a write applied.
- **`*-ANAL` (design-check perform) — RE-VERIFIED 2026-07-25: no longer hangs on
  current Gen NX builds.** The old rule was "NEVER call `BC-ANAL`/`CC-ANAL`/…" —
  it reproducibly hung/crashed the app on Gen NX 2026 v2.1. On the current build
  `BC/CC/WC/BRC-ANAL` all run cleanly. **All four are now wired** behind each
  board's **"Gen NX 재검토"** button (`api/beam-design-result.ts`, `recheck` flag
  → `*-ANAL` then read `*-TABLE`). Scope via `PERFORM_TYPE`: `"ALL"` (whole board)
  or `"SECTIONS":[n]`/`"ELEMS":{KEYS}` (per-section recheck; column/brace also
  scope the `*-TABLE` read with `ELEMS` to that section's elements). Still treat
  with care: design-code-scoped to **KDS-41-20-2022** only (non-KDS ⇒ empty ⇒
  "판정 보류", except beam which falls back to its in-browser formula), keep the
  short timeout + "results may have committed even on timeout" readback.
  `/doc/ANAL` (plain FE analysis, `api/model.ts` action `analyze`) is the "해석
  실행" step — required after a rebar save before a recheck (`*-ANAL` returns 200
  `{error:"…Please perform analysis."}` until then). Reading `*-TABLE` without any
  perform is the zero-risk path (shows what the user computed in Gen NX's GUI).
- **`*-TABLE` verdict-string semantics (live-verified — easy to get wrong).**
  `CHK_STR` reads **"OK…"** on pass ("OK", "OK-", "OK-#") and a **governing-mode
  code on FAIL** ("PM-", "V-", …) — **NOT literal "NG"**. So the verdict rule is
  **OK-prefix ⇒ pass, any other meaningful value ⇒ NG** (ignoring `""`/`"-"`/
  `"----"`/`"N/A"` placeholders); "only explicit NG fails" silently misses
  mode-code failures. `CHK_RBR` is a real OK/NG only for **beam & wall**; for
  **column & brace it's a position code** ("M"/"MV") → the column/brace parsers
  drop it. Ratio column naming differs by member: **beam** `Rat-N`/`Rat-P`/`Rat-V`
  (hyphen), **column** `Rat_P`/`Rat_M`/`Rat_V_end`/`Rat_V_mid` (underscore),
  **wall & brace** `Rat-Py`/`Rat-My`/`Rat-V` & `Rat-P`/`Rat-M`/`Rat-V` (hyphen).
  Column/brace keyed by MEMB+SECT (group by SECT); wall by WID+Story (group by
  WID); the board shows the worst case across a section's elements / a wall's
  stories.
- **Beam vs column is orientation-based**, not element `TYPE` (all frame elements
  are `TYPE:"BEAM"`). Vertical (`dz>dxy`) ⇒ column. Walls are often `TYPE:"PLATE"`.
  `api/member-sections.ts` uses this: **COLUMN** lists sections used by a vertical
  element (bare columns included); its element list must be filtered to vertical
  elements only, or beams sharing a section leak into the count. **BRACE** is
  diagonal → not orientation-classifiable, so it lists only sections that already
  carry a **REBR** record (no bare brace sections). **WALL** doesn't fit the
  SECT-grouped model at all — `WallBoard` reads **REBW** via `rebar` (`list`),
  keyed by Wall ID, each a multi-segment `ITEMS[]`; edit one segment, preserve
  the rest on save.
- **Units**: **every board works in mm end-to-end.** REBB/REBC/REBR/REBW store
  lengths (cover, spacing, thickness…) in the model's active unit; each board
  converts them model-unit↔mm at the load/save boundary via `src/lib/units.ts`
  (`lenToMm`/`lenToModel` for form strings, `numToMm`/`numToModel` for payload
  numbers used by the "before" diagram). Convert **lengths only** — counts, legs,
  ids, story labels pass through. `app.footerHint` states the mm convention; keep
  it honest if this changes.
- **OK/NG now comes from Gen NX's own design check** (`*-ANAL`+`*-TABLE`) for all
  four members — the authoritative verdict. **Beam additionally has an in-browser
  formula** (`rcBeamCheck.ts`, KDS 41 20:2022 + TWN-USD112 only, single-rebar
  approx) used as a **fallback/preview**: shown when there's no Gen NX verdict
  (non-KDS, or before a recheck) and forced on a dirty (unsaved) row; the board
  badges each verdict "Gen NX" vs "예상". Column/wall/brace have **no** in-browser
  formula — Gen NX-only. On save, a section's stale Gen NX verdict is cleared
  (member boards) / stripped keeping Mu/Vu (beam) so it can't show as authoritative
  until re-checked.

## i18n rules

- **Keep all 4 locales at key parity.** Adding/removing a key touches every file.
  Check: `node -e '…'` diff of `Object.keys` across the four JSONs.
- **Resolve translations at render time**, not at event time: store intent
  (`{kind, …data}`) in state and resolve via `t()` in render (see
  `src/lib/statusMsg.ts`), so a language switch re-translates existing messages.
- **Missing key falls back to the raw key string** (shown to the user) — so an
  incomplete locale is visible, not silent.
- **Structural terminology**: match MIDAS Gen NX's own terms, not literal
  translations. Authoritative KO/EN/zh-TW source is the sibling
  `MIDAS-GEN-NX-UI-Local/glossary/` (this machine). KO terms are already mostly
  correct; zh polish still pending.
- Footer byline: `기획자: Gavi · 개발자: Dennis · 최신업데이트: {__BUILD_DATE__}`
  (build-time constant — do not hardcode the date).

## Reference (sibling dirs on this machine)

- `MIDAS-API` — official Open API manual.
- `MIDAS-API-NX-SDK` — live-verified Python SDK; `docs/live_verification_notes.md`
  is the source of truth for endpoint quirks / the `*-ANAL` crash bug.
- `MIDAS-GEN-NX-UI-Local` — MIDAS UI localization project = structural term glossary.
