# TimeTime Zone

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
- Anchor-time slider for quick time scrubbing (plus datetime input for precise edits)

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
- `styles.css` — responsive and theme-aware styling
- `app.js` — state management, search, URL sync, time conversion, rendering
- `sw.js` — service worker for precache and offline handling
- `manifest.webmanifest` — PWA metadata
- `assets/icon.svg` — app icon
- `data/cities.json` — generated city-to-time-zone dataset
- `scripts/build-cities.js` — dataset generation script
- `server.js` — local static server with SPA path fallback for `/compare/...`

## Requirements

- Node.js 20+ (tested with Node 22)
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

3. Start the local server:

```bash
npm start
```

4. Open in your browser:

[http://127.0.0.1:8080](http://127.0.0.1:8080)

You can also open a deep link directly, for example:

[http://127.0.0.1:8080/compare/melbourne-au/new-york-us/2026-03-08T09-30](http://127.0.0.1:8080/compare/melbourne-au/new-york-us/2026-03-08T09-30)

## NPM Scripts

- `npm start` — run local server on `127.0.0.1:8080`
- `npm run build:cities` — rebuild `data/cities.json`
- `npm run build:worldmap` — regenerate background world-map SVG assets
- `npm test` — syntax checks for key JS files

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

- If deep links do not load correctly, ensure you are using `npm start` (the included server supports SPA route fallback).
- If city data looks stale after updates, rerun:

```bash
npm run build:cities
```

- If service worker changes seem cached, perform a hard refresh or clear site data in devtools.
