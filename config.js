// ---------------------------------------------------------------------------
// Endpoint configuration.
//
// TorBox's API occasionally renames or moves endpoints. Everything the app
// calls is defined here in one place so it can be patched without touching
// app.js. Cross-check against https://api-docs.torbox.app before reporting
// something as broken.
// ---------------------------------------------------------------------------

const CONFIG = {
  TORBOX_BASE: "https://api.torbox.app/v1/api",
  TORBOX_ENDPOINTS: {
    me: "/user/me",
    mylist: "/torrents/mylist",
    search: "/torrents/search",          // query-based torrent search
    checkCached: "/torrents/checkcached", // hash lookup for cache status
    createTorrent: "/torrents/createtorrent",
    torrentInfo: "/torrents/torrentinfo",
    requestDl: "/torrents/requestdl",     // returns a direct/stream link for a file
  },

  TMDB_BASE: "https://api.themoviedb.org/3",
  TMDB_ENDPOINTS: {
    searchMovie: "/search/movie",
    searchTv: "/search/tv",
    tvDetails: "/tv", // + /{id}
  },
  TMDB_IMG_BASE: "https://image.tmdb.org/t/p/w342",

  // How long a "checkcached" result is trusted before re-checking (ms)
  CACHE_TTL_MS: 5 * 60 * 1000,
};
