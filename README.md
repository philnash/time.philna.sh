# Phil's Time

A clean, modern, front-end-only time zone comparison app inspired by tools like SavvyTime.

It lets you compare local time across cities worldwide, pick a custom date/time, and share the exact app state through a readable path URL.

## Highlights

- Front-end only: HTML, CSS, and vanilla JavaScript
- Global city dataset (`7277` entries) mapped to IANA time zones
- Time conversion powered by JavaScript `Intl` APIs
- Anchor-city model: selected date/time is interpreted in the first city
- Readable path-based URLs for full state sharing
- Share-link input with one-click clipboard copy
- Back/forward state restoration via Web Navigation API with History API fallback
- Offline support with a service worker (PWA behavior)
- Mobile-friendly responsive UI
- Respects system light/dark mode (`prefers-color-scheme`)
- Theme switch (System / Light / Dark), defaulting to system
- Per-city time sliders so you can scrub from any city (plus datetime input for precise edits)

## How It Works

- The root path (`/`) starts with no selected cities.
- City list order matters. The first city is the **anchor**.
- The selected `YYYY-MM-DDTHH:mm` value is treated as wall time in the anchor city.
- All other city times are calculated from the resulting instant.
- App state is encoded into the URL path.
- Once at least one city is selected, the URL transitions to `/compare/...`.

Example URL:

`/compare/melbourne-au/new-york-us/2026-03-08T09-30`

- `melbourne-au` is the anchor city.
- `new-york-us` is the second compared city.
- `2026-03-08T09-30` is interpreted in Melbourne time.

## Project Structure

- `index.html` — app shell
- `src/styles.css` — responsive and theme-aware styling
- `src/app.js` — state management, search, URL sync, time conversion, rendering
- `public/sw.js` — service worker for precache and offline handling
- `public/manifest.webmanifest` — PWA metadata
- `public/assets/icon.svg` — app icon
- `public/data/cities.json` — generated city-to-time-zone dataset
- `scripts/build-cities.js` — dataset generation script
- `vite.config.mjs` — local dev/preview server config
- `playwright.config.js` — end-to-end test configuration
- `tests/e2e/` — Playwright end-to-end test suite

## Requirements

- Node.js 24.x
- npm

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. (Optional) Regenerate the city dataset:

```bash
npm run build:cities
```

3. Start the local dev server:

```bash
npm run dev
```

4. Open in your browser:

[http://127.0.0.1:8080](http://127.0.0.1:8080)

You can also open a deep link directly, for example:

[http://127.0.0.1:8080/compare/melbourne-au/new-york-us/2026-03-08T09-30](http://127.0.0.1:8080/compare/melbourne-au/new-york-us/2026-03-08T09-30)

## NPM Scripts

- `npm run dev` — run Vite dev server on `127.0.0.1:8080`
- `npm run build` — produce a minified production build in `dist/`
- `npm run preview` — preview the production build on `127.0.0.1:8080`
- `npm run start` — alias for `npm run dev`
- `npm run build:cities` — rebuild `public/data/cities.json`
- `npm test` — syntax checks for key JS files
- `npm run test:e2e` — run Playwright end-to-end tests (production preview mode)
- `npm run test:e2e:headed` — run Playwright tests with a visible browser
- `npm run test:e2e:ui` — open Playwright UI mode

## End-to-End Testing

Playwright E2E tests run against a production-like server (`vite build` + `vite preview`), not the Vite dev server.

Install Playwright browser binaries:

```bash
npx playwright install chromium
```

Run E2E tests:

```bash
npm run test:e2e
```

CI runs the same suite in GitHub Actions on pull requests and pushes to `main` via `.github/workflows/e2e.yml`.

## Browser Support

The app uses the **Web Navigation API** when available and automatically falls back to the **History API** (`pushState`/`replaceState` + `popstate`) when it is not.

This allows it to work across modern Chromium, Firefox, and Safari builds while still taking advantage of newer navigation primitives where supported.

## Offline / PWA Notes

- Service worker precaches core files and the city dataset.
- Runtime asset fetches are network-first with cache fallback, which keeps updates from getting stuck behind stale cached JS/CSS.
- After first successful load, the app can be used offline.
- Navigation requests are routed to the app shell when needed.

## Data Notes

City data is generated from the `city-timezones` package.

Slug format is readable and stable (for example, `new-york-us`, `melbourne-au`), with deterministic disambiguation for collisions.

## Troubleshooting

- If deep links do not load correctly, ensure you are using `npm run dev` or `npm run preview` so Vite handles SPA route fallback.
- If city data looks stale after updates, rerun:

```bash
npm run build:cities
```

- If service worker changes seem cached, perform a hard refresh or clear site data in devtools.
