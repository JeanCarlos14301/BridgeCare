# Design notes: Evolus-inspired redesign

Reference: `https://evolus.ai/en`, read on 2026-10-12. The built-in browser was not available in
this session, so these notes come from the page structure (text fetch) and the CSS tokens in
Annex A of the redesign brief. No screenshots of the reference site were taken.

## Hierarchy observed

- Top bar: wordmark on the left, a few navigation items, one filled pill CTA on the right.
- Section rhythm: a small eyebrow label, then a two-line heading that ends with a period, then
  generous vertical space before the content.
- Product mockups are framed as UI windows (three dots in the title bar) with a short caption.
- Pill badges carry status ("Live", plan names); numbered markers (01-05) label tabs and cards.
- Cards: 1 px border, large radius, stacked lists with bold titles and muted body text.
- Primary actions are filled lime pills; secondary actions are outlined pills.

## How BridgeCare uses it

- Dark near-black surfaces by default, light theme on demand, print always light.
- Lime is brand only: wordmark, primary buttons, focus ring. It never means "safe".
- Evidence states always combine a glyph, a word, and a colour:
  supported `✓` green, missing `–` neutral, ambiguous `?` amber, conflicting `!` red.
- The source document sits inside a window frame, as the product mockup does on the reference.
- Fixture picker is a numbered pill segmented control (01-06), echoing the numbered tabs.
- Copy stays short and imperative: "Review. Verify. Approve."

## Not copied

Evolus logos, names, copy, illustrations, and exact layout. BridgeCare keeps its own wordmark.
