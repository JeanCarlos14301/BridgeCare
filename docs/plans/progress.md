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
  violations in the console. **Still to do:** repeat through nginx with Docker running.

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

## Questions for the humans (section 8)

- Fonts: vendor the Geist woff2 (OFL, with its licence file) into `apps/web/src/assets/` instead of
  the npm package? It avoids the Next.js peer dependency. Not done without approval.
