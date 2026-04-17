const STREAM_URL = "https://stream.manilasoundradio.com/listen/sideb/radio.mp3";
const NOW_PLAYING_URL = "/.netlify/functions/sideb-now-playing";
const NOW_PLAYING_REFRESH_MS = 30000;
const LOCAL_FEED_FALLBACK_IMAGE = "https://images.pexels.com/photos/36422833/pexels-photo-36422833.jpeg?auto=compress&cs=tinysrgb&w=1200";
const INTERNATIONAL_FEED_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80";
const STATION_TIMEZONE = "Asia/Manila";
const PROGRAM_SCHEDULE = [
  { start: 1, end: 6, label: "AFTER HOURS" },
  { start: 6, end: 10, label: "MORNING SIGNAL" },
  { start: 10, end: 16, label: "MIDDAY RUN" },
  { start: 16, end: 21, label: "PRIME TIME" },
  { start: 21, end: 24, label: "NIGHT SHIFT" },
  { start: 0, end: 1, label: "NIGHT SHIFT" }
];

const audio = document.getElementById("streamAudio");
const playToggle = document.getElementById("transmissionToggle");
const playToggleIcon = document.querySelector("#transmissionToggle .live-icon");
const playToggleLabel = document.querySelector("#transmissionToggle .live-label");
const transmissionLine = document.getElementById("transmissionLine");
const mobilePlayerCard = document.querySelector(".mobile-player-card");
const mobilePlayToggle = document.getElementById("mobilePlayerToggle");
const mobilePlayToggleIcon = document.querySelector(".mobile-player-toggle-icon");
const mobilePlayerArtist = document.getElementById("mobilePlayerArtist");
const mobilePlayerTitle = document.getElementById("mobilePlayerTitle");
const mobilePlayerArt = document.getElementById("mobilePlayerArt");
const recentlyPlayedLists = [
  document.getElementById("recentlyPlayedList"),
  document.getElementById("recentlyPlayedListMobile")
].filter(Boolean);
const localSceneGrid = document.getElementById("localSceneGrid");
const internationalSceneGrid = document.getElementById("internationalSceneGrid");
const collapsibleModules = Array.from(document.querySelectorAll("[data-collapsible]"));
const mobileSectionMedia = window.matchMedia("(max-width: 640px)");

function ensureAudioSource() {
  if (!audio) return false;
  if (audio.getAttribute("src") !== STREAM_URL) {
    audio.src = STREAM_URL;
  }
  return true;
}

function primeAudioConnection() {
  if (!ensureAudioSource()) return;
  if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
    audio.load();
  }
}

let isPlaying = false;
let demoMode = true;
let latestNowPlaying = null;
let latestRecentlyPlayed = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRecentlyPlayed(items) {
  if (recentlyPlayedLists.length === 0) return;

  if (!Array.isArray(items) || items.length === 0) {
    recentlyPlayedLists.forEach((list) => {
      list.innerHTML = "";
    });
    return;
  }

  const markup = items.slice(0, 5).map((item, index) => `
      <article class="recently-played-item">
        <span class="recently-played-kicker">${index === 0 ? "now" : `spin ${index + 1}`}</span>
        <strong class="recently-played-title">${escapeHtml(item.title)}</strong>
        <span class="recently-played-artist">${escapeHtml(item.artist)}</span>
      </article>
    `).join("");

  recentlyPlayedLists.forEach((list) => {
    list.innerHTML = markup;
  });
}

function toTrackEntry(song) {
  const title = song?.title?.trim();
  const artist = song?.artist?.trim();
  if (!title && !artist) return null;

  return {
    title: title || "Untitled cut",
    artist: artist || "Unknown Artist"
  };
}

function getTrackKey(track) {
  return `${track?.artist || ""}__${track?.title || ""}`.trim().toLowerCase();
}

function buildRecentTracks(song, historyEntries = []) {
  const tracks = [];
  const seen = new Set();

  const pushTrack = (value) => {
    const track = toTrackEntry(value);
    if (!track) return;

    const key = getTrackKey(track);
    if (!key || seen.has(key)) return;
    seen.add(key);
    tracks.push(track);
  };

  pushTrack(song);

  if (Array.isArray(historyEntries)) {
    historyEntries.forEach((entry) => pushTrack(entry?.song));
  }

  return tracks.slice(0, 5);
}

function renderEditorialScene(container, items, fallbackImage) {
  if (!container) return;

  container.innerHTML = items.slice(0, 3).map((item) => `
    <article class="local-scene-card">
      <div class="local-scene-media ${item.image ? "" : "local-scene-media-placeholder"}">
        <img
          src="${escapeHtml(item.image || fallbackImage)}"
          alt="${escapeHtml(item.title)}"
          class="${item.image ? "" : "feed-fallback-image"}">
      </div>
      <div class="local-scene-copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <a href="${escapeHtml(item.link)}" class="text-link" target="_blank" rel="noopener noreferrer">Read more</a>
      </div>
    </article>
  `).join("");
}

function renderEditorialFallback(container, items, fallbackImage) {
  if (!container) return;

  container.innerHTML = items.map((item) => `
    <article class="local-scene-card">
      <div class="local-scene-media local-scene-media-placeholder">
        <img
          src="${escapeHtml(fallbackImage)}"
          alt="${escapeHtml(item.title)}"
          class="feed-fallback-image">
      </div>
      <div class="local-scene-copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.text)}</p>
        <a href="${escapeHtml(item.url)}" class="text-link" target="_blank" rel="noopener noreferrer">Read more</a>
      </div>
    </article>
  `).join("");
}

function renderLocalScene(items) {
  renderEditorialScene(localSceneGrid, items, LOCAL_FEED_FALLBACK_IMAGE);
}

function renderInternationalScene(items) {
  renderEditorialScene(internationalSceneGrid, items, INTERNATIONAL_FEED_FALLBACK_IMAGE);
}

function renderLocalSceneFallback() {
  renderEditorialFallback(localSceneGrid, [
    {
      title: "The local scene feed is taking a breath right now.",
      text: "The board will refill once the source signals come through again.",
      url: "https://news.google.com/search?q=Pinoy%20rap"
    },
    {
      title: "Waiting on the second source card.",
      text: "The row holds three editorial slots, so this will fill once the other source signals land.",
      url: "https://news.google.com/search?q=Filipino%20hip-hop"
    },
    {
      title: "Waiting on the third source card.",
      text: "This card is reserved for another underground feed so the board stays balanced even before the live pull hits.",
      url: "https://news.google.com/search?q=OPM%20rap"
    }
  ], LOCAL_FEED_FALLBACK_IMAGE);
}

function renderInternationalFallback() {
  renderEditorialFallback(internationalSceneGrid, [
    {
      title: "The international feed is taking a breath right now.",
      text: "The board will refill once the outside signal starts landing again.",
      url: "https://news.google.com/search?q=hip-hop"
    },
    {
      title: "Waiting on the second source card.",
      text: "This slot is reserved for another underground source once the feed signal catches up.",
      url: "https://news.google.com/search?q=underground%20hip-hop"
    },
    {
      title: "Waiting on the third source card.",
      text: "The international row stays balanced with three editorial cards even before the live pull fills out.",
      url: "https://news.google.com/search?q=indie%20rap"
    }
  ], INTERNATIONAL_FEED_FALLBACK_IMAGE);
}

function getStationHour(date = new Date()) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TIMEZONE,
    hour: "2-digit",
    hour12: false
  }).format(date);

  return Number.parseInt(value, 10);
}

function getCurrentProgramLabel(date = new Date()) {
  const hour = getStationHour(date);
  return PROGRAM_SCHEDULE.find(({ start, end }) => hour >= start && hour < end)?.label || "SIDE B SIGNAL";
}

function syncProgramLabel() {
  if (playToggleLabel) {
    playToggleLabel.textContent = getCurrentProgramLabel();
  }
}

function formatTransmissionLine(song = latestNowPlaying) {
  const title = song?.title?.trim();
  const artist = song?.artist?.trim();

  if (artist && title) return `${artist} | ${title}`;
  if (artist) return artist;
  if (title) return title;

  return "Waiting on artist | track...";
}

function syncMobilePlayer(song = latestNowPlaying) {
  const title = song?.title?.trim() || "Waiting on track...";
  const artist = song?.artist?.trim() || "Unknown Artist";
  const art = song?.art || song?.artFallback || "images/side-b-official-logo.png";

  if (mobilePlayerArtist) {
    mobilePlayerArtist.textContent = artist;
  }

  if (mobilePlayerTitle) {
    mobilePlayerTitle.textContent = title;
  }

  if (mobilePlayerArt) {
    mobilePlayerArt.src = art;
    mobilePlayerArt.alt = `${artist} - ${title}`;
  }
}

function applyNowPlayingCopy(song) {
  const title = song?.title?.trim() || "Live stream on air";
  const artist = song?.artist?.trim() || "Unknown Artist";
  const art = song?.art || song?.artFallback || "images/side-b-official-logo.png";

  latestNowPlaying = { title, artist, art };

  if (transmissionLine) {
    transmissionLine.textContent = formatTransmissionLine(latestNowPlaying);
  }

  syncMobilePlayer(latestNowPlaying);
}

async function refreshNowPlaying() {
  try {
    const response = await fetch(`${NOW_PLAYING_URL}?t=${Date.now()}`);
    if (!response.ok) return;

    const payload = await response.json();
    const song = payload?.now_playing?.song;

    if (song?.title || song?.artist) {
      applyNowPlayingCopy(song);
    }

    latestRecentlyPlayed = buildRecentTracks(song, payload?.song_history);
    renderRecentlyPlayed(latestRecentlyPlayed);
  } catch {
    // Keep current UI state if metadata blips temporarily.
  }
}

async function loadAutoFeeds() {
  if (!localSceneGrid && !internationalSceneGrid) return;

  try {
    const response = await fetch(`/.netlify/functions/sideb-feeds?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Feed proxy failed: ${response.status}`);
    }

    const payload = await response.json();

    if (Array.isArray(payload.localScene) && payload.localScene.length > 0) {
      renderLocalScene(payload.localScene);
    } else {
      renderLocalSceneFallback();
    }

    if (Array.isArray(payload.international) && payload.international.length > 0) {
      renderInternationalScene(payload.international);
    } else {
      renderInternationalFallback();
    }
  } catch {
    renderLocalSceneFallback();
    renderInternationalFallback();
  }
}

function setStoppedState() {
  isPlaying = false;
  syncProgramLabel();

  if (playToggleIcon) {
    playToggleIcon.textContent = "\u25B6";
  }

  if (transmissionLine) {
    transmissionLine.textContent = formatTransmissionLine();
  }

  if (mobilePlayToggleIcon) {
    mobilePlayToggleIcon.textContent = "\u25B6";
  }

  mobilePlayerCard?.classList.remove("is-live");

  if (!latestNowPlaying) {
    renderRecentlyPlayed([]);
  }
}

function setPlayingState() {
  isPlaying = true;
  syncProgramLabel();

  if (playToggleIcon) {
    playToggleIcon.textContent = "||";
  }

  if (transmissionLine) {
    transmissionLine.textContent = formatTransmissionLine();
  }

  if (mobilePlayToggleIcon) {
    mobilePlayToggleIcon.textContent = "||";
  }

  mobilePlayerCard?.classList.add("is-live");
}

function setDemoCopy(active) {
  syncProgramLabel();

  if (latestNowPlaying?.title || latestNowPlaying?.artist) {
    applyNowPlayingCopy(latestNowPlaying);
    return;
  }

  if (transmissionLine) {
    transmissionLine.textContent = active
      ? "Preview signal active while the live stream settles in."
      : "Waiting on artist | track...";
  }

  syncMobilePlayer(latestNowPlaying);
}

async function togglePlayback() {
  if (!STREAM_URL) {
    demoMode = true;

    if (isPlaying) {
      setStoppedState();
      setDemoCopy(false);
      return;
    }

    setPlayingState();
    setDemoCopy(true);
    return;
  }

  primeAudioConnection();

  if (isPlaying) {
    audio.pause();
    setStoppedState();
    return;
  }

  try {
    await audio.play();
    demoMode = false;
    setPlayingState();
    await refreshNowPlaying();
  } catch {
    demoMode = true;
    setPlayingState();
    setDemoCopy(true);
  }
}

function bindPlaybackControl(control) {
  if (!control) return;
  control.addEventListener("pointerdown", primeAudioConnection, { passive: true });
  control.addEventListener("click", togglePlayback);
}

function setModuleOpenState(module, isOpen) {
  const toggle = module.querySelector(".module-toggle");
  if (!toggle) return;

  module.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.querySelector("span")?.replaceChildren(isOpen ? "Hide" : "Show");
}

function syncCollapsibleModules() {
  collapsibleModules.forEach((module) => {
    const isMobile = mobileSectionMedia.matches;

    if (!isMobile) {
      module.classList.remove("is-open");
      const toggle = module.querySelector(".module-toggle");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "true");
        toggle.querySelector("span")?.replaceChildren("Show");
      }
      return;
    }

    const shouldOpen = module.classList.contains("is-open");
    setModuleOpenState(module, shouldOpen);
  });
}

collapsibleModules.forEach((module) => {
  const toggle = module.querySelector(".module-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    if (!mobileSectionMedia.matches) return;
    setModuleOpenState(module, !module.classList.contains("is-open"));
  });
});

if (typeof mobileSectionMedia.addEventListener === "function") {
  mobileSectionMedia.addEventListener("change", syncCollapsibleModules);
} else if (typeof mobileSectionMedia.addListener === "function") {
  mobileSectionMedia.addListener(syncCollapsibleModules);
}

bindPlaybackControl(playToggle);
bindPlaybackControl(mobilePlayToggle);

if (audio) {
  audio.addEventListener("pause", () => {
    if (!demoMode) {
      setStoppedState();
    }
  });
  audio.addEventListener("ended", setStoppedState);
}

syncProgramLabel();
setDemoCopy(false);
renderRecentlyPlayed(latestRecentlyPlayed);
syncCollapsibleModules();
refreshNowPlaying();
setInterval(refreshNowPlaying, NOW_PLAYING_REFRESH_MS);
setInterval(syncProgramLabel, 60000);
loadAutoFeeds();
