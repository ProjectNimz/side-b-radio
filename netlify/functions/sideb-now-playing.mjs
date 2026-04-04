const SOURCE_URL = "https://manilasoundradio.com/.netlify/functions/now-playing";

export default async function handler() {
  try {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Now playing request failed: ${response.status}`);
    }

    const payload = await response.json();

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=15"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown now playing error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
