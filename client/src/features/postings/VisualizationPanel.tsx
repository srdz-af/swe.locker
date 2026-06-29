import { memo, useEffect, useRef, useState } from "react";
import { Button, Loading, Tile } from "@carbon/react";
import { Launch } from "@carbon/icons-react";
import maplibregl from "maplibre-gl";
import type { JobPostingDto } from "../../../../shared/src/index";
import type { ThemeMode } from "../../types/app";
import { formatDate } from "../../utils/format";
import "maplibre-gl/dist/maplibre-gl.css";

type MapCoordinates = {
  bounds?: [[number, number], [number, number]];
  longitude: number;
  latitude: number;
  label: string;
  precision: "office" | "country" | "location";
  zoom: number;
};

type NominatimFeature = {
  address?: Record<string, string | undefined>;
  boundingbox?: [string, string, string, string];
  category?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  namedetails?: Record<string, string | undefined>;
  type?: string;
};

const officeGeocodeCache = new Map<string, Promise<MapCoordinates | null>>();
const resolvedOfficeGeocodeCache = new Map<string, MapCoordinates | null>();
const locationGeocodeCache = new Map<string, Promise<MapCoordinates | null>>();
const resolvedLocationGeocodeCache = new Map<string, MapCoordinates | null>();
const worldCenter: [number, number] = [0, 20];
const nominatimSearchUrl = "https://nominatim.openstreetmap.org/search";
const countryViewports = [
  {
    aliases: ["united states", "usa", "us", "u s", "u s a"],
    bounds: [
      [-125, 24],
      [-66, 50]
    ],
    center: [-98.5, 39.8],
    label: "United States"
  },
  {
    aliases: ["canada"],
    bounds: [
      [-141, 42],
      [-52, 84]
    ],
    center: [-96, 56],
    label: "Canada"
  },
  {
    aliases: ["mexico"],
    bounds: [
      [-118, 14],
      [-86, 33]
    ],
    center: [-102, 23],
    label: "Mexico"
  },
  {
    aliases: ["united kingdom", "uk", "u k", "great britain"],
    bounds: [
      [-8.8, 49.8],
      [1.9, 60.9]
    ],
    center: [-2.5, 54.2],
    label: "United Kingdom"
  },
  {
    aliases: ["germany"],
    bounds: [
      [5.8, 47.2],
      [15.1, 55.1]
    ],
    center: [10.4, 51.2],
    label: "Germany"
  },
  {
    aliases: ["india"],
    bounds: [
      [68.1, 6.6],
      [97.4, 35.7]
    ],
    center: [78.9, 22.6],
    label: "India"
  },
  {
    aliases: ["singapore"],
    bounds: [
      [103.6, 1.16],
      [104.1, 1.48]
    ],
    center: [103.8, 1.35],
    label: "Singapore"
  },
  {
    aliases: ["australia"],
    bounds: [
      [112.9, -44],
      [154, -10]
    ],
    center: [134.5, -25.7],
    label: "Australia"
  }
] satisfies Array<{
  aliases: string[];
  bounds: [[number, number], [number, number]];
  center: [number, number];
  label: string;
}>;
const countryViewportByAlias = new Map(countryViewports.flatMap((country) => country.aliases.map((alias) => [alias, country])));
const companyTokenStopWords = new Set([
  "ag",
  "ai",
  "and",
  "bv",
  "co",
  "company",
  "corp",
  "corporation",
  "gmbh",
  "group",
  "holding",
  "holdings",
  "inc",
  "limited",
  "llc",
  "ltd",
  "plc",
  "sa",
  "the"
]);
const locationTokenStopWords = new Set(["hybrid", "office", "offices", "onsite", "remote", "states", "united", "usa"]);

function isRemoteLocation(location: string) {
  return /\b(remote|virtual|anywhere|worldwide)\b/i.test(location);
}

function getMapLocation(posting: JobPostingDto) {
  return posting.locations.find((location) => !isRemoteLocation(location));
}

function hasRemoteLocation(posting: JobPostingDto) {
  return posting.locations.some(isRemoteLocation);
}

function buildOfficeGeocodeQuery(company: string, location?: string) {
  return location ? `${company} offices, ${location}` : `${company} offices`;
}

function getOfficeGeocodeCacheKey(company: string, location?: string) {
  return buildOfficeGeocodeQuery(company, location).toLocaleLowerCase();
}

function getCachedOfficeCoordinates(company: string, location?: string) {
  if (location) {
    const countryCoordinates = getCountryCoordinates(location);

    if (countryCoordinates) {
      return countryCoordinates;
    }
  }

  const cacheKey = getOfficeGeocodeCacheKey(company, location);

  if (!resolvedOfficeGeocodeCache.has(cacheKey)) {
    return undefined;
  }

  return resolvedOfficeGeocodeCache.get(cacheKey) ?? null;
}

function getLocationCacheKey(location: string) {
  return location.toLocaleLowerCase();
}

function normalizeCountryLocation(location: string) {
  return location
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\b(remote|hybrid|onsite|office|offices|in)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getCountryCoordinates(location: string): MapCoordinates | null {
  const country = countryViewportByAlias.get(normalizeCountryLocation(location));

  if (!country) {
    return null;
  }

  return {
    bounds: country.bounds,
    latitude: country.center[1],
    longitude: country.center[0],
    label: country.label,
    precision: "country",
    zoom: 3
  };
}

function getCachedLocationCoordinates(location: string) {
  const countryCoordinates = getCountryCoordinates(location);

  if (countryCoordinates) {
    return countryCoordinates;
  }

  const cacheKey = getLocationCacheKey(location);

  if (!resolvedLocationGeocodeCache.has(cacheKey)) {
    return undefined;
  }

  return resolvedLocationGeocodeCache.get(cacheKey) ?? null;
}

function tokenizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function getCompanyTokens(company: string) {
  const tokens = tokenizeSearchText(company).filter((token) => token.length > 1 && !companyTokenStopWords.has(token));

  return tokens.length > 0 ? tokens : tokenizeSearchText(company).filter((token) => token.length > 2);
}

function getLocationTokens(location?: string) {
  if (!location) {
    return [];
  }

  return tokenizeSearchText(location).filter((token) => token.length > 2 && !locationTokenStopWords.has(token));
}

function getFeatureSearchText(feature: NominatimFeature) {
  return [
    feature.name,
    feature.display_name,
    ...Object.values(feature.address ?? {}),
    ...Object.values(feature.namedetails ?? {})
  ]
    .filter(Boolean)
    .join(" ");
}

function doesFeatureMatchCompany(feature: NominatimFeature, company: string) {
  const companyTokens = getCompanyTokens(company);

  if (companyTokens.length === 0) {
    return false;
  }

  const featureTokens = new Set(tokenizeSearchText(getFeatureSearchText(feature)));
  const matchCount = companyTokens.filter((token) => featureTokens.has(token)).length;
  const requiredMatches = companyTokens.length === 1 ? 1 : Math.min(2, companyTokens.length);

  return matchCount >= requiredMatches;
}

function doesFeatureMatchLocation(feature: NominatimFeature, location?: string) {
  const locationTokens = getLocationTokens(location);

  if (locationTokens.length === 0) {
    return true;
  }

  const featureTokens = new Set(tokenizeSearchText(getFeatureSearchText(feature)));
  return locationTokens.some((token) => featureTokens.has(token));
}

function isReliableOfficeFeature(feature: NominatimFeature, company: string, location?: string) {
  return doesFeatureMatchCompany(feature, company) && doesFeatureMatchLocation(feature, location);
}

function getLocationZoom(feature: NominatimFeature) {
  const resultType = feature.type ?? "";

  if (resultType === "country") {
    return 3;
  }

  if (["province", "region", "state"].includes(resultType)) {
    return 5;
  }

  if (["city", "town", "village", "municipality", "locality"].includes(resultType)) {
    return 10;
  }

  return 12;
}

function getCountryBounds(feature: NominatimFeature) {
  if (feature.type !== "country" || !feature.boundingbox) {
    return undefined;
  }

  const [south, north, west, east] = feature.boundingbox.map(Number);

  if (![south, north, west, east].every(Number.isFinite)) {
    return undefined;
  }

  return [
    [west, south],
    [east, north]
  ] satisfies [[number, number], [number, number]];
}

function toMapCoordinates(
  feature: NominatimFeature,
  fallbackLabel: string,
  zoom: number,
  precision: MapCoordinates["precision"]
) {
  const longitude = Number(feature.lon);
  const latitude = Number(feature.lat);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return {
    bounds: getCountryBounds(feature),
    longitude,
    latitude,
    label: feature.display_name ?? feature.name ?? fallbackLabel,
    precision,
    zoom
  };
}

async function fetchNominatimFeatures(query: string, limit: number) {
  const response = await fetch(
    `${nominatimSearchUrl}?${new URLSearchParams({
      addressdetails: "1",
      dedupe: "1",
      format: "jsonv2",
      limit: String(limit),
      namedetails: "1",
      q: query
    })}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en"
      }
    }
  );

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as NominatimFeature[];
}

async function geocodeLocation(location: string) {
  const countryCoordinates = getCountryCoordinates(location);

  if (countryCoordinates) {
    return countryCoordinates;
  }

  const cachedCoordinates = getCachedLocationCoordinates(location);

  if (cachedCoordinates !== undefined) {
    return cachedCoordinates;
  }

  const cacheKey = getLocationCacheKey(location);
  const cachedGeocode = locationGeocodeCache.get(cacheKey);

  if (cachedGeocode) {
    return cachedGeocode;
  }

  const geocodeRequest = fetchNominatimFeatures(location, 1)
    .then((features) => {
      const feature = features[0];
      const result = feature
        ? toMapCoordinates(feature, location, getLocationZoom(feature), feature.type === "country" ? "country" : "location")
        : null;

      resolvedLocationGeocodeCache.set(cacheKey, result);
      return result;
    })
    .catch(() => {
      resolvedLocationGeocodeCache.set(cacheKey, null);
      return null;
    });

  locationGeocodeCache.set(cacheKey, geocodeRequest);
  return geocodeRequest;
}

async function geocodeOffice(company: string, location?: string) {
  if (location) {
    const countryCoordinates = getCountryCoordinates(location);

    if (countryCoordinates) {
      return countryCoordinates;
    }
  }

  const query = buildOfficeGeocodeQuery(company, location);
  const cacheKey = getOfficeGeocodeCacheKey(company, location);
  const cachedCoordinates = getCachedOfficeCoordinates(company, location);

  if (cachedCoordinates !== undefined) {
    return cachedCoordinates;
  }

  const cachedGeocode = officeGeocodeCache.get(cacheKey);

  if (cachedGeocode) {
    return cachedGeocode;
  }

  const geocodeRequest = (location ? geocodeLocation(location) : Promise.resolve(null))
    .then(async (locationResult) => {
      if (locationResult?.precision === "country") {
        return locationResult;
      }

      const features = await fetchNominatimFeatures(query, 5);
      const officeFeature = features.find((feature) => isReliableOfficeFeature(feature, company, location));
      return (
        (officeFeature ? toMapCoordinates(officeFeature, query, 13, "office") : null) ??
        locationResult
      );
    })
    .then((result) => {
      resolvedOfficeGeocodeCache.set(cacheKey, result);
      return result;
    })
    .catch(() => {
      resolvedOfficeGeocodeCache.set(cacheKey, null);
      return null;
    });

  officeGeocodeCache.set(cacheKey, geocodeRequest);
  return geocodeRequest;
}

function getMapStyle(themeMode: ThemeMode) {
  return `/map-styles/carbon-${themeMode}.json`;
}

function collapseCompactAttribution(map: maplibregl.Map) {
  const collapse = () => {
    const attribution = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib.maplibregl-compact");

    attribution?.classList.remove("maplibregl-compact-show");
    attribution?.removeAttribute("open");
  };

  collapse();
  window.requestAnimationFrame(collapse);
  window.setTimeout(collapse, 0);
  map.once("idle", collapse);
}

function fitMapToBounds(map: maplibregl.Map, bounds: [[number, number], [number, number]]) {
  map.fitBounds(bounds, {
    duration: 450,
    essential: true,
    padding: 28
  });
}

const LocationMapPanel = memo(function LocationMapPanel({
  company,
  location,
  isRemote,
  themeMode
}: {
  company: string;
  location?: string;
  isRemote: boolean;
  themeMode: ThemeMode;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const mapStyleRef = useRef<string | null>(null);
  const [coordinates, setCoordinates] = useState<MapCoordinates | null>(() =>
    isRemote ? null : getCachedOfficeCoordinates(company, location) ?? null
  );
  const [isMapLoading, setIsMapLoading] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    if (isRemote) {
      setCoordinates(null);
      setIsMapLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    const cachedCoordinates = getCachedOfficeCoordinates(company, location);

    if (cachedCoordinates !== undefined) {
      setCoordinates(cachedCoordinates);
      setIsMapLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setCoordinates(null);
    setIsMapLoading(true);
    void geocodeOffice(company, location)
      .then((result) => {
        if (isCurrent) {
          setCoordinates(result);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsMapLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [company, isRemote, location]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    const style = getMapStyle(themeMode);
    const targetCenter: [number, number] =
      isRemote || !coordinates ? worldCenter : [coordinates.longitude, coordinates.latitude];
    const targetZoom = isRemote || !coordinates ? 0.65 : coordinates.zoom;
    const targetBounds = !isRemote && coordinates?.bounds ? coordinates.bounds : null;
    const currentMap = mapRef.current;

    let map = currentMap;

    if (!map) {
      mapStyleRef.current = style;
      const createdMap = new maplibregl.Map({
        attributionControl: {
          compact: true
        },
        center: targetCenter,
        container: mapContainerRef.current,
        cooperativeGestures: true,
        interactive: true,
        pitchWithRotate: false,
        scrollZoom: true,
        style,
        zoom: targetZoom
      });
      map = createdMap;
      mapRef.current = map;
      collapseCompactAttribution(createdMap);
      if (targetBounds) {
        createdMap.once("load", () => fitMapToBounds(createdMap, targetBounds));
      }
    } else {
      if (mapStyleRef.current !== style) {
        map.setStyle(style);
        mapStyleRef.current = style;
        collapseCompactAttribution(map);
      }

      if (!isRemote && !coordinates && isMapLoading) {
        window.requestAnimationFrame(() => mapRef.current?.resize());
        return;
      }

      if (targetBounds) {
        fitMapToBounds(map, targetBounds);
      } else {
        map.easeTo({
          center: targetCenter,
          duration: 450,
          essential: true,
          zoom: targetZoom
        });
      }
    }

    window.requestAnimationFrame(() => mapRef.current?.resize());

    if (coordinates && !isRemote && coordinates.precision !== "country") {
      markerRef.current?.remove();
      markerRef.current = new maplibregl.Marker({ color: "#0f62fe" }).setLngLat(targetCenter).addTo(map);
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }
  }, [coordinates, isMapLoading, isRemote, themeMode]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapStyleRef.current = null;
    },
    []
  );

  const mapLabel = isRemote ? "Remote role, worldwide map" : coordinates?.label ?? buildOfficeGeocodeQuery(company, location);

  return (
    <div className="location-map-panel">
      <div className="location-map-frame">
        <div className="location-map-canvas" ref={mapContainerRef} role="img" aria-label={mapLabel} />
        {isMapLoading ? (
          <div className="location-map-overlay">
            <Loading small withOverlay={false} description="Loading location map" />
          </div>
        ) : null}
      </div>
    </div>
  );
});

export const VisualizationPanel = memo(function VisualizationPanel({
  posting,
  themeMode
}: {
  posting: JobPostingDto | null;
  themeMode: ThemeMode;
}) {
  if (!posting) {
    return (
      <Tile className="visualization-tile">
        <div className="visualization-empty">
          <p>No posting selected.</p>
          <span>Select a posting to inspect its location and application details.</span>
        </div>
      </Tile>
    );
  }

  const mapLocation = getMapLocation(posting);
  const secondaryApplicationUrls = posting.applicationUrls.slice(1);
  const detailRows = [
    { label: "Category", value: posting.category },
    { label: "Season", value: posting.season },
    { label: "Age", value: posting.ageText ?? "Age unavailable" },
    { label: "Status", value: posting.isClosed ? "Closed" : posting.isActive ? "Active" : "Inactive" },
    { label: "First", value: formatDate(posting.firstSeenAt) },
    { label: "Last", value: formatDate(posting.lastSeenAt) },
    ...(posting.doesNotOfferSponsorship ? [{ label: "Sponsorship", value: "Does not offer sponsorship" }] : []),
    ...(posting.requiresUsCitizenship ? [{ label: "Citizenship", value: "US citizenship required" }] : [])
  ];

  return (
    <Tile className="visualization-tile">
      <LocationMapPanel company={posting.company} isRemote={hasRemoteLocation(posting) && !mapLocation} location={mapLocation} themeMode={themeMode} />

      <div className="posting-detail-card">
        <div className="posting-detail-card__header">
          <h3>{posting.company}</h3>
          <p>{posting.role}</p>
          <span>{posting.locations.join(" | ") || "Location unavailable"}</span>
        </div>

        <dl className="posting-detail-grid">
          {detailRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {secondaryApplicationUrls.length > 0 || posting.simplifyUrl ? (
        <div className="detail-actions">
          {secondaryApplicationUrls.map((url, index) => (
            <Button kind="ghost" size="sm" renderIcon={Launch} href={url} target="_blank" key={url}>
              Link {index + 2}
            </Button>
          ))}
          {posting.simplifyUrl ? (
            <Button kind="ghost" size="sm" renderIcon={Launch} href={posting.simplifyUrl} target="_blank">
              Simplify
            </Button>
          ) : null}
        </div>
      ) : null}
    </Tile>
  );
});
