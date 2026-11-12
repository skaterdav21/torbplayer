# Beam

A phone remote for streaming. Search a movie or show, pick a source, and it
plays on your Chromecast or Google TV. Like Nuvio, but the phone doesn't play
anything itself: it finds the link and hands it to the TV.

- **Search and details** come from Cinemeta (Stremio's free metadata service),
  so there's no API key to set up.
- **Sources** come from the Stremio addons you add, such as TorBox's own addon
  or Torrentio set up with your debrid service. Every addon is queried at once
  and the results are merged into one list.
- **Sending** uses Google Cast with the standard Default Media Receiver, so
  nothing needs installing on the TV.

## Using it

1. Open **Addons** (the puzzle icon) and add a stream addon. You can paste its
   manifest URL, or tap **Install** on the addon's configure page and choose
   Beam: the app registers `stremio://` links for this.
2. Search for a title. For a show, pick an episode.
3. Tap a source. The first time, Beam asks which TV to use. After that it sends
   straight to the connected TV. **Long-press** a source to pick a different TV.
4. The remote screen opens: play/pause, ±10s/±30s, tap the bar to seek, TV
   volume, stop, disconnect. The subtitles button opens Google's full cast
   controls, which include track selection. A small "now casting" bar stays at
   the bottom of every screen.

Each source row shows quality, size, codec, audio, whether it's cached on your
debrid service, and a warning when a Chromecast is likely to struggle with it
(DTS/TrueHD audio, Dolby Vision, AVI files, links that need special headers).
Torrent-only results can't be cast, so they're hidden behind a "show" link.

### Getting addons

- **TorBox:** set up TorBox's Stremio addon from your TorBox account and copy
  its manifest link. Its links play straight from TorBox.
- **Torrentio, Comet, MediaFusion and others:** open the addon's configure
  page, add your debrid service (TorBox, Real-Debrid, …), then copy the link
  or tap Install.

Addon URLs usually contain your API key. They're stored only on the phone, and
the app only ever displays the host name.

## Installing on your Android phone

Beam uses a native Chromecast library, so it **does not run in Expo Go**. Build
an APK in Expo's cloud instead. You need a free Expo account; Android Studio
isn't needed.

```bash
npm install
npx eas-cli@latest login
npm run build:apk          # eas build --platform android --profile preview
```

When the build finishes, EAS gives you a link and QR code for the `.apk`. Open
it on the phone and allow installing from that source when Android asks. The
phone and the TV must be on the same Wi-Fi.

## Development

```bash
npm run web          # browser preview with two simulated Chromecasts
npm test             # unit tests (stream parsing, addon protocol)
npm run typecheck
npm run lint
```

For live reload on the phone, make a development build once
(`npx eas-cli@latest build -p android --profile development`), install it,
then run `npm start`. With the Android SDK installed locally,
`npm run android` builds and runs it directly.

The browser preview swaps the cast library for `src/cast/cast.web.ts`, which
simulates devices and playback, so the whole search → pick → send flow can be
clicked through without a TV.

## Layout

```
src/
  app/                 screens (Expo Router)
    index.tsx            search + recently sent
    title/[type]/[id]    movie details + sources, or show + episode list
    sources/[type]/[id]  sources for one episode
    addons.tsx           add / remove / reorder addons
    remote.tsx           cast remote
    +native-intent.tsx   turns stremio:// install links into the Addons screen
  cast/
    cast.ts              the only import of react-native-google-cast
    cast.web.ts          simulated Chromecast for the browser preview
    SendContext.tsx      "send this to a TV": device picker, connect, load
  lib/
    stremio.ts           Stremio addon protocol client
    cinemeta.ts          search, details, episode lists
    streamInfo.ts        parses addon results: quality, size, cache, cast warnings
  components/, hooks/, state/
```

## Status

What has been checked so far: TypeScript, lint, unit tests, the Android
JavaScript bundle (Hermes), Expo's Android project generation with the Cast
plugin, and a browser click-through of every screen using sample addon data.

What hasn't been checked yet:

- **The native APK build.** The Android SDK couldn't be downloaded where this
  was written. The cast library (`react-native-google-cast` 4.9.1) supports
  React Native's New Architecture in compatibility mode. Every React Native
  class it uses still exists in RN 0.88, but the first EAS build is the real
  test. If it fails inside the cast module, try the v5 beta:
  `npm i react-native-google-cast@next`.
- **A real Chromecast.** Casting has only been exercised against the simulator.

The app icon is still Expo's placeholder.

## Ideas for later

- Auto-send to the last-used TV without asking
- Resume where you left off, and "next episode" from the remote
- Subtitles from addons (Chromecast needs WebVTT, so SRT would need converting)
- TorBox transcoding for files a Chromecast can't decode
- Other targets, such as Kodi or a small receiver app for Fire TV
