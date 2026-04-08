const STREAM_URL = "https://stream.manilasoundradio.com/listen/sideb/radio.mp3";
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

function extractStreamTitle(metadataText) {
  const match = metadataText.match(/StreamTitle='([^']*)'/i);
  if (!match) return "";
  return match[1].replace(/\0/g, "").trim();
}

function splitArtistAndTitle(streamTitle) {
  if (!streamTitle) {
    return { artist: "Side B Radio", title: "Live stream on air" };
  }

  const separators = [" - ", " | "];
  for (const separator of separators) {
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

    const metaIntHeader = response.headers.get("icy-metaint");
    const metaInt = Number.parseInt(metaIntHeader || "", 10);
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

export default async function handler() {
  try {
    const payload = await readIcyMetadata();

    return new Response(JSON.stringify(payload), {
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
