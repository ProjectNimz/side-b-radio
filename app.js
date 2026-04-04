const STREAM_URL = "https://stream.manilasoundradio.com/listen/manila-sound-radio/radio.mp3";
const NOW_PLAYING_URL = "/.netlify/functions/sideb-now-playing";
const NOW_PLAYING_REFRESH_MS = 30000;
const LOCAL_FEED_FALLBACK_IMAGE = "https://images.pexels.com/photos/36422833/pexels-photo-36422833.jpeg?auto=compress&cs=tinysrgb&w=1200";
const INTERNATIONAL_FEED_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80";

const audio = document.getElementById("streamAudio");
const playToggle = document.getElementById("transmissionToggle");
const playToggleIcon = document.querySelector("#transmissionToggle .live-icon");
const playToggleLabel = document.querySelector("#transmissionToggle .live-label");
const vinylStage = document.getElementById("vinylStage");
const deckCoverArt = document.getElementById("deckCoverArt");
const playerLine = document.getElementById("playerLine");
const trackTitle = document.getElementById("trackTitle");
const trackBlurb = document.getElementById("trackBlurb");
const transmissionLine = document.getElementById("transmissionLine");
const deckStateCopy = document.getElementById("deckStateCopy");
const recentlyPlayedList = document.getElementById("recentlyPlayedList");
const localSceneGrid = document.getElementById("localSceneGrid");
const internationalSceneGrid = document.getElementById("internationalSceneGrid");

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

function renderFeedFallback(container, sourceLabel, sourceUrl, message) {
  if (!container) return;
  container.innerHTML = `
    <article class="signal-feed-item">
      <span class="signal-feed-source">${escapeHtml(sourceLabel)}</span>
      <a href="${escapeHtml(sourceUrl)}" class="signal-feed-link" target="_blank" rel="noopener noreferrer">${escapeHtml(message)}</a>
    </article>
  `;
}

function renderRecentlyPlayed(items) {
  if (!recentlyPlayedList) return;

  if (!Array.isArray(items) || items.length === 0) {
    recentlyPlayedList.innerHTML = `<p class="signal-feed-empty">Waiting on the latest cuts from the live signal.</p>`;
    return;
  }

  recentlyPlayedList.innerHTML = items.slice(0, 5).map((item, index) => `
    <article class="recently-played-item">
      <span class="recently-played-kicker">${index === 0 ? "now" : `spin ${index + 1}`}</span>
      <strong class="recently-played-title">${escapeHtml(item.title)}</strong>
      <span class="recently-played-artist">${escapeHtml(item.artist)}</span>
    </article>
  `).join("");
}

function normalizeRecentTracks(payload) {
  const tracks = [];
  const seen = new Set();

  const pushTrack = (song) => {
    const title = song?.title?.trim();
    const artist = song?.artist?.trim();
    if (!title && !artist) return;

    const key = `${artist || ""}__${title || ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tracks.push({
      title: title || "Untitled cut",
      artist: artist || "Unknown Artist"
    });
  };

  pushTrack(payload?.now_playing?.song);

  if (Array.isArray(payload?.song_history)) {
    payload.song_history.forEach((entry) => pushTrack(entry?.song));
  }

  return tracks.slice(0, 5);
}

function renderLocalScene(items) {
  renderEditorialScene(localSceneGrid, items, LOCAL_FEED_FALLBACK_IMAGE);
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
        <a href="${escapeHtml(item.link)}" class="text-link" target="_blank" rel="noopener noreferrer">Open story</a>
      </div>
    </article>
  `).join("");
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

function renderInternationalScene(items) {
  renderEditorialScene(internationalSceneGrid, items, INTERNATIONAL_FEED_FALLBACK_IMAGE);
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
        <a href="${escapeHtml(item.url)}" class="text-link" target="_blank" rel="noopener noreferrer">Open source</a>
      </div>
    </article>
  `).join("");
}

function applyNowPlayingCopy(song) {
  const title = song?.title?.trim() || "Live stream on air";
  const artist = song?.artist?.trim() || "Unknown Artist";
  const art = song?.art || song?.artFallback || "images/side-b-official-logo.png";

  latestNowPlaying = { title, artist, art };

  if (playerLine) {
    playerLine.textContent = "Now playing from Manila Sound Radio.";
  }
  if (trackTitle) {
    trackTitle.textContent = title;
  }
  if (trackBlurb) {
    trackBlurb.textContent = `Artist: ${artist}`;
  }
  if (deckCoverArt) {
    deckCoverArt.src = art;
    deckCoverArt.alt = `${title} cover art`;
  }
  if (deckStateCopy) {
    deckStateCopy.textContent = `${artist} is currently in the deck.`;
  }
  if (transmissionLine) {
    transmissionLine.textContent = `${artist} | ${title}`;
  }
}

async function refreshNowPlaying() {
  try {
    const response = await fetch(`${NOW_PLAYING_URL}?t=${Date.now()}`);
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const song = payload?.now_playing?.song;
    if (song?.title || song?.artist) {
      applyNowPlayingCopy(song);
    }
    latestRecentlyPlayed = normalizeRecentTracks(payload);
    renderRecentlyPlayed(latestRecentlyPlayed);
  } catch {
    // Keep the current display if metadata blips temporarily.
  }
}

async function loadAutoFeeds() {
  if (!localSceneGrid && !internationalSceneGrid) {
    return;
  }
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
  } catch (_error) {
    renderLocalSceneFallback();
    renderInternationalFallback();
  }
}

function setStoppedState() {
  isPlaying = false;
  if (vinylStage) {
    vinylStage.classList.remove("is-spinning");
  }
  if (playToggleLabel) {
    playToggleLabel.textContent = "Play Transmission";
  }
  if (playToggleIcon) {
    playToggleIcon.textContent = "▶";
  }
  if (deckStateCopy) {
    deckStateCopy.textContent = latestNowPlaying?.artist
      ? `${latestNowPlaying.artist} is currently in the deck.`
      : "Preview mode loaded for the next host drop.";
  }
  if (transmissionLine) {
    transmissionLine.textContent = latestNowPlaying?.title && latestNowPlaying?.artist
      ? `${latestNowPlaying.artist} | ${latestNowPlaying.title}`
      : "Waiting on artist | track...";
  }
  if (!latestNowPlaying && recentlyPlayedList) {
    renderRecentlyPlayed([]);
  }
}

function setPlayingState() {
  isPlaying = true;
  if (vinylStage) {
    vinylStage.classList.add("is-spinning");
  }
  if (playToggleLabel) {
    playToggleLabel.textContent = "Pause Transmission";
  }
  if (playToggleIcon) {
    playToggleIcon.textContent = "||";
  }
  if (playerLine) {
    playerLine.textContent = "Live stream connected.";
  }
  if (trackTitle && !latestNowPlaying?.title) {
    trackTitle.textContent = "Loading current track...";
  }
  if (trackBlurb && !latestNowPlaying?.artist) {
    trackBlurb.textContent = "Pulling the current song and artist from Manila Sound Radio.";
  }
  if (deckCoverArt && !latestNowPlaying?.art) {
    deckCoverArt.src = "images/side-b-official-logo.png";
    deckCoverArt.alt = "Side B Radio cover art fallback";
  }
  if (deckStateCopy) {
    deckStateCopy.textContent = latestNowPlaying?.artist
      ? `${latestNowPlaying.artist} is currently in the deck.`
      : "Deck active. The shell is behaving like a live broadcast.";
  }
  if (transmissionLine) {
    transmissionLine.textContent = latestNowPlaying?.title && latestNowPlaying?.artist
      ? `${latestNowPlaying.artist} | ${latestNowPlaying.title}`
      : "Loading artist | track...";
  }
}

function setDemoCopy(active) {
  if (latestNowPlaying?.title || latestNowPlaying?.artist) {
    applyNowPlayingCopy(latestNowPlaying);
    return;
  }
  if (playerLine) {
    playerLine.textContent = active
      ? "Demo spin active while the stream host gets sorted out."
      : "The deck is built and waiting for your future Side B stream.";
  }
  if (trackTitle) {
    trackTitle.textContent = active ? "Record spinning in preview mode" : "Needle up. Signal pending.";
  }
  if (trackBlurb) {
    trackBlurb.textContent = active
      ? "The deck is visually live now. Drop in the real stream later and this turns into a proper broadcast block."
      : "Preview mode is live for now. Once the stream host is ready, this deck flips into broadcast.";
  }
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

  if (!audio.src) {
    audio.src = STREAM_URL;
  }

  if (isPlaying) {
    audio.pause();
    setStoppedState();
    if (playerLine) {
      playerLine.textContent = "Deck paused.";
    }
    if (trackTitle) {
      trackTitle.textContent = latestNowPlaying?.title || "Needle up. Signal pending.";
    }
    if (trackBlurb) {
      trackBlurb.textContent = latestNowPlaying?.artist
        ? `Artist: ${latestNowPlaying.artist}`
        : "Preview mode is live for now. Once the stream host is ready, this deck flips into broadcast.";
    }
    if (deckStateCopy) {
      deckStateCopy.textContent = latestNowPlaying?.artist
        ? `${latestNowPlaying.artist} is currently in the deck.`
        : "Playback paused. The shell is ready for the next spin.";
    }
  if (transmissionLine) {
    transmissionLine.textContent = latestNowPlaying?.title && latestNowPlaying?.artist
      ? `${latestNowPlaying.artist} | ${latestNowPlaying.title}`
      : "Waiting on artist | track...";
    }
    return;
  }

  try {
    await audio.play();
    demoMode = false;
    setPlayingState();
    await refreshNowPlaying();
  } catch (_error) {
    demoMode = true;
    setPlayingState();
    setDemoCopy(true);
  }
}

if (playToggle) {
  playToggle.addEventListener("click", togglePlayback);
}
audio.addEventListener("pause", () => {
  if (!demoMode) {
    setStoppedState();
  }
});
audio.addEventListener("ended", setStoppedState);

setDemoCopy(false);
refreshNowPlaying();
setInterval(refreshNowPlaying, NOW_PLAYING_REFRESH_MS);
loadAutoFeeds();
