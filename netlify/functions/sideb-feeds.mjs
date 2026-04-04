const RSS_TO_JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

const LOCAL_SCENE_FEEDS = [
  {
    label: "pinoy rap wire",
    sourceUrl: "https://news.google.com/",
    feedUrl: "https://news.google.com/rss/search?q=%22Pinoy+rap%22+OR+%22Pinoy+hip-hop%22"
  },
  {
    label: "filipino hip-hop",
    sourceUrl: "https://news.google.com/",
    feedUrl: "https://news.google.com/rss/search?q=%22Filipino+hip-hop%22+OR+%22Philippine+hip-hop%22"
  },
  {
    label: "opm rap",
    sourceUrl: "https://news.google.com/",
    feedUrl: "https://news.google.com/rss/search?q=%22OPM+rap%22+OR+%22Filipino+rap%22"
  }
];

const INTERNATIONAL_FEEDS = [
  {
    label: "okayplayer",
    sourceUrl: "https://www.okayplayer.com/music",
    feedUrl: "https://news.google.com/rss/search?q=site:okayplayer.com%20hip-hop%20OR%20rap"
  },
  {
    label: "underground hip hop blog",
    sourceUrl: "https://undergroundhiphopblog.com/",
    feedUrl: "https://news.google.com/rss/search?q=site:undergroundhiphopblog.com%20hip-hop%20OR%20rap"
  },
  {
    label: "bandcamp daily",
    sourceUrl: "https://daily.bandcamp.com/genres/hip-hop-rap",
    feedUrl: "https://news.google.com/rss/search?q=site:daily.bandcamp.com%20hip-hop%20OR%20rap"
  }
];

function trimText(text, limit = 140) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 1).trimEnd()}…`;
}

function stripHtml(text) {
  return String(text).replace(/<[^>]*>/g, " ");
}

function extractImage(item) {
  const thumbnail = item?.thumbnail;
  if (typeof thumbnail === "string" && thumbnail.trim()) {
    return thumbnail.trim();
  }

  const enclosureLink = item?.enclosure?.link;
  if (typeof enclosureLink === "string" && enclosureLink.trim()) {
    return enclosureLink.trim();
  }

  const html = String(item?.description || item?.content || "");
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

async function fetchFeed(feed, maxItemsPerFeed = 1) {
  const response = await fetch(`${RSS_TO_JSON}${encodeURIComponent(feed.feedUrl)}`);
  if (!response.ok) {
    throw new Error(`Feed request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "ok" || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("Feed payload was not usable.");
  }

  return payload.items.slice(0, maxItemsPerFeed).map((item) => ({
    label: feed.label,
    title: item?.title ?? `Open ${feed.label}`,
    summary: trimText(stripHtml(item?.description ?? item?.content ?? "No summary available.")),
    link: item?.link ?? feed.sourceUrl,
    image: extractImage(item)
  }));
}

async function collect(feeds, { maxItems = feeds.length, maxItemsPerFeed = 1 } = {}) {
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed, maxItemsPerFeed)));
  return results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.title === item.title) === index)
    .slice(0, maxItems);
}

export default async function handler() {
  try {
    const [localScene, international] = await Promise.all([
      collect(LOCAL_SCENE_FEEDS, { maxItems: 3, maxItemsPerFeed: 1 }),
      collect(INTERNATIONAL_FEEDS, { maxItems: 3, maxItemsPerFeed: 1 })
    ]);

    return new Response(JSON.stringify({ localScene, international }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      localScene: [],
      international: [],
      error: error instanceof Error ? error.message : "Unknown feed error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
