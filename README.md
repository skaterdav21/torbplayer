# Reel — a browser-based TorBox media player

A static, client-side web app for searching movies/TV and playing them straight
from your TorBox library. No backend, no server, no account system of its own —
it runs entirely in your browser and talks directly to TorBox and TMDB.

## How it works

1. You paste your **TorBox API key** and a free **TMDB API key** into Settings.
   Both are stored only in this browser's `localStorage`. Nothing is sent to
   any third party server other than TorBox and TMDB themselves.
2. Searching a title queries TMDB for metadata (poster, year, episode list).
3. Selecting a title builds a query and searches TorBox's own torrent search
   for matches, then checks which ones are already cached on TorBox so
   playback can start instantly. Anything not cached can be added and it'll
   poll until it's ready.
4. Playback uses [hls.js](https://github.com/video-dev/hls.js) for adaptive
   streams and falls back to a plain `<video>` src for direct files.

## Getting your API keys

- **TorBox**: [torbox.app/settings](https://torbox.app/settings) → API section
  → generate a key. **Requires a paid TorBox plan.** TorBox removed API
  access for Free accounts, so if you're on Free the key either won't work
  or won't exist yet — upgrade first.
- **TMDB**: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
  → create a free account → request an API key → use the "API Key (v3 auth)"
  value (a v4 read access token also works, the app detects which type you
  pasted).

Both links are also right in the app's Settings panel next to each field.

## Deploying to GitHub Pages

1. Push this folder's contents to a repo (root, or a `/docs` folder).
2. Repo → Settings → Pages → set "Source" to the branch/folder you pushed to.
3. Wait a minute for it to build, then open the given `github.io` URL.

`.nojekyll` is included so GitHub Pages doesn't run its default Jekyll
processing over the files.

## If "Test connection" fails on TorBox

Two different problems both show up as "couldn't reach TorBox," so check in
this order:

1. **Plan tier.** TorBox now requires a paid plan for any API access at all
   — Free accounts get a network-level failure, not a clean 403, which looks
   identical to a CORS block from the browser's side. Confirm your plan at
   [torbox.app/settings](https://torbox.app/settings) first.
2. **CORS.** If you're definitely on a paid plan and it still fails, open
   the browser console (F12 → Console/Network tab) and look at the actual
   failed request. If it shows a CORS error specifically (not a 401/403),
   TorBox isn't sending permissive headers for a `github.io` origin. Fix by
   putting a small CORS-forwarding proxy in front of `api.torbox.app` — a
   Cloudflare Worker you deploy yourself that just forwards headers through
   works well and is free at this scale, and still requires no traditional
   backend.

The app's error message points at both possibilities rather than guessing,
since the browser can't always tell them apart on its own.

## Endpoint notes

TorBox's API has changed shape across versions. Every endpoint path this app
calls is centralized in `config.js` so it can be patched in one place if
TorBox renames something. Cross-check against
[api-docs.torbox.app](https://api-docs.torbox.app) if a call starts failing
with a 404 that isn't an auth problem.

## Files

- `index.html` — structure
- `style.css` — the whole visual design (dark, marquee/cinema theme)
- `config.js` — editable API endpoint paths
- `app.js` — all application logic
- `.nojekyll` — tells GitHub Pages to serve files as-is

## Limitations / things not built (yet)

- No offline/PWA support.
- No subtitle track picker (TorBox subtitle URLs aren't wired in — add to
  the `<video>` as a `<track>` element in `playUrl()` in `app.js` if you have
  a source of subtitle files).
- Watch history/resume position is per-browser (localStorage), not synced
  across devices.
