# Claude Code instructions: smooth nav transitions and eliminate stylesheet flashing

Use this as an implementation brief. The current site is a multi-page app where each navbar click triggers a full document navigation, and users see slow/clunky transitions plus occasional flashes of mismatched styles.

## Why this is happening (from current code)

1. `stuflover-nav.js` builds nav UI and injects a large CSS string at runtime instead of using preloaded static CSS.
2. Most pages load `stuflover-nav.js` with `defer` near the end of the HTML, so nav/theme behavior waits until HTML parsing completes.
3. Pages duplicate large inline `<style>` blocks with page-specific palette defaults, which can briefly paint before user theme overrides apply.
4. Server static assets are served without explicit long-lived cache policy for JS/CSS, so cross-page navigation may repeatedly revalidate and delay first paint.

## Primary goal

Make navigation between pages feel instant and visually stable:
- no old/legacy nav flash,
- no palette/theme flash,
- no visible stylesheet "swap" during nav clicks,
- improved repeat-load speed for JS/CSS.

---

## Required implementation plan

### 1) Move nav CSS from runtime injection to static CSS (critical)

- Create `public/stuflover-nav.css`.
- Move all CSS currently assembled in `injectStyles()` from `public/stuflover-nav.js` into this file.
- Keep only nav DOM behavior in JS.
- Delete or minimize `injectStyles()` so it no longer generates a giant CSS string at runtime.

**Acceptance checks**
- `stuflover-nav.js` no longer contains a huge template string for CSS.
- `stuflover-nav.css` is linked in every page that currently uses nav.

### 2) Load nav/theme resources earlier in document head

For pages with shared nav:
- In `<head>`, add:
  - `<link rel="preload" href="/stuflover-nav.css" as="style">`
  - `<link rel="stylesheet" href="/stuflover-nav.css">`
  - `<link rel="preload" href="/stuflover-nav.js" as="script">`
- Keep nav script as deferred, but ensure the preload + stylesheet are in `<head>` before large inline page styles.

For theme:
- Add a tiny inline boot script in `<head>` that applies persisted theme tokens **before first paint** (or adapt existing theme boot logic).
- Keep the heavier theme utilities deferred.

**Acceptance checks**
- On hard refresh, no visible nav/legacy-nav flicker.
- Theme colors are correct on first paint for returning users.

### 3) Standardize critical shared styles and reduce per-page inline CSS precedence conflicts

- Move shared reset/nav visibility/theme baseline rules into `stuflover-design-system.css` or `stuflover-nav.css`.
- Remove duplicated `nav#mainNav, nav.sl-nav, .top-bar { display:none !important; }` snippets from per-page inline styles when redundant.
- Keep page-unique styles inline only when necessary.

**Acceptance checks**
- Fewer repeated critical rules across HTML files.
- No regressions in page-specific appearance.

### 4) Add strong cache headers for static assets

In Express static middleware, configure cache control by file type:
- `*.css`, `*.js`, fonts, images: `Cache-Control: public, max-age=31536000, immutable` (for versioned assets).
- `*.html`: short/no-cache as appropriate (`no-cache` or small max-age).

If filenames are not content-hashed yet, introduce version query strings for shared assets (e.g. `/stuflover-nav.css?v=2`) so long cache is safe.

**Acceptance checks**
- Repeat navigations show fewer network transfers for CSS/JS (304 or memory cache/ disk cache hits).
- Lighthouse/WebPageTest: improved repeat view performance.

### 5) Prefetch likely next pages from nav

- In `stuflover-nav.js`, when idle (`requestIdleCallback` fallback to `setTimeout`), prefetch top nav target docs using:
  - `<link rel="prefetch" href="/games.html" as="document">` etc.
- Avoid prefetching on slow connections (`navigator.connection.saveData` or very low bandwidth if available).

**Acceptance checks**
- After landing on one page, first click to another top-level tab is noticeably faster.

### 6) Add objective measurement + guardrails

- Add a simple `performance.mark()` around nav click to next page paint (or custom logging hook).
- Record before/after median on at least 10 navigations per route pair.
- Define budget: e.g. repeat navigation visual completeness < 500ms on local prod build.

---

## Files to change first

1. `public/stuflover-nav.js`
2. `public/stuflover-nav.css` (new)
3. Shared HTML templates in `public/*.html` that include nav
4. `src/app.js` (static cache policy)
5. Optionally `public/stuflover-theme.js` for early boot extraction

## Don’t do

- Don’t convert to a full SPA in this pass.
- Don’t rewrite every page’s CSS architecture now.
- Don’t add heavy client frameworks just for navigation.

## QA checklist

- Hard refresh on at least: `index.html`, `lifestyle.html`, `games.html`, `friends.html`, `account.html`.
- Click each top nav tab repeatedly and confirm:
  - no flash of wrong nav,
  - no flash of wrong palette,
  - no large layout shift.
- Verify mobile breakpoints still match current nav behavior.
- Verify auth-dependent `Me` tab (`auth.html` vs `account.html`) still works.
