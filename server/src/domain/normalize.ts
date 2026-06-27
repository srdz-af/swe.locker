export const LOCAL_OWNER_KEY = "local";
export const SIMPLIFY_SOURCE_KEY = "simplifyjobs-summer-internships";

const metadataMarkers = ["🛂", "🇺🇸", "🔒", "🔥", "🎓"];

export function stripMetadataMarkers(value: string) {
  return metadataMarkers.reduce((text, marker) => text.replaceAll(marker, ""), value).trim();
}

export function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCompanyName(value: string) {
  return compactWhitespace(stripMetadataMarkers(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeSearchText(value: string) {
  return compactWhitespace(stripMetadataMarkers(value)).toLowerCase();
}

export function normalizeLocation(value: string) {
  return compactWhitespace(value).toLowerCase();
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "ref") {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function buildPostingKey(input: {
  season: string;
  category: string;
  company: string;
  role: string;
  locations: string[];
  primaryApplicationUrl: string | null;
}) {
  const locationKey = input.locations.map(normalizeLocation).sort().join(",");
  const urlKey = input.primaryApplicationUrl ? canonicalizeUrl(input.primaryApplicationUrl) : "";
  return [
    normalizeSearchText(input.season),
    normalizeSearchText(input.category),
    normalizeCompanyName(input.company),
    normalizeSearchText(input.role),
    locationKey,
    urlKey
  ].join("::");
}
