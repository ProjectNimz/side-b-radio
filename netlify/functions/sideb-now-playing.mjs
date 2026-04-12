const STREAM_URL = "https://stream.manilasoundradio.com/listen/sideb/radio.mp3";
const AZURACAST_NOW_PLAYING_URLS = [
  "https://stream.manilasoundradio.com/api/nowplaying/sideb",
  "https://stream.manilasoundradio.com/api/nowplaying/side-b-radio"
];
const FALLBACK_ART = "/images/side-b-official-logo.png";
const REQUEST_TIMEOUT_MS = 15000;

function buildPayload(title = "Live stream on air", artist = "Side B Radio") {
  return {
    now_playing: {
      song: {
        title,
        artist,
        art: FALLBACK_ART,
        artFallback: FALLBACK_ART
      }
    },
    song_history: []
  };
}

function normalizeSong(song) {
  return {
    title: song?.title || "Live stream on air",
    artist: song?.artist || "Side B Radio",
    art: song?.art || FALLBACK_ART,
    artFallback: song?.art || song?.artFallback || FALLBACK_ART
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (!entry?.song) return null;

      return {
        ...entry,
        song: normalizeSong(entry.song)
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SideBRadioNowPlaying/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractStreamTitle(metadataText) {
  const marker = "StreamTitle='";
  const startIndex = metadataText.indexOf(marker);
  if (startIndex < 0) return "";

  const valueStart = startIndex + marker.length;
  const endIndex = metadataText.lastIndexOf("';");
  if (endIndex <= valueStart) return "";

  return metadataText.slice(valueStart, endIndex).replace(/\0/g, "").trim();
}

function splitArtistAndTitle(streamTitle) {
  if (!streamTitle) {
    return { artist: "Side B Radio", title: "Live stream on air" };
  }

  for (const separator of [" - ", " | "]) {
    const index = streamTitle.indexOf(separator);
    if (index > 0) {
      return {
        artist: streamTitle.slice(0, index).trim() || "Side B Radio",
        title: streamTitle.slice(index + separator.length).trim() || streamTitle
      };
    }
  }

  return {
    artist: "Side B Radio",
    title: streamTitle
  };
}

function decodeChunks(chunks, totalLength) {
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

async function readIcyMetadata() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(STREAM_URL, {
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "SideBRadioNowPlaying/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Stream request failed: ${response.status}`);
    }

    const metaInt = Number.parseInt(response.headers.get("icy-metaint") || "", 10);
    if (!Number.isFinite(metaInt) || metaInt <= 0 || !response.body) {
      return buildPayload();
    }

    const reader = response.body.getReader();
    let bytesUntilMetadata = metaInt;
    let metadataBytesRemaining = null;
    let metadataChunks = [];
    let metadataLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let offset = 0;
      while (offset < value.length) {
        if (bytesUntilMetadata > 0) {
          const consume = Math.min(bytesUntilMetadata, value.length - offset);
          bytesUntilMetadata -= consume;
          offset += consume;
          continue;
        }

        if (metadataBytesRemaining === null) {
          metadataBytesRemaining = value[offset] * 16;
          metadataLength = metadataBytesRemaining;
          metadataChunks = [];
          offset += 1;

          if (metadataBytesRemaining === 0) {
            bytesUntilMetadata = metaInt;
            metadataBytesRemaining = null;
          }
          continue;
        }

        const consume = Math.min(metadataBytesRemaining, value.length - offset);
        metadataChunks.push(value.subarray(offset, offset + consume));
        metadataBytesRemaining -= consume;
        offset += consume;

        if (metadataBytesRemaining === 0) {
          const metadataText = decodeChunks(metadataChunks, metadataLength);
          const streamTitle = extractStreamTitle(metadataText);
          const { artist, title } = splitArtistAndTitle(streamTitle);

          await reader.cancel();
          return buildPayload(title, artist);
        }
      }
    }

    return buildPayload();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAzuraCastNowPlaying() {
  let lastError = null;

  for (const url of AZURACAST_NOW_PLAYING_URLS) {
    try {
      const payload = await fetchJson(url);
      const song = normalizeSong(payload?.now_playing?.song || {});

      return {
        now_playing: { song },
        song_history: normalizeHistory(payload?.song_history)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load Side B now-playing data.");
}

export default async function handler() {
  try {
    const payload = await fetchAzuraCastNowPlaying();

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=15"
      }
    });
  } catch {
    try {
      const fallbackPayload = await readIcyMetadata();

      return new Response(JSON.stringify(fallbackPayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=15"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        ...buildPayload(),
        error: error instanceof Error ? error.message : "Unknown now playing error"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }
  }
}
