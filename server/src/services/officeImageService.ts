type DuckDuckGoImageResult = {
  height?: number;
  image?: string;
  source?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
  width?: number;
};

type OfficeImageDto = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  width: number | null;
  height: number | null;
};

type OfficeImageSearchDto = {
  query: string;
  searchUrl: string;
  images: OfficeImageDto[];
};

const officeImageCache = new Map<string, Promise<OfficeImageSearchDto>>();
const cacheLimit = 100;
const resultLimit = 6;

export async function searchOfficeImages(input: { company: string; location?: string | null }): Promise<OfficeImageSearchDto> {
  const query = buildOfficeImageQuery(input.company, input.location);
  const cachedSearch = officeImageCache.get(query);

  if (cachedSearch) {
    return cachedSearch;
  }

  const search = fetchOfficeImages(query).catch(() => ({
    query,
    searchUrl: getDuckDuckGoImageSearchUrl(query),
    images: []
  }));

  officeImageCache.set(query, search);
  trimCache();

  return search;
}

export function buildOfficeImageQuery(company: string, location?: string | null) {
  return [company, "offices", location].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function fetchOfficeImages(query: string): Promise<OfficeImageSearchDto> {
  const searchUrl = getDuckDuckGoImageSearchUrl(query);
  const searchResponse = await fetch(searchUrl, {
    headers: getSearchHeaders()
  });

  if (!searchResponse.ok) {
    return { query, searchUrl, images: [] };
  }

  const searchHtml = await searchResponse.text();
  const vqd = extractDuckDuckGoToken(searchHtml);

  if (!vqd) {
    return { query, searchUrl, images: [] };
  }

  const imageSearchUrl = new URL("https://duckduckgo.com/i.js");
  imageSearchUrl.searchParams.set("l", "us-en");
  imageSearchUrl.searchParams.set("o", "json");
  imageSearchUrl.searchParams.set("q", query);
  imageSearchUrl.searchParams.set("vqd", vqd);
  imageSearchUrl.searchParams.set("f", ",,,");
  imageSearchUrl.searchParams.set("p", "1");

  const imageResponse = await fetch(imageSearchUrl, {
    headers: {
      ...getSearchHeaders(),
      Referer: searchUrl
    }
  });

  if (!imageResponse.ok) {
    return { query, searchUrl, images: [] };
  }

  const payload = (await imageResponse.json()) as { results?: DuckDuckGoImageResult[] };

  return {
    query,
    searchUrl,
    images: (payload.results ?? []).map(toOfficeImageDto).filter((image): image is OfficeImageDto => Boolean(image)).slice(0, resultLimit)
  };
}

function getDuckDuckGoImageSearchUrl(query: string) {
  const searchUrl = new URL("https://duckduckgo.com/");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("iax", "images");
  searchUrl.searchParams.set("ia", "images");
  return searchUrl.toString();
}

function extractDuckDuckGoToken(html: string) {
  return html.match(/vqd=["']?([^"'&]+)["']?/)?.[1] ?? null;
}

function toOfficeImageDto(result: DuckDuckGoImageResult) {
  if (!isHttpUrl(result.image)) {
    return null;
  }

  return {
    title: result.title?.trim() || "Office image",
    imageUrl: result.image,
    thumbnailUrl: isHttpUrl(result.thumbnail) ? result.thumbnail : null,
    sourceUrl: isHttpUrl(result.url) ? result.url : null,
    sourceName: result.source?.trim() || null,
    width: Number.isFinite(result.width) ? result.width ?? null : null,
    height: Number.isFinite(result.height) ? result.height ?? null : null
  };
}

function isHttpUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function getSearchHeaders() {
  return {
    Accept: "text/html,application/json",
    "User-Agent": "Mozilla/5.0"
  };
}

function trimCache() {
  while (officeImageCache.size > cacheLimit) {
    const oldestKey = officeImageCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    officeImageCache.delete(oldestKey);
  }
}
