// ===========================================================================
// Reel — a static, client-side TorBox media browser/player.
// No backend. Both API keys live only in this browser's localStorage.
// ===========================================================================

const store = {
  get torboxKey(){ return localStorage.getItem("reel_torbox_key") || ""; },
  set torboxKey(v){ localStorage.setItem("reel_torbox_key", v); },
  get tmdbKey(){ return localStorage.getItem("reel_tmdb_key") || ""; },
  set tmdbKey(v){ localStorage.setItem("reel_tmdb_key", v); },
  get history(){ try{ return JSON.parse(localStorage.getItem("reel_history")||"{}"); }catch{ return {}; } },
  set history(v){ localStorage.setItem("reel_history", JSON.stringify(v)); },
};

const els = {
  searchInput: document.getElementById("searchInput"),
  tabs: document.querySelectorAll(".tab"),
  resultsGrid: document.getElementById("resultsGrid"),
  libraryGrid: document.getElementById("libraryGrid"),
  emptyState: document.getElementById("emptyState"),
  statusBanner: document.getElementById("statusBanner"),
  showLibraryBtn: document.getElementById("showLibraryBtn"),

  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  torboxKeyInput: document.getElementById("torboxKeyInput"),
  tmdbKeyInput: document.getElementById("tmdbKeyInput"),
  testTorboxBtn: document.getElementById("testTorboxBtn"),
  testTmdbBtn: document.getElementById("testTmdbBtn"),
  torboxStatus: document.getElementById("torboxStatus"),
  tmdbStatus: document.getElementById("tmdbStatus"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),

  episodeModal: document.getElementById("episodeModal"),
  episodeModalTitle: document.getElementById("episodeModalTitle"),
  seasonSelect: document.getElementById("seasonSelect"),
  episodeSelect: document.getElementById("episodeSelect"),
  episodeSearchBtn: document.getElementById("episodeSearchBtn"),

  sourceModal: document.getElementById("sourceModal"),
  sourceModalTitle: document.getElementById("sourceModalTitle"),
  sourceList: document.getElementById("sourceList"),

  fileModal: document.getElementById("fileModal"),
  fileList: document.getElementById("fileList"),

  playerOverlay: document.getElementById("playerOverlay"),
  video: document.getElementById("video"),
  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  closePlayerBtn: document.getElementById("closePlayerBtn"),
  qualitySelect: document.getElementById("qualitySelect"),

  toast: document.getElementById("toast"),
};

let state = {
  searchType: "movie",
  currentShow: null,   // TMDB tv details when picking episodes
  currentMeta: null,   // { title, year, type, season, episode } for the active source search
  hls: null,
};

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------
function toast(msg, isError=false){
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>els.toast.classList.add("hidden"), 3800);
}

function showBanner(msg, isError=false){
  els.statusBanner.textContent = msg;
  els.statusBanner.classList.toggle("error", isError);
  els.statusBanner.classList.remove("hidden");
}
function hideBanner(){ els.statusBanner.classList.add("hidden"); }

function openModal(modal){ modal.classList.remove("hidden"); }
function closeModal(modal){ modal.classList.add("hidden"); }
document.querySelectorAll("[data-close]").forEach(btn=>{
  btn.addEventListener("click", ()=> btn.closest(".modal").classList.add("hidden"));
});
document.querySelectorAll(".modal").forEach(m=>{
  m.addEventListener("click", e=>{ if(e.target === m) closeModal(m); });
});

function fmtBytes(n){
  if(!n) return "";
  const units=["B","KB","MB","GB","TB"];
  let i=0; while(n>=1024 && i<units.length-1){ n/=1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// TorBox API
// ---------------------------------------------------------------------------
async function tbFetch(path, {method="GET", params=null, body=null} = {}){
  if(!store.torboxKey) throw new Error("No TorBox API key set. Open Settings.");
  let url = CONFIG.TORBOX_BASE + path;
  if(params){
    const qs = new URLSearchParams(params).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }
  let res;
  try{
    res = await fetch(url, {
      method,
      headers:{
        "Authorization": `Bearer ${store.torboxKey}`,
        ...(body ? {"Content-Type":"application/json"} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }catch(err){
    throw new Error("Could not reach TorBox from this browser. This is usually a CORS restriction from a static site origin — see the README for workarounds.");
  }
  let json;
  try{ json = await res.json(); }
  catch{ throw new Error(`TorBox returned an unreadable response (status ${res.status}).`); }
  if(!json.success){
    throw new Error(json.detail || json.error || `TorBox request failed (status ${res.status}).`);
  }
  return json.data;
}

async function torboxMe(){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.me);
}

async function torboxMyList(){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.mylist, { params:{ bypass_cache:"true" } });
}

async function torboxSearch(query){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.search, { params:{ query } });
}

async function torboxCheckCached(hashes){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.checkCached, {
    params:{ hash: hashes.join(","), format:"list", list_files:"true" }
  });
}

async function torboxCreateTorrent(magnet){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.createTorrent, {
    method:"POST", body:{ magnet }
  });
}

async function torboxTorrentInfo(torrentId){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.torrentInfo, { params:{ id: torrentId } });
}

async function torboxRequestLink(torrentId, fileId){
  return tbFetch(CONFIG.TORBOX_ENDPOINTS.requestDl, {
    params:{ token: store.torboxKey, torrent_id: torrentId, file_id: fileId }
  });
}

// ---------------------------------------------------------------------------
// TMDB API
// ---------------------------------------------------------------------------
async function tmdbFetch(path, params={}){
  if(!store.tmdbKey) throw new Error("No TMDB API key set. Open Settings.");
  const isV4Token = store.tmdbKey.startsWith("eyJ");
  let url = CONFIG.TMDB_BASE + path;
  const qp = new URLSearchParams(params);
  if(!isV4Token) qp.set("api_key", store.tmdbKey);
  url += "?" + qp.toString();
  const res = await fetch(url, {
    headers: isV4Token ? { "Authorization": `Bearer ${store.tmdbKey}` } : {},
  });
  if(!res.ok){
    const body = await res.json().catch(()=>({}));
    throw new Error(body.status_message || `TMDB request failed (status ${res.status}).`);
  }
  return res.json();
}

async function tmdbSearch(query, type){
  const path = type === "tv" ? CONFIG.TMDB_ENDPOINTS.searchTv : CONFIG.TMDB_ENDPOINTS.searchMovie;
  const data = await tmdbFetch(path, { query });
  return data.results || [];
}

async function tmdbTvDetails(id){
  return tmdbFetch(`${CONFIG.TMDB_ENDPOINTS.tvDetails}/${id}`);
}

// ---------------------------------------------------------------------------
// Search flow
// ---------------------------------------------------------------------------
let searchDebounce;
els.searchInput.addEventListener("input", ()=>{
  clearTimeout(searchDebounce);
  const q = els.searchInput.value.trim();
  if(!q){ els.resultsGrid.innerHTML=""; els.emptyState.classList.remove("hidden"); return; }
  searchDebounce = setTimeout(()=> runSearch(q), 400);
});

els.tabs.forEach(tab=>{
  tab.addEventListener("click", ()=>{
    els.tabs.forEach(t=>t.classList.remove("active"));
    tab.classList.add("active");
    state.searchType = tab.dataset.type;
    const q = els.searchInput.value.trim();
    if(q) runSearch(q);
  });
});

async function runSearch(query){
  hideBanner();
  els.libraryGrid.style.display = "none";
  try{
    const results = await tmdbSearch(query, state.searchType);
    els.emptyState.classList.toggle("hidden", results.length > 0);
    renderPosterGrid(els.resultsGrid, results, state.searchType);
  }catch(err){
    showBanner(err.message, true);
  }
}

function renderPosterGrid(container, items, type){
  container.innerHTML = "";
  container.style.display = "grid";
  items.forEach(item=>{
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || "";
    const year = date ? date.slice(0,4) : "—";
    const card = document.createElement("div");
    card.className = "poster-card";
    card.innerHTML = `
      <img loading="lazy" src="${item.poster_path ? CONFIG.TMDB_IMG_BASE+item.poster_path : ''}" alt="${title}"
           onerror="this.style.background='#1b1e23'">
      <div class="poster-meta">
        <p class="p-title">${title}</p>
        <p class="p-sub">${year} · ${type === 'tv' ? 'TV' : 'Movie'}</p>
      </div>`;
    card.addEventListener("click", ()=> onTitleSelected(item, type));
    container.appendChild(card);
  });
}

async function onTitleSelected(item, type){
  const title = item.title || item.name;
  const date = item.release_date || item.first_air_date || "";
  const year = date ? date.slice(0,4) : "";

  if(type === "movie"){
    state.currentMeta = { title, year, type:"movie" };
    openSourceSearch(`${title} ${year}`.trim(), title);
    return;
  }

  // TV: pick season/episode first
  try{
    const details = await tmdbTvDetails(item.id);
    state.currentShow = details;
    els.episodeModalTitle.textContent = title;
    els.seasonSelect.innerHTML = "";
    details.seasons
      .filter(s=>s.season_number > 0)
      .forEach(s=>{
        const opt = document.createElement("option");
        opt.value = s.season_number;
        opt.textContent = `Season ${s.season_number}`;
        opt.dataset.episodeCount = s.episode_count;
        els.seasonSelect.appendChild(opt);
      });
    populateEpisodes();
    els.seasonSelect.onchange = populateEpisodes;
    openModal(els.episodeModal);
  }catch(err){
    toast(err.message, true);
  }
}

function populateEpisodes(){
  const count = parseInt(els.seasonSelect.selectedOptions[0]?.dataset.episodeCount || 1, 10);
  els.episodeSelect.innerHTML = "";
  for(let e=1; e<=count; e++){
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = `Episode ${e}`;
    els.episodeSelect.appendChild(opt);
  }
}

els.episodeSearchBtn.addEventListener("click", ()=>{
  const title = state.currentShow.name;
  const season = parseInt(els.seasonSelect.value, 10);
  const episode = parseInt(els.episodeSelect.value, 10);
  const sPad = String(season).padStart(2,"0");
  const ePad = String(episode).padStart(2,"0");
  state.currentMeta = { title, type:"tv", season, episode };
  closeModal(els.episodeModal);
  openSourceSearch(`${title} S${sPad}E${ePad}`, `${title} — S${sPad}E${ePad}`);
});

// ---------------------------------------------------------------------------
// Source search (TorBox) + cache checking
// ---------------------------------------------------------------------------
async function openSourceSearch(query, displayTitle){
  els.sourceModalTitle.textContent = displayTitle;
  els.sourceList.innerHTML = `<li class="source-item"><span>Searching TorBox for "${query}"…</span></li>`;
  openModal(els.sourceModal);

  try{
    const results = await torboxSearch(query);
    const torrents = (results?.torrents || results || []).slice(0, 25);
    if(!torrents.length){
      els.sourceList.innerHTML = `<li class="source-item"><span>No results. You can try a more specific search, or add a magnet link manually from TorBox's own site.</span></li>`;
      return;
    }
    renderSourceList(torrents);

    // Check cache status for everything with a hash, in one batch call.
    const hashes = torrents.map(t=>t.hash).filter(Boolean);
    if(hashes.length){
      const cacheInfo = await torboxCheckCached(hashes).catch(()=>({}));
      applyCacheStatus(torrents, cacheInfo);
    }
  }catch(err){
    els.sourceList.innerHTML = `<li class="source-item"><span>${err.message}</span></li>`;
  }
}

function renderSourceList(torrents){
  els.sourceList.innerHTML = "";
  torrents.forEach((t, idx)=>{
    const li = document.createElement("li");
    li.className = "source-item";
    li.dataset.idx = idx;
    li.innerHTML = `
      <div class="source-info">
        <span class="source-name">${t.name || t.title || "Unnamed torrent"}</span>
        <span class="source-tags">
          <span><span class="bulb checking" data-bulb="${idx}"></span> checking</span>
          <span>${fmtBytes(t.size)}</span>
          <span>${t.seeders ?? 0} seeds</span>
        </span>
      </div>
      <button class="play-btn" data-action="play" data-idx="${idx}" disabled>Play</button>
    `;
    els.sourceList.appendChild(li);
  });
  els.sourceList._torrents = torrents;

  els.sourceList.onclick = (e)=>{
    const btn = e.target.closest("[data-action='play']");
    if(!btn || btn.disabled) return;
    const t = els.sourceList._torrents[btn.dataset.idx];
    handleSourceChosen(t);
  };
}

function applyCacheStatus(torrents, cacheInfo){
  const cachedMap = new Map();
  (Array.isArray(cacheInfo) ? cacheInfo : Object.values(cacheInfo||{})).forEach(c=>{
    if(c && c.hash) cachedMap.set(c.hash.toLowerCase(), c);
  });

  torrents.forEach((t, idx)=>{
    const bulb = els.sourceList.querySelector(`[data-bulb="${idx}"]`);
    const btn = els.sourceList.querySelector(`.play-btn[data-idx="${idx}"]`);
    const cached = t.hash && cachedMap.get(t.hash.toLowerCase());
    if(!bulb) return;
    if(cached){
      bulb.className = "bulb cached";
      bulb.nextSibling && (bulb.parentElement.firstChild.lastChild.textContent = " cached, ready");
      t._cachedInfo = cached;
    }else{
      bulb.className = "bulb uncached";
    }
    if(btn){
      btn.disabled = false;
      btn.textContent = cached ? "Play" : "Add + wait";
    }
  });

  // sort cached items to the top
  const list = Array.from(els.sourceList.children);
  list.sort((a,b)=>{
    const ai = torrents[a.dataset.idx]._cachedInfo ? 0 : 1;
    const bi = torrents[b.dataset.idx]._cachedInfo ? 0 : 1;
    return ai - bi;
  });
  list.forEach(li=>els.sourceList.appendChild(li));
}

async function handleSourceChosen(torrent){
  try{
    let torrentId = torrent.torrent_id || torrent.id;
    if(torrent._cachedInfo){
      // Already cached — TorBox may require adding it to your library first
      // if it isn't there yet, then requesting the link.
      if(!torrentId){
        toast("Adding cached torrent to your TorBox library…");
        const created = await torboxCreateTorrent(torrent.magnet || `magnet:?xt=urn:btih:${torrent.hash}`);
        torrentId = created.torrent_id || created.id;
      }
      await pickFileAndPlay(torrentId);
    }else{
      toast("Not cached yet. Adding to TorBox and waiting for it to download…");
      const created = await torboxCreateTorrent(torrent.magnet || `magnet:?xt=urn:btih:${torrent.hash}`);
      torrentId = created.torrent_id || created.id;
      await pollUntilReady(torrentId);
      await pickFileAndPlay(torrentId);
    }
  }catch(err){
    toast(err.message, true);
  }
}

async function pollUntilReady(torrentId, maxTries=40){
  for(let i=0;i<maxTries;i++){
    const info = await torboxTorrentInfo(torrentId);
    if(info.download_finished || info.progress >= 1){
      return info;
    }
    toast(`Downloading… ${Math.round((info.progress||0)*100)}%`);
    await new Promise(r=>setTimeout(r, 4000));
  }
  throw new Error("Timed out waiting for the torrent to finish downloading on TorBox.");
}

async function pickFileAndPlay(torrentId){
  const info = await torboxTorrentInfo(torrentId);
  const videoFiles = (info.files || []).filter(f=>
    /\.(mp4|mkv|avi|mov|webm|m4v|ts)$/i.test(f.name || f.short_name || "")
  );
  if(!videoFiles.length){
    throw new Error("No video files found in this torrent.");
  }
  if(videoFiles.length === 1){
    return startStream(torrentId, videoFiles[0]);
  }
  // multiple video files (season pack) — let the user choose
  els.fileList.innerHTML = "";
  videoFiles.forEach(f=>{
    const li = document.createElement("li");
    li.className = "source-item";
    li.innerHTML = `
      <div class="source-info">
        <span class="source-name">${f.short_name || f.name}</span>
        <span class="source-tags"><span>${fmtBytes(f.size)}</span></span>
      </div>
      <button class="play-btn">Play</button>`;
    li.querySelector(".play-btn").addEventListener("click", ()=>{
      closeModal(els.fileModal);
      startStream(torrentId, f);
    });
    els.fileList.appendChild(li);
  });
  openModal(els.fileModal);
}

async function startStream(torrentId, file){
  try{
    const link = await torboxRequestLink(torrentId, file.id || file.file_id);
    closeModal(els.sourceModal);
    closeModal(els.fileModal);
    playUrl(link, file.short_name || file.name || "Now playing");
  }catch(err){
    toast(err.message, true);
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
function playUrl(url, title){
  els.nowPlayingTitle.textContent = title;
  els.playerOverlay.classList.remove("hidden");
  els.qualitySelect.style.display = "none";

  if(state.hls){ state.hls.destroy(); state.hls = null; }

  const isHls = /\.m3u8($|\?)/i.test(url);
  if(isHls && window.Hls && Hls.isSupported()){
    const hls = new Hls();
    state.hls = hls;
    hls.loadSource(url);
    hls.attachMedia(els.video);
    hls.on(Hls.Events.MANIFEST_PARSED, ()=>{
      if(hls.levels.length > 1){
        els.qualitySelect.style.display = "inline-block";
        els.qualitySelect.innerHTML = `<option value="-1">Auto</option>` +
          hls.levels.map((lvl,i)=>`<option value="${i}">${lvl.height}p</option>`).join("");
        els.qualitySelect.onchange = ()=>{ hls.currentLevel = parseInt(els.qualitySelect.value,10); };
      }
    });
    hls.on(Hls.Events.ERROR, (e, data)=>{
      if(data.fatal) toast(`Playback error: ${data.details}`, true);
    });
  }else{
    els.video.src = url;
  }

  resumePlayback(title);
  els.video.play().catch(()=>{});
}

function resumePlayback(title){
  const h = store.history;
  const saved = h[title];
  if(saved && saved.position > 5){
    const onceReady = ()=>{
      els.video.currentTime = saved.position;
      els.video.removeEventListener("loadedmetadata", onceReady);
    };
    els.video.addEventListener("loadedmetadata", onceReady);
  }
  els.video.ontimeupdate = ()=>{
    const hist = store.history;
    hist[title] = { position: els.video.currentTime, updated: Date.now() };
    store.history = hist;
  };
}

els.closePlayerBtn.addEventListener("click", ()=>{
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();
  if(state.hls){ state.hls.destroy(); state.hls = null; }
  els.playerOverlay.classList.add("hidden");
});

// ---------------------------------------------------------------------------
// My TorBox library
// ---------------------------------------------------------------------------
els.showLibraryBtn.addEventListener("click", loadLibrary);

async function loadLibrary(){
  hideBanner();
  try{
    const list = await torboxMyList();
    els.emptyState.classList.add("hidden");
    els.resultsGrid.style.display = "none";
    els.libraryGrid.style.display = "grid";
    els.libraryGrid.innerHTML = "";
    if(!list.length){
      els.libraryGrid.innerHTML = `<p style="color:var(--text-dim)">Your TorBox library is empty.</p>`;
      return;
    }
    list.forEach(t=>{
      const card = document.createElement("div");
      card.className = "poster-card";
      card.innerHTML = `
        <div class="poster-meta" style="padding:16px;">
          <p class="p-title">${t.name}</p>
          <p class="p-sub">${fmtBytes(t.size)} · ${t.download_state || (t.download_finished ? "ready" : "downloading")}</p>
        </div>`;
      card.addEventListener("click", ()=> pickFileAndPlay(t.id).catch(err=>toast(err.message,true)));
      els.libraryGrid.appendChild(card);
    });
  }catch(err){
    showBanner(err.message, true);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
els.settingsBtn.addEventListener("click", ()=>{
  els.torboxKeyInput.value = store.torboxKey;
  els.tmdbKeyInput.value = store.tmdbKey;
  els.torboxStatus.textContent = "";
  els.tmdbStatus.textContent = "";
  openModal(els.settingsModal);
});

els.testTorboxBtn.addEventListener("click", async ()=>{
  const prev = store.torboxKey;
  store.torboxKey = els.torboxKeyInput.value.trim();
  els.torboxStatus.textContent = "Checking…";
  els.torboxStatus.className = "key-status";
  try{
    const me = await torboxMe();
    els.torboxStatus.textContent = `Connected${me?.email ? " as " + me.email : ""}`;
    els.torboxStatus.className = "key-status ok";
  }catch(err){
    els.torboxStatus.textContent = err.message;
    els.torboxStatus.className = "key-status fail";
    store.torboxKey = prev;
  }
});

els.testTmdbBtn.addEventListener("click", async ()=>{
  const prev = store.tmdbKey;
  store.tmdbKey = els.tmdbKeyInput.value.trim();
  els.tmdbStatus.textContent = "Checking…";
  els.tmdbStatus.className = "key-status";
  try{
    await tmdbSearch("inception", "movie");
    els.tmdbStatus.textContent = "Connected";
    els.tmdbStatus.className = "key-status ok";
  }catch(err){
    els.tmdbStatus.textContent = err.message;
    els.tmdbStatus.className = "key-status fail";
    store.tmdbKey = prev;
  }
});

els.saveSettingsBtn.addEventListener("click", ()=>{
  store.torboxKey = els.torboxKeyInput.value.trim();
  store.tmdbKey = els.tmdbKeyInput.value.trim();
  closeModal(els.settingsModal);
  toast("Settings saved.");
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(function boot(){
  if(!store.torboxKey || !store.tmdbKey){
    showBanner("Add your TorBox and TMDB API keys in Settings (gear icon, top right) to get started.");
  }
})();
