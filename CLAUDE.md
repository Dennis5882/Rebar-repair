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

## Commands

```bash
npm run dev            # vite dev server
npm run build          # tsc --noEmit && vite build  (frontend only)
npx vercel build       # REQUIRED for any api/ change — see below
```

## ⚠️ Deploy / api rules — read before touching `api/` or deploying

1. **Hobby plan caps a deployment at 12 Serverless Functions, and every
   non-underscore file under `api/` (including `api/lib/*.ts`) compiles into its
   own `.func`.** `api/lib/midas.ts` already costs 1, so the practical ceiling is
   **≤11 route functions**. Exceeding 12 makes the deploy fail *silently* at
   "Deploying outputs" (after a green build) and prod freezes at the last good
   deploy. Need a new endpoint? Consolidate an existing one. Verify:
   `npx vercel build && find .vercel/output/functions -name "*.func" | wc -l`.
2. **ESM**: `package.json` is `"type": "module"` and Vercel runs each `api/*.ts`
   under native ESM with no bundling. Relative imports **must** use an explicit
   `.js` extension (`./lib/midas.js`, even from a `.ts` source). Do **not**
   underscore-prefix the lib dir (`api/_lib` is excluded from output → imports
   crash at runtime). `tsc`/`vite` do NOT catch either — only `vercel build`
   + inspecting `.vercel/output/functions/api/<name>.func/` does.
3. **A 200 from the MIDAS API does not mean success.** Several endpoints return
   HTTP 200 with an `{error:{message}}` body. Check for it explicitly.
4. **Deploy**: plain `git push` auto-deploys via the GitHub↔Vercel integration —
   *if the deploy stays within limits*. If prod looks stale after a push, run
   `npx vercel --prod` to surface the real failure reason (the CLI is authed as
   the user). Don't run manual deploys as routine.

## MIDAS Gen NX domain rules (hard-won, live-verified)

- **REBB/REBC/REBR are keyed by SECTION number, not element id.** Save once with
  the section id; Gen NX applies it to every element using that section.
- **BEAM REBB write shape == read shape** — send the canonical `BeamPayload`
  (`MAIN_BAR_TOP:{LAYER1:{NAME,NUM}}` + item-level `DT`/`DB`) via **PUT**. The
  manual's `vMAIN_BAR_*` "legacy" shape is silently dropped (200 no-op). Always
  read back to confirm a write applied.
- **NEVER call the design-check "perform" family (`BC-ANAL`/`CC-ANAL`/`WD-ANAL`/
  any `*-ANAL` in `design/rc_kds`).** It reproducibly hangs/crashes the Gen NX
  desktop app. Only read already-computed results (`BC-TABLE`, in
  `api/beam-design-result.ts`). `/doc/ANAL` (plain FE analysis,
  `api/run-analysis.ts`) is the *safe* "해석 실행" — it can be slow (90s+), so a
  timeout means "still solving", not failure.
- **Beam vs column is orientation-based**, not element `TYPE` (all frame elements
  are `TYPE:"BEAM"`). Vertical (`dz>dxy`) ⇒ column. Walls are often `TYPE:"PLATE"`.
- **Units**: the **beam board works in mm end-to-end** (cover `DT/DB` and stirrup
  `DIST` are converted model-unit↔mm at the load/save boundary in
  `BeamBoard.tsx`; `beamBoard.ts` is unit-agnostic). The **column/wall/brace tabs
  still display the model's active length unit.** Keep `app.footerHint` honest if
  this changes.
- OK/NG is computed **in-browser** (`rcBeamCheck.ts`, KDS 41 20:2022 + TWN-USD112
  only). Only demand (Mu/Vu) comes from Gen NX. Design-code check is never needed.

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
