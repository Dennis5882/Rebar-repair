# CLAUDE.md — Rebar-repair (QuickRebar NX API)

Web tool to edit MIDAS **Gen NX** rebar over the Gen NX Open API. Anyone pastes
their own MAPI key and edits their own running Gen NX model. Deployed at
**https://rebar.midasapi.space** (repo `Dennis5882/Rebar-repair`, `main`). Custom domain since
2026-10-13: Cloudflare DNS-only CNAME `rebar` → Vercel (`27bfe285ffb4ebc4.vercel-dns-017.com`,
proxy must stay OFF or Vercel cert issuance breaks); `rebar-repair.vercel.app` 308-redirects to it.

## Stack & layout

- **Frontend**: TypeScript + Vite + React 18 in `src/` (`index.html` is the Vite
  entry). 3D view via React Three Fiber. No CSS framework — one `src/style.css`.
- **Backend**: Vercel Node serverless functions in `api/*.ts` (`@vercel/node`).
  Shared server helper in `server/midas.ts` (outside `api/` so it costs no
  function slot). Each function proxies the MIDAS Open API
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
npm run build          # i18n:check + release:check + tsc (frontend) + tsc -p tsconfig.server.json (api/ + server/) + vite build
npm test               # vitest run — pure-logic unit tests in src/lib/__tests__/
npm run check:funcs    # vercel build + count .func (fails > 11) — REQUIRED for any api/ or server/ change
npm run release -- patch|minor|major [--items N]   # bump version + open empty release notes
```

## Versioning & release notes (user rule, 2026-10-13)

**Every push of a user-visible change bumps the version, and the bump always
carries its release notes — automatically, without being asked.** Before the
commit: `npm run release -- minor` (new feature) or `patch` (fix/wording/docs
the user sees); `major` only if the user says so. It bumps `package.json`
(+ lock), prepends `src/data/releases.json` (`{version,date,id,items}`, date =
today KST) and inserts EMPTY keys `guide.release.<id>.item1..N` in all four
locales. Write the notes (KO first, then EN/zh-CN/zh-TW, user-facing language,
one line per change) in the SAME commit. `release:check` (in `npm run build`,
so also on Vercel) fails unless package.json version == newest release and every
note is non-empty in every locale — never hand-edit the version. Purely internal
changes (tests, refactors, CLAUDE.md) don't need a bump. The footer shows
`v{__APP_VERSION__}` (from package.json via vite `define`); clicking it opens
the Guide drawer on the release tab (`openReleaseNotes()` window event,
`src/lib/releaseNotes.ts`). History 1.0.0–1.6.0 was numbered retroactively
from the old date-keyed entries (ids `dYYMMDD` kept).

Tests cover the pure conversion/math helpers only (no live API): `keyRange`,
`beamRebarForm`, `columnRebarForm`, `wallRebarForm`, `rcBeamCheck`, `beamBoard`
(`genVerdictFromDemand`), `memberCheck` (`memberVerdictFromRows` + the CC/WC/BRC
table parsers), `rcCodePresets` (live-verified GB bar labels), `kdsDetailing` (KDS stirrup spacing / Av,min / 1.2Mcr), `gbDetailingPingfa` (GB detailing + 平法). Add a test
alongside when you touch one of these. `apiLayout`
guards the function budget structurally (no subdirs / no helper files / ≤11
route files under `api/`).

## ⚠️ Deploy / api rules — read before touching `api/` or deploying

1. **Hobby plan caps a deployment at 12 Serverless Functions, and every
   non-underscore file under `api/` (subdirs included) compiles into its own
   `.func`.** So shared helpers live **outside** `api/` (`server/midas.ts`, moved
   there 2026-10-12 to free a slot). Never put a non-route helper back under
   `api/`. Practical ceiling is **≤11 route functions** — keep 1 slot of
   headroom, because "outside `api/` costs nothing" relies on Vercel's tracing
   behaviour, not a documented guarantee. Exceeding 12 makes the deploy fail
   *silently* at "Deploying outputs" (after a green build) and prod freezes at
   the last good deploy. Need a new endpoint? Consolidate an existing one.
   Verify with `npm run check:funcs` after **any** `api/` or `server/` change
   (re-confirms nothing outside `api/` got emitted as its own `.func`).
   Currently **8 functions** (all routes): `beam-design-result`, `beam-sections`,
   `geo-lang`, `member-sections`, `model`, `project-geometry`, `project-summary`,
   `rebar`. Several routes are **multiplexed on an `action`/type
   field** to save slots — `model` = verify | unit | analyze; `rebar` =
   list | update; `member-sections` = COLUMN | BRACE; **`beam-design-result` =
   beam (`elemKey`/`elemKeys[]`) | member check (`member` = COLUMN | WALL |
   BRACE) | report export (`report` = {member, by, mode, …} → BC/CC/BRC/WC-REPORT,
   built by pure `src/lib/reportArgs.ts`)** — the one endpoint runs every design
   check (BC/CC/WC/BRC-ANAL + `*-TABLE`) and the Gen NX report export. Report
   gotchas (live 2026-10-12): EXPORT_PATH needs forward slashes (backslashes are
   unescaped twice → files land elsewhere while SUCCESS), a missing folder also
   answers SUCCESS and writes nothing, Graphic = .jpg+.emf+~24 MB .bmp, Detail
   is .txt not DOC; files land on the Gen NX PC, not in the browser.
   Extend the switch inside one of these before adding a new file.
2. **ESM**: `package.json` is `"type": "module"` and Vercel runs each `api/*.ts`
   under native ESM with no bundling. Relative imports **must** use an explicit
   `.js` extension (`../server/midas.js`, even from a `.ts` source). Do **not**
   use an underscore-prefixed dir under `api/` for shared code (`api/_lib` is
   excluded from output → imports crash at runtime). `tsc`/`vite` do NOT catch
   either — only `vercel build` + inspecting `.vercel/output/functions/api/<name>.func/`
   does. **Modules outside `api/` — `server/*.ts` and PURE `src/lib/*.ts`
   (e.g. `../src/lib/memberCheck.js`, note the `.js`) — ride along inside each
   importer's `.func` and do NOT add a function (verified for both). Keep them
   lean: only Node built-ins / `import type` (erased) / other such lean
   modules. `server/midas.ts` is imported by EVERY route, so a runtime value
   import added there (e.g. a `src/` module that pulls in React or three) gets
   traced into all 8 bundles. Re-inspect the `.func` contents after changing
   imports in `server/` or adding a `src/lib` import to a route.**
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
  read back to confirm a write applied. **POST with the same shape CREATES a
  record** for a section that has none (live-verified 2026-10-12).
- **Bar-name label families are per MODEL FILE, not per design code
  (live-verified 2026-10-12).** Gen NX fixes a model's bar DB when the file is
  created, from *Preferences → Property → Initial Material DB*; changing the
  design code / MATD rebar code later does NOT change it (the greyed "Rebar
  Code" in Design Criteria for Rebars → Rebar…). Seen: KS → `D19`; BS/EN
  (EN04 default) → `P20` (P5–P40); **GB → lowercase `d20`** (d4–d40, no d50).
  **A bar name outside the model's DB fails as HTTP 200
  `{"error":{"message":"Wrong Field"}}`** — even an otherwise-perfect payload.
  So "Wrong Field" on REBB/REBC ⇒ suspect the bar label first. GB works through
  the same `/DESIGN/RC/KDS-41-20-2022/REB*` paths (no GB-specific path exists —
  all 404); valid GB rebar codes are `GB/T10(RC)` and `GB 50917-13(RC)`.
  Rebar writes also need a design code set (`/db/DCON` empty ⇒ every label
  rejected).
- **`*-ANAL` (design-check perform) — RE-VERIFIED 2026-07-25: no longer hangs on
  current Gen NX builds.** The old rule was "NEVER call `BC-ANAL`/`CC-ANAL`/…" —
  it reproducibly hung/crashed the app on Gen NX 2026 v2.1. On the current build
  `BC/CC/WC/BRC-ANAL` all run cleanly. **All four are now wired** behind each
  board's **"Gen NX 재검토"** button (`api/beam-design-result.ts`, `recheck` flag
  → `*-ANAL` then read `*-TABLE`). Scope via `PERFORM_TYPE`: `"ALL"` (whole board)
  or `"SECTIONS":[n]`/`"ELEMS":{KEYS}` (per-section recheck; column/brace also
  scope the `*-TABLE` read with `ELEMS` to that section's elements). Still treat
  with care: keep the short timeout + "results may have committed even on
  timeout" readback. **Despite the `KDS-41-20-2022` in the URL, `BC-TABLE` also
  serves a GB/T50010-10 model's results** (live 2026-10-12: a GUI-run GB check
  read back exactly — Mr 328.577, Vc 160.660, CHK_STR OK). **GB end-to-end live-verified
  2026-10-13** on a fresh API-built GB dummy (beam/column/brace/wall):
  BC/CC/BRC/WC-ANAL via the KDS path all "success" and DO run the GB check
  (BC-TABLE Sh_phiVc 168.168 = 0.7·ft·b·h0 exactly; ρmin 0.200%, ρmax GB);
  all four *-TABLE reads and *-REPORT exports work (reports headed
  "[ GB/T50010-10 ]", English text, include Uc=N/(fc·A) axial ratio + seismic
  level). GB gotchas: `/ope/LCOM-CONC` auto-combos work for KDS 41 20 ONLY ("Unknown Error" for
  TWN-USD112, ACI318-19, Eurocode2:04, GB/T50010-10, GB50010-02) — write `/db/LCOM-CONC` rows directly (ACTIVE
  STRENGTH/SERVICE) or generate in the GUI; `/db/STOR` POST needs the full
  WIND_*/SEIS_* field set ("Wrong Field" otherwise); wall PMCurve export is a
  JPEG written WITHOUT an extension. Models with no check results ⇒ empty ⇒ "판정 보류"
  (beam falls back to its in-browser formula).
- **Rebar write validation traps (live 2026-10-13, identical under KDS 41 20,
  TWN-USD112 and GB/T50010-10):** REBC/REBR `MAIN_BAR.ROW` = 1 ⇒ HTTP 200
  `{"error":{"message":"Unknown Error"}}` (always). When CREATING a record
  (bare section/wall), a missing ROW ⇒ "Wrong Field" and a REBW item without
  `CONCRETE_FACE_TO_CENTER_OF_REBAR {DW, DE}` ⇒ "Wrong Field"; updating an
  existing record keeps the stored values, so these only bite on first save.
  Guarded since v1.6.6: bare forms default ROW 2 / DW=DE 40 mm
  (`fillColumnForm`/`fillWallForm`), and `columnFormIssue`/`wallItemIssue`
  block the save with a readable message (`saveInvalid`).
- **`*-TABLE` `COMPONENTS` is a strict column filter** — every column the parser
  reads must be listed, or it silently never arrives. The beam request omitted
  `CHK_STR`/`Rat-*` from 2026-07-25 to 2026-10-12, so beams never showed a Gen NX
  verdict (only "예상"), on KDS models too.
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
  formula** (`rcBeamCheck.ts`, KDS 41 20:2022 + TWN-USD112 + GB/T50010-10 only,
  single-rebar approx) used as a **fallback/preview**. GB is a design-strength
  code (no phi): its branch reports phi=1 and the design resistance, and reads the
  board's fck/fy as Gen NX's GB values (grade fcu,k / fyk) mapped through the
  表4.1.4/4.2.3 tables — a GB model's preview until its Gen NX check results exist
  (C30/HRB400 Vc matched Gen NX's GB check exactly: 160.66 kN).
  It is shown when there's no Gen NX verdict
  (non-KDS, or before a recheck) and forced on a dirty (unsaved) row; the board
  badges each verdict "Gen NX" vs "예상". KDS models also get advisory **detailing warnings** (`src/lib/kdsDetailing.ts`: stirrup spacing d/2·600 halved at high Vs, Av,min, φMn ≥ 1.2Mcr, clauses from the KCSC text) — a ⚠ count on the row + a list in the drawer, never folded into OK/NG. **GB models (v1.7.0)** get the GB counterpart `src/lib/gbDetailing.ts` (non-seismic: ρmin = max(0.20%, 45ft/fy) per GB 55008-2021 表4.4.6 — GB 50010 8.5.1 defers to it since the 2024 revision; 表9.2.9 stirrup spacing; ρsv ≥ 0.24ft/fyv; min stirrup/bar Ø) in the same list UI, plus **平法 (22G101-1) notation** from `src/lib/pingfa.ts` — a 平法 table column + 集中/原位标注 in the drawer, grade letters A/B/C/D = HPB300/HRB335/HRB400/HRB500 from the board fy/fyt (plain-text convention; the stroked Φ glyphs have no Unicode). Beam only: the column/wall boards have no grade input, so their 平法 needs the grade from Gen NX MATD first. GB 50011 seismic-grade (抗震等级) rules are NOT covered. Column/wall/brace have **no** in-browser
  formula — Gen NX-only. On save, a section's stale Gen NX verdict is cleared
  (member boards) / stripped keeping Mu/Vu (beam) so it can't show as authoritative
  until re-checked.

## i18n rules

- **Keep all 4 locales at key parity.** Adding/removing a key touches every file.
  **`npm run i18n:check`** (runs first in `npm run build`, so a bad locale fails
  the build and the Vercel deploy) enforces it — modelled on the sibling `story`
  project. Errors: key parity, empty values, `{placeholder}` mismatch vs en, a
  static `t("key")` in `src/` missing from en.json, Hangul in en/zh values,
  zh-CN using a Taiwan-only term, zh-TW using a mainland term (the 34 pairs in
  `../MIDAS-GEN-NX-UI-Local/glossary/glossary.json` — skipped with a warning when
  that sibling dir is absent, e.g. on Vercel). Edit locale files line-by-line
  (they use blank-line group separators; a JSON re-serialize strips them).
- **Resolve translations at render time**, not at event time: store intent
  (`{kind, …data}`) in state and resolve via `t()` in render (see
  `src/lib/statusMsg.ts`), so a language switch re-translates existing messages.
- **Missing key falls back to the raw key string** (shown to the user) — so an
  incomplete locale is visible, not silent.
- **Structural terminology**: match MIDAS Gen NX's own terms, not literal
  translations. Two glossaries decide it — **zh-CN**:
  `docs/Structural_Engineer_zh-CN_Glossary_3000.json` (in-repo; Gen NX CN UI
  resources + GB codes, each term carries `genNxOccurrences` — use it as the
  oracle, a zero-occurrence term is a wrong term); **zh-TW / KO / EN**: the
  sibling `MIDAS-GEN-NX-UI-Local/glossary/` (this machine), whose
  `mainland_to_taiwan` table is authoritative for CN↔TW splits. All three
  passes are done (KO 2026-07-24, zh-CN/zh-TW 2026-07-27). **CN and TW are
  opposite for several core terms** — Section 截面(CN)/斷面(TW), Load
  荷载(CN)/載重(TW), Check 验算(CN)/檢核(TW) — never copy a term across the two
  files. Also: Brace = 支撑/支撐 (not 斜撑), 加载 means *applying load* so UI
  "load data" is 载入, Element = 单元/單元 vs Member = 构件/構件.
- Footer byline: `기획자: Gavi · 개발자: Dennis` + `v{__APP_VERSION__} · 최신업데이트: {__BUILD_DATE__}`
  (build-time constant — do not hardcode the date).

## Reference (sibling dirs on this machine)

- `MIDAS-API` — official Open API manual.
- `MIDAS-API-NX-SDK` — live-verified Python SDK; `docs/live_verification_notes.md`
  is the source of truth for endpoint quirks / the `*-ANAL` crash bug.
- `MIDAS-GEN-NX-UI-Local` — MIDAS UI localization project = structural term glossary.
