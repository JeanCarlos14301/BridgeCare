# Redesign progress

State file for `superprompt-evolus-redesign.md`. Scope of this session: frontend (`apps/web/`) only,
as requested by the user. Backend slices of WP3-WP6 belong to Daniel, Felipe, and Jean and are not
started here. Nothing is pushed; the user approves every push.

## WP1 - Design system and component split

Branch: `feat/wp1-design-system`. Iteration 1.

- [x] `src/styles/tokens.css`: Annex A tokens, dark default, light theme under
      `[data-theme="light"]`, print forces light with black text and no backgrounds.
- [x] Fonts: `geist@1.7.2` (latest, OFL) was tried and reverted: it declares `next >=13.2.0` as a
      peer dependency and npm 10 installs Next.js 16.4.0 with it (about 900 lockfile lines). That
      breaks the "no other dependency" rule, so the system stack is used, as the brief allows.
- [x] `App.tsx` split into `src/components/` (`AppShell`, `FixturePicker`, `CaseHeader`, `GatePanel`,
      `FieldsPanel`, `SourcePanel`, `ReviewBar`, `PatientSheet`, `LoginDialog`, `ProviderPill`,
      `EvidenceBadge`); `api()` and types in `src/api.ts`. No new libraries.
- [x] Evidence badges use glyph + word + colour; lime is brand only.
- [x] B-12.1 MOCK pill from `/health`, visible before any case. B-12.6 case view cleared on logout.
- [x] B-12.2 patient sheet now shows follow-up, warning signs, activity, diet, and the notice.
- [x] Fixed a first-visit race: `/fixtures` was requested in parallel with `POST /session` and
      returned 401 before the session cookie existed.
- [x] Accessibility: AA contrast computed for every new text/background pair (all pass; `#737373`
      is used only for the non-text "missing" glyph and border, 3.78:1), `:focus-visible` ring,
      skip link, labelled inputs, `role="status"` live region, `prefers-reduced-motion`.

Gate results (iteration 1):

| Command | Exit |
| --- | --- |
| `npm --prefix ./apps/web run lint` | 0 |
| `npm --prefix ./apps/web run typecheck` | 0 |
| `npm --prefix ./apps/web test -- --run` | 0 (3/3) |
| `npm --prefix ./apps/web run build` | 0 |
| `awk 'length > 120'` over `apps/web/src` | no output |

Browser checks (headless Edge 155 driven over CDP, mock provider):

- 1440 px, fx04: two columns, `scrollWidth == clientWidth`, no console errors.
- 375 px, fx04: panes stacked, `scrollWidth 375 == clientWidth 375`, no horizontal scroll.
- Light theme toggle renders; preference kept in `localStorage` with try/catch.
- CSP: Docker Desktop was not running, so `docker compose up --build` was not run. Instead the
  production build (`dist/`) was served by a local Node server that sends the exact
  `Content-Security-Policy` header from `infra/nginx.conf` and proxies `/api`. Result: zero CSP
  violations in the console. Repeated through nginx afterwards; see "Release gate" below.

Open: no reference screenshots of evolus.ai (no built-in browser in this session); notes in
`docs/plans/design-notes.md` come from a text fetch plus Annex A.

## WP2 - Citation Inspector

Branch: `feat/wp2-citation-inspector` (on top of WP1, which it depends on). Iteration 1.

- [x] Two columns at >= 1024 px (source sticky with its own scroll); tabs "Fields / Source" below,
      with arrow-key navigation. Selecting a citation on a small screen opens the Source tab, and
      "Back to field" returns focus to the chip.
- [x] Every chip and every field card selects a citation; the field name is a real button so the
      card action is keyboard-reachable without nesting buttons.
- [x] Highlight: one `<mark>` coloured by evidence state (green supported, amber
      ambiguous/conflicting), 600 ms `box-shadow` glow, no animation under reduced motion,
      `scrollIntoView` (`auto` under reduced motion, `smooth` otherwise), focus moved to the mark,
      `aria-live="polite"` text "Showing quote on page N".
- [x] `src/lib/normalize.ts` mirrors `normalize()` from `validation.py`, using the exact whitespace
      set of Python's `str.isspace()` (listed from the project's Python runtime), and maps normalized
      offsets back to the original text (B-12.4). Matching is case-sensitive, like the backend.
- [x] Several citations: chips `p. 1`, `p. 2`; `[` and `]` cycle them (ignored while typing).
- [x] Unlocatable quote: "Quote not located in this view." and no highlight.
- [x] Text rendered only as React children.

Gate results (iteration 1):

| Command | Exit |
| --- | --- |
| `npm --prefix ./apps/web run lint` | 0 |
| `npm --prefix ./apps/web run typecheck` | 0 |
| `npm --prefix ./apps/web test -- --run` | 0 (12/12) |
| `npm --prefix ./apps/web run build` | 0 |
| `awk 'length > 120'` over `apps/web/src` | no output |
| `grep -rn dangerouslySetInnerHTML apps/web/src` | no output |

Test strength: two temporary mutations were caught and reverted. Using JavaScript's `\s` instead of
the Python whitespace set fails 1 test; skipping normalization in `locateQuote` fails 4 tests.

Browser check (headless Edge, mock, fx04 contradictory): chip `p. 1` highlights exactly one mark on
page 1 ("Take Lisinopril 10 mg by mouth once a day for 14 days."), chip `p. 2` exactly one mark on
page 2 ("Continue Lisinopril 20 mg ..."); both amber, both focused, status "Showing quote on page N
(k of 2)". At 375 px the Source tab opens, no horizontal scroll.

### WP2 iteration 2 - independent review

A reviewer subagent read `git diff main...HEAD -- apps/web` (read-only). Its security checks passed
(text nodes only, no CDN/inline script, client never sets approval, `revision_id + content_hash`
sent). All 9 findings were accepted and fixed:

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Logout cleared the UI even when the server call failed | Role drops to visitor only after the server revokes the session; the case is cleared anyway; failure is reported |
| 2 | A response in flight could bring the case back after logout | Session epoch; late responses are dropped |
| 3 | `[` / `]` blocked for AltGr layouts (Spanish, German, French) | Ctrl+Alt is treated as AltGr; plain Ctrl or Alt chords are ignored |
| 4 | Focus jump to the mark lost the keyboard user's place on desktop | "Back to field" shown at every width; Escape on the mark returns focus to the chip |
| 5 | `scrollIntoView` also scrolled the page | Only the pane's scroll box is scrolled; the pane is revealed with `block: "nearest"` |
| 6 | Shortcut acted in a hidden pane and while a dialog was open | Cycling opens the Source tab; ignored while any `dialog[open]` exists |
| 7 | Incomplete tab pattern | Tabs exist only below 1024 px, with `tabpanel`, `aria-labelledby`, `hidden`, Home/End |
| 8 | MOCK badge depended only on `/health` | Falls back to `revision.provider_mode` |
| 9 | Highlight relied on colour for evidence state | Status line names the state; wavy underline for conflicting, dotted for ambiguous |

Also fixed: after logout the backend revokes the cookie, so the next fixture request returned 401;
the UI now starts a fresh visitor session. Decision controls are hidden once the case is no longer
`needs_review` (the backend only accepts decisions in that state).

Gates (iteration 2): lint 0, typecheck 0, tests 0 (17/17), build 0, no line > 120, no
`dangerouslySetInnerHTML`. Mutations caught: removing the epoch check fails 1 test; swallowing the
logout failure fails 1 test. Browser (production build with the nginx CSP header): no CSP errors;
at 1440 px clicking the last warning-sign chip leaves `scrollY` and the chip position unchanged while
the mark is visible and focused; at 375 px tabs and `tabpanel` roles work and Escape returns focus to
the chip.

## Release gate (7.3) on `feat/wp2-citation-inspector`

Run on 2026-10-12 with Docker 29.8.1, mock provider, a throwaway reviewer password passed only as
an environment variable.

| Check | Result |
| --- | --- |
| Web gates (7.1) | lint 0, typecheck 0, tests 0 (17/17), build 0 |
| `ruff check apps/api scripts` | 0 |
| `mypy apps/api/app` | 0 (30 files) |
| `pytest apps/api/tests` | 0 (72 passed) |
| `export_contract.py --check` | 0 (contract current) |
| `eval/check_fixtures.py` | 0 (6 fixtures) |
| `docker compose up --build -d` | api healthy, web started |
| `scripts/smoke.py` | 0 (`health=ok ready=ready`, `provider_mode=mock`) |
| nginx headers on `/` | CSP, HSTS, nosniff, `Referrer-Policy: no-referrer` present |

Annex D walkthrough through nginx (`http://localhost:5173`, headless Edge, 1440 px): MOCK pill
visible; fx04 gate "Resolution note required (1 reason)"; chip `p. 1` and `p. 2` each highlight
exactly one quote on the right page; reviewer login, note, approve gives "Approved"; patient sheet
shows Medications, Follow-up, Warning signs; fx05 stays "Needs review" with the injected sentence
shown as plain text; fx06 shows "Failed" with `provider_error`; logout clears the case. At 375 px a
chip opens the Source tab with one highlight.

Console: no CSP violations from the app. One run showed two blocked loads from
`me.kis.v2.scr.kaspersky-labs.com` (a script and a stylesheet injected by the antivirus on the
test machine); the CSP blocked them as intended. The served files contain no reference to them;
the only absolute URLs in the bundle are React's `w3.org` namespace and `react.dev` error links,
which are never fetched.

## UI polish (user request after the first local run)

Branch: `feat/ui-polish` (on top of `feat/wp2-citation-inspector`). The user found the first
redesign too plain and asked for richer motion and information design inside the frontend.

- Safety pipeline (Source, Extract, Verify, Gate, Review, Patient sheet) driven only by the case
  response; before a case it explains the flow.
- Scenario cards with icon, description, and scenario tag; compact rows on phones.
- Case overview: medications, quotes found `verified/total` (from `citation_not_found` reasons on
  `...citations[i]` paths), conflicting or ambiguous fields, server-measured processing time, and an
  evidence distribution bar with a labelled legend. No figure is shown that is not in the response.
- Citation map: every located quote is underlined in the source (style differs per evidence state);
  clicking one selects it and reveals its field. Page jump buttons in the window bar.
- Gate as a checklist of automated checks with "Go to field" links per blocking reason.
- Medication cards with value cells (missing values dashed) and uncertainty notes inside the field.
- Reviewer steps, note counter, animated decision mark, approved content hash; patient sheet shows
  locked or unlocked state and a print layout with labelled medication rows on phones.
- Toasts for status messages (errors stay until dismissed), processing skeleton, background glow.
- Inline SVG icons drawn for the project; no dependency added. CSS split into `base`, `shell`, `case`,
  `inspector`, `panels`, `sheet`, `motion`. Every animation respects `prefers-reduced-motion`.

Gates: lint 0, typecheck 0, tests 0 (27/27 in 6 files), build 0, no line > 120, no
`dangerouslySetInnerHTML`. New tests cover case statistics, segment building, selecting from the
citation map, and gate "Go to field". Browser (production build with the nginx CSP header, headless
Edge): reviewer flow works end to end, no console errors, 375 px without horizontal scroll, light
theme checked.

## Desktop clinical redesign (user feedback on the polish pass)

Same branch `feat/ui-polish`. The user found the colours poor and the layout too much like a web
page; the app is a desktop work tool. Choices confirmed by the user: light clinical palette, desktop
app layout.

- Palette: neutral greys and white panels, one restrained green (`#2f7d32`) for primary actions and
  the wordmark, soft status colours; a sober slate dark theme is optional. Selection uses the
  neutral ink colour so it is never read as "supported". No neon, glows, or grid backdrop. 35
  text/background pairs checked (light and dark), all AA.
- Layout: fixed sidebar (document list, provider pill, session, theme), toolbar with case title,
  status and revision, a compact pipeline strip, and a full-height workspace. Three columns with
  their own scroll at >= 1440 px (source, fields, review rail with overview, gate, decision, patient
  sheet); two columns from 1024 px with fields and review stacked; three tabs below 1024 px.
- Empty screen explains the safety pipeline instead of a marketing hero.
- The patient sheet opens in a large dialog with Print; print CSS prints only the sheet.
- Medication values use a container query (five cells when the column is wide, three otherwise).

Gates: lint 0, typecheck 0, tests 0 (27/27 in 6 files), build 0, no line > 120, no
`dangerouslySetInnerHTML`, no absolute URLs in source. Browser (production build with the nginx CSP
header): reviewer flow end to end at 1920x1080 and 1440x900 with no console errors; 1100, 1280 and
1366 px checked for overlap (none) and horizontal scroll (none); dark theme checked.

## Organised review view, print fix, and B-11 / Spanish sheet integration

Branch: `feat/ui-organize` from `main` at `70bbdd6` (after PRs #11, #12, #13).

- Fields pane opens on "Needs attention" (fields not plainly supported, plus any field a gate
  reason names) with a toggle to "All fields" and a per-state count line. Selecting a hidden
  field from the citation map or a gate reason switches to "All fields".
- Review rail reduced from five blocks to two: one review card (gate summary, reasons with
  "Go to field", automated checks collapsed with a pass count, decision form) and the patient
  sheet card. The overview tiles were removed; their figures already appear in the pipeline
  strip, the field filter, and the toolbar (processing time, review time).
- B-11: the server only starts the review timer when a reviewer reads `GET /cases/{id}`, which
  the UI never called. It now reads the case after processing as a reviewer and after logging in
  with a case open (a failed read keeps the processed case on screen). The decision shows the
  server-measured review time or "Not measured for this revision".
- Spanish sheet: English / Español toggle on the approved sheet (`?lang=`); reviewers get
  "Preview before approval" (`/preview?lang=`) with a warning banner and no print option; a
  preview is also excluded by the print CSS. Fixed sheet labels come from a static dictionary;
  every value comes from the API. The Spanish labels need a check by a Spanish reader.
- 429 on processing shows the server's quota message.
- Print bug: the sheet printed 4 pages for one page of content because the hidden app kept its
  layout height. The dialog is now rendered into `<body>` and, while it is open, every other child
  of `<body>` is `display: none` in print. Measured with `Page.printToPDF` in headless Edge:
  before 4 pages, after 1 page (English and Spanish); a print-media screenshot shows the sheet.

Gates: lint 0, typecheck 0, tests 0 (37/37 in 8 files), build 0, no line > 120, no
`dangerouslySetInnerHTML`, no absolute URLs in source. Browser (production build with the nginx CSP
header, mock): reviewer flow with "Needs attention" showing 3 of 7 fields on fx04, Spanish preview
without print, approval showing a server-measured review time, no console errors.

Observation for the API owner: untranslated phrases in the Spanish view are returned in English
with an "[en]" marker (for example "Fainting [en]").

## Faster document switching

Same branch `feat/ui-organize`, rebased onto `main` at `b2d7b50` (PRs #14 and #15: AMD evidence
pill, eval timing, prompt v3). Conflicts in `App.tsx` and `ReviewBar.tsx` were resolved by keeping
both sides: the `X-Request-ID` capture and inference host for the AMD pill, plus the review-timer
read and 429 handling; the review time added in `ReviewBar` is shown in the decision facts.

The user reported close to a minute of waiting when moving between documents. With the live AMD
provider, the API log showed `POST /cases/{id}/process` taking 14.1 s, 22.7 s, and 27.9 s (n = 3),
and every click on a document created and processed a new case, even when that document had
already been processed in the session.

- The UI lists this session's cases (`GET /cases`) on load and after login (login carries cases
  over) and keeps the newest reusable case per document (`needs_review`, `approved`, `rejected`).
  Opening such a document reads the case (`GET /cases/{id}`) instead of calling the model. Failed
  cases are not reused. Logout clears the list.
- "Run again" in the toolbar processes the open document on purpose; its tooltip says each run uses
  the shared model quota.
- While the model runs, the toolbar and the sidebar show the elapsed seconds; processed documents
  carry a check mark in the sidebar. The toolbar shows the scenario description of the open case.
- Measured in headless Edge with the mock provider: reopening an already processed document took
  42 ms. Two new tests fail if the sidebar goes back to processing on every click.

Gates: lint 0, typecheck 0, tests 0 (40/40 in 9 files), build 0, no line > 120.

## Review layout: two-column top row, full-width review row

Branch: `feat/review-layout` from `main` at `3b1afff` (after #16 and #17). Layout and presentation
only; selection, citations, gate links, shortcuts, API calls, and buttons are unchanged.

- Desktop (>= 1024 px), CSS Grid on `.inspector`: top row `source` (3fr, about 60%) and `fields`
  (2fr, about 40%), each with its own scroll; a full-width `review` row below with the gate,
  decision, and patient sheet as separate cards (`repeat(auto-fit, minmax(min(100%, 19rem), 1fr))`:
  three side by side from 1280 px, two from 1024 px). The workspace scrolls to reach the review row.
- Below 1024 px: one column, source, fields, review. The three tabs were removed for this.
- Stepper labels no longer shrink; only the detail gets an ellipsis. The medication value grid uses
  two columns when the fields column is under 400 px so FREQUENCY is never cut.
- Measured in headless Edge (dark theme, mock) at 1920, 1440, 1280, 1100, 1024, 900 and 375 px: no
  truncated badge, value label, stepper label, filter, chip, or button; no source text overflow; no
  horizontal scroll. Source/fields widths at 1440 px: 697/464 px. "Go to field" from the review row
  scrolls up to the field, focuses it, and highlights its quote; approval and the patient sheet work.

Gates: lint 0, typecheck 0, tests 0 (40/40), build 0, no line > 120.

### Less text, review row below the fold

- The top row now fills the window (`--top-row: max(26rem, 100vh - toolbar - stepper)`); the review
  row starts below it and is reached by scrolling. Measured at 1100, 1280, 1440 (900 px tall) and
  1920 (1080 px tall): the review row's top edge is at the window's bottom edge.
- Text trimmed (presentation only): stepper shows labels only, with each detail in a tooltip; the
  source status line appears only once a citation is selected (it stays an aria-live region); zero
  evidence counts are hidden; the fields tip moved to the heading tooltip; the "Evidence" label is
  gone; gate sentences that repeated the title were removed and the field path moved to the code
  chip tooltip; shorter note label, counter ("0/10 characters"), binding line, and patient sheet
  status; the prompt version moved into the revision tooltip.
- No truncated labels and no horizontal scroll at the widths above; "Go to field", approval, and the
  patient sheet still work. Gates: lint 0, typecheck 0, tests 0 (40/40), no line > 120.

### Check against main after #17

`main` has nothing new since this branch's base (`3b1afff`). PR #17 changed no frontend file and no
contract: visitor processings are now counted only after a successful run, and the Spanish glossary
grew. With the mock fixtures fx01 to fx05 the Spanish preview now has no untranslated phrase (0 "[en]"
markers, checked through the API). The live model can still produce phrases the glossary does not
know, which the API keeps in English with a trailing " [en]".

- The patient sheet now shows such a phrase without the raw marker, marked `lang="en"`, followed by
  an "EN" tag with the tooltip "Not translated; shown in English", and adds a one-line legend in
  Spanish at the foot of the sheet (also printed). No value is changed.
- Gates: lint 0, typecheck 0, tests 0 (41/41), no line > 120.

## Questions for the humans (section 8)

- Fonts: vendor the Geist woff2 (OFL, with its licence file) into `apps/web/src/assets/` instead of
  the npm package? It avoids the Next.js peer dependency. Not done without approval.
