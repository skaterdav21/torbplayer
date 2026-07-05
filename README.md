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

- **TorBox**: log into torbox.app → Settings → API, generate a key.
- **TMDB**: create a free account at themoviedb.org → Settings → API →
  request a key (the "API Key (v3 auth)" is the simplest, a v4 read token
  also works).

## Deploying to GitHub Pages

1. Push this folder's contents to a repo (root, or a `/docs` folder).
2. Repo → Settings → Pages → set "Source" to the branch/folder you pushed to.
3. Wait a minute for it to build, then open the given `github.io` URL.

`.nojekyll` is included so GitHub Pages doesn't run its default Jekyll
processing over the files.

## A known rough edge: CORS

TorBox's API may or may not send permissive CORS headers for requests coming
from a `github.io` origin, since it isn't the origin their own web app runs
on. If Settings → "Test connection" fails with a network-level error (not an
auth error), that's almost certainly what's happening. Two ways around it:

- Run the app from `localhost` instead while testing (many APIs are looser
  about localhost, though this isn't guaranteed).
- Put a small CORS-forwarding proxy in front of `api.torbox.app` (e.g. a
  Cloudflare Worker you deploy yourself that just forwards headers through).
  This still requires no traditional backend, a Worker is free at this scale.

This app deliberately surfaces that failure mode with a specific message
rather than a generic "something went wrong," so you'll know which case
you're in.

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
