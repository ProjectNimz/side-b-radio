const RSS_TO_JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

const LOCAL_SCENE_FEEDS = [
  {
    label: "rolling stone ph",
    sourceUrl: "https://rollingstonephilippines.com/music/hiphop-rnb/",
    feedUrl: "https://news.google.com/rss/search?q=site:rollingstonephilippines.com%20(%22hip-hop%22%20OR%20rap%20OR%20rapper)"
  },
  {
    label: "billboard ph",
    sourceUrl: "https://billboardphilippines.com/",
    feedUrl: "https://news.google.com/rss/search?q=site:billboardphilippines.com%20(%22pinoy%20hip-hop%22%20OR%20%22filipino%20rap%22%20OR%20rapper)"
  },
  {
    label: "bandwagon",
    sourceUrl: "https://www.bandwagon.asia/",
    feedUrl: "https://news.google.com/rss/search?q=site:bandwagon.asia%20(%22filipino%20rap%22%20OR%20%22pinoy%20rap%22%20OR%20%22hip-hop%22)"
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

function normalizeWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function cleanTitle(text) {
  return normalizeWhitespace(String(text)
    .replace(/\s+[|\-–—]\s+(Rolling Stone Philippines|Billboard Philippines|Bandwagon|Okayplayer|UndergroundHipHopBlog(?:\.com)?|Bandcamp Daily)$/i, "")
    .replace(/\s+[|\-–—]\s+Google News$/i, ""));
}

function isMostlyLatin(text) {
  const sample = normalizeWhitespace(text);
  if (!sample) {
    return false;
  }

  let latinLike = 0;
  for (const char of sample) {
    if (/[\u0000-\u024F]/.test(char)) {
      latinLike += 1;
    }
  }

  return latinLike / sample.length >= 0.85;
}

function hasBlockedTerms(text) {
  const sample = normalizeWhitespace(text).toLowerCase();
  const blocked = [
    "ministry of foreign affairs",
    "republic of belarus",
    "министерство",
    "республики",
    "spotify hits philippines linked internet page",
    "linked internet page"
  ];

  return blocked.some((term) => sample.includes(term));
}

function isUsableItem(item) {
  const title = cleanTitle(item?.title ?? "");
  const summary = normalizeWhitespace(stripHtml(item?.description ?? item?.content ?? ""));
  const combined = `${title} ${summary}`;

  if (!title) {
    return false;
  }

  if (!isMostlyLatin(combined)) {
    return false;
  }

  if (hasBlockedTerms(combined)) {
    return false;
  }

  return true;
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

  return payload.items
    .filter(isUsableItem)
    .slice(0, maxItemsPerFeed)
    .map((item) => ({
      label: feed.label,
      title: cleanTitle(item?.title ?? `Open ${feed.label}`),
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
