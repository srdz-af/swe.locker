import {
  memo,
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Checkbox,
  Column,
  Content,
  Grid,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  InlineNotification,
  Loading,
  Modal,
  MultiSelect,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
  SkipToContent,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tag,
  TextInput,
  Theme,
  Tile,
  Tabs
} from "@carbon/react";
import { Add, Launch, Moon, Star, StarFilled, Sun } from "@carbon/icons-react";
import { AlluvialChart } from "@carbon/charts-react";
import type { AlluvialChartOptions, ChartTabularData } from "@carbon/charts-react";
import type { ApplicationActivityDayDto, ApplicationDto, ApplicationStatus, JobPostingDto, SourceConfigDto } from "../../shared/src/index";
import {
  archiveApplication,
  createApplication,
  deleteApplication,
  followCompany,
  getApplicationActivity,
  getPostings,
  getSourceConfig,
  listApplications,
  updateApplicationStatus,
  unfollowCompany
} from "./api";
import "@carbon/charts-react/styles.css";
import "./styles.scss";

type ThemeMode = "light" | "dark";
type MapboxGl = typeof import("mapbox-gl").default;

const themeStorageKey = "swe.locker.theme";
const darkPreferenceQuery = "(prefers-color-scheme: dark)";
const carbonMapStyles = {
  light: "mapbox://styles/carbondesignsystem/ck7c8cfpp08h61irrudv7f1xg",
  dark: "mapbox://styles/carbondesignsystem/ck7c89g8708gy1imlz9g5o6h9"
};
const mapboxAccessToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() ?? "";
const worldMapView = {
  center: [0, 18] as [number, number],
  zoom: 0.7
};
const geocodeCache = new Map<string, Promise<[number, number] | null>>();
const applicationStatuses: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "APPLIED", label: "Applied" },
  { status: "INTERVIEW", label: "Interview" },
  { status: "OFFER", label: "Offer" },
  { status: "HIRED", label: "Hired" },
  { status: "REJECTED", label: "Rejected" }
];

type PostingTagFilter = {
  id: string;
  label: string;
  matches: (posting: JobPostingDto) => boolean;
};

type PostingFacetFilter = PostingTagFilter;

const postingTagFilters: PostingTagFilter[] = [
  { id: "new", label: "New", matches: (posting) => posting.isNewToday },
  { id: "followed", label: "Followed", matches: (posting) => posting.isFollowed },
  { id: "tracked", label: "Tracked", matches: (posting) => posting.isTracked },
  { id: "faang", label: "FAANG+", matches: (posting) => posting.isFaang },
  { id: "advanced-degree", label: "Advanced degree", matches: (posting) => posting.requiresAdvancedDegree }
];

const sponsorshipFilters: PostingFacetFilter[] = [
  { id: "no-sponsorship", label: "Does not offer sponsorship", matches: (posting) => posting.doesNotOfferSponsorship }
];

const citizenshipFilters: PostingFacetFilter[] = [
  { id: "us-citizenship", label: "US citizenship required", matches: (posting) => posting.requiresUsCitizenship }
];

const alluvialOutcomeColors = {
  "In progress": "#0f62fe",
  Offer: "#24a148",
  Rejected: "#da1e28"
};

type AlluvialLinkElement = SVGPathElement & {
  __data__?: {
    group?: string;
  };
};

type GeocodeResult = {
  center: [number, number];
  isCompanySpecific: boolean;
};

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia(darkPreferenceQuery).matches ? "dark" : "light";
}

function normalizeFilterText(value: string) {
  return value.trim().toLowerCase();
}

function compactSearchText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function matchesPostingFilters(
  posting: JobPostingDto,
  filters: {
    search: string;
    categories: string[];
    location: string;
    tags: PostingTagFilter[];
    sponsorship: PostingFacetFilter[];
    citizenship: PostingFacetFilter[];
  }
) {
  const searchTerm = normalizeFilterText(filters.search);
  const locationTerm = normalizeFilterText(filters.location);

  if (filters.categories.length > 0 && !filters.categories.includes(posting.category)) {
    return false;
  }

  if (filters.tags.some((tagFilter) => !tagFilter.matches(posting))) {
    return false;
  }

  if (filters.sponsorship.length > 0 && !filters.sponsorship.some((filter) => filter.matches(posting))) {
    return false;
  }

  if (filters.citizenship.length > 0 && !filters.citizenship.some((filter) => filter.matches(posting))) {
    return false;
  }

  if (locationTerm && !normalizeFilterText(posting.locations.join(" ")).includes(locationTerm)) {
    return false;
  }

  if (!searchTerm) {
    return true;
  }

  return normalizeFilterText(`${posting.company} ${posting.role} ${posting.category}`).includes(searchTerm);
}

type PostingCardProps = {
  isSelected: boolean;
  posting: JobPostingDto;
  onFollow: (posting: JobPostingDto) => Promise<void>;
  onSelect: (posting: JobPostingDto) => void;
  onTrack: (posting: JobPostingDto) => Promise<void>;
};

const PostingCard = memo(function PostingCard({ isSelected, posting, onFollow, onSelect, onTrack }: PostingCardProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("a, button")) {
      return;
    }

    event.preventDefault();
    onSelect(posting);
  }

  return (
    <article
      aria-label={`${posting.company}, ${posting.role}`}
      aria-selected={isSelected}
      className={`posting-card${isSelected ? " posting-card--selected" : ""}`}
      onClick={() => onSelect(posting)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="posting-main">
        <div className="posting-title-line">
          <div className="posting-company">
            <Button
              hasIconOnly
              kind="ghost"
              size="sm"
              renderIcon={posting.isFollowed ? StarFilled : Star}
              iconDescription={posting.isFollowed ? `Unfollow ${posting.company}` : `Follow ${posting.company}`}
              onClick={(event) => {
                event.stopPropagation();
                void onFollow(posting);
              }}
            />
            <h3>{posting.company}</h3>
          </div>
          <div className="posting-tags">
            {posting.isNewToday ? <Tag type="gray">New</Tag> : null}
            {posting.isFollowed ? <Tag type="gray">Followed</Tag> : null}
            {posting.isTracked ? <Tag type="gray">Tracked</Tag> : null}
            {posting.isFaang ? <Tag type="gray">FAANG+</Tag> : null}
            {posting.requiresAdvancedDegree ? <Tag type="gray">Advanced degree</Tag> : null}
          </div>
        </div>
        <p className="posting-role">{posting.role}</p>
        <div className="posting-meta">
          <span>{posting.locations.join(" | ") || "Location unavailable"}</span>
          <span>{posting.category}</span>
          <span>{posting.ageText ?? "Age unavailable"}</span>
        </div>
      </div>

      <div className="posting-actions">
        <Button
          kind="secondary"
          size="sm"
          renderIcon={Add}
          onClick={(event) => {
            event.stopPropagation();
            void onTrack(posting);
          }}
        >
          {posting.isTracked ? "Untrack" : "Track"}
        </Button>
        {posting.primaryApplicationUrl ? (
          <Button
            kind="primary"
            size="sm"
            renderIcon={Launch}
            href={posting.primaryApplicationUrl}
            target="_blank"
            onClick={(event) => event.stopPropagation()}
          >
            Apply
          </Button>
        ) : null}
      </div>
    </article>
  );
});

function isRemoteLocation(location: string) {
  return /\b(remote|virtual|anywhere|worldwide)\b/i.test(location);
}

function getConcreteMapLocation(posting: JobPostingDto) {
  return posting.locations.find((location) => !isRemoteLocation(location));
}

function getMapGeocodeQueries(posting: JobPostingDto, location: string) {
  const company = compactSearchText(posting.company);
  const place = compactSearchText(location);
  const queries = company ? [`${company}, ${place}`, place] : [place];

  return Array.from(new Set(queries.filter(Boolean)));
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getApplicationStatusLabel(status: ApplicationStatus) {
  return applicationStatuses.find((option) => option.status === status)?.label ?? status;
}

function getApplicationStatusCounts(applications: ApplicationDto[]) {
  const counts = new Map<ApplicationStatus, number>();
  for (const option of applicationStatuses) {
    counts.set(option.status, 0);
  }
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }
  return counts;
}

function getActivityLevel(count: number, maxCount: number) {
  if (count <= 0) {
    return 0;
  }

  if (maxCount <= 1) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
}

function getActivityWeeks(days: ApplicationActivityDayDto[]) {
  const firstDay = days[0];
  if (!firstDay) {
    return [];
  }

  const firstDate = new Date(`${firstDay.date}T00:00:00.000Z`);
  const paddedDays: Array<ApplicationActivityDayDto | null> = Array.from({ length: firstDate.getUTCDay() }, () => null);
  paddedDays.push(...days);

  const weekCount = Math.ceil(paddedDays.length / 7);
  return Array.from({ length: weekCount }, (_, weekIndex) => paddedDays.slice(weekIndex * 7, weekIndex * 7 + 7));
}

function getActivityMonthLabels(weeks: Array<Array<ApplicationActivityDayDto | null>>) {
  const labels: Array<{ label: string; weekIndex: number }> = [];
  let previousMonth: number | null = null;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find((day): day is ApplicationActivityDayDto => Boolean(day));
    if (!firstDay) {
      return;
    }

    const date = new Date(`${firstDay.date}T00:00:00.000Z`);
    const month = date.getUTCMonth();

    if (month !== previousMonth) {
      labels.push({
        label: date.toLocaleString(undefined, { month: "short", timeZone: "UTC" }),
        weekIndex
      });
      previousMonth = month;
    }
  });

  return labels;
}

function getActivitySummaryLabel(totalActivity: number) {
  const unit = totalActivity === 1 ? "tracker update" : "tracker updates";
  return `${totalActivity} ${unit} in the last year`;
}

function formatActivityDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  });
}

function formatApplicationCount(value: number) {
  return `${value} application${value === 1 ? "" : "s"}`;
}

function formatApplicationTooltipValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatApplicationCount(value);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const countMatch = trimmedValue.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);

    if (countMatch) {
      const count = Number(countMatch[1]);
      const unit = countMatch[2].trim().toLowerCase();

      if (Number.isFinite(count) && (!unit || unit.startsWith("application"))) {
        return formatApplicationCount(count);
      }
    }

    return trimmedValue;
  }

  if (value && typeof value === "object" && "value" in value) {
    return formatApplicationTooltipValue((value as { value?: unknown }).value);
  }

  return "0 applications";
}

function getApplicationReviewStage(application: ApplicationDto) {
  if (application.status === "APPLIED") {
    return "CV pending";
  }

  if (application.status === "REJECTED") {
    return hasReachedInterview(application) ? "Interview" : "CV rejected";
  }

  return "Interview";
}

function getApplicationResultStage(application: ApplicationDto) {
  if (application.status === "OFFER" || application.status === "HIRED") {
    return "Offer";
  }

  if (application.status === "REJECTED") {
    return "Rejected";
  }

  return "In progress";
}

function hasReachedInterview(application: ApplicationDto) {
  if (application.status === "INTERVIEW" || application.status === "OFFER" || application.status === "HIRED") {
    return true;
  }

  return (application.events ?? []).some(
    (event) =>
      event.newStatus === "INTERVIEW" ||
      event.newStatus === "OFFER" ||
      event.newStatus === "HIRED" ||
      event.previousStatus === "INTERVIEW" ||
      event.previousStatus === "OFFER" ||
      event.previousStatus === "HIRED"
  );
}

function incrementAlluvialLink(counts: Map<string, { group: string; source: string; target: string; value: number }>, group: string, source: string, target: string) {
  const key = `${source}\u0000${target}\u0000${group}`;
  const current = counts.get(key);

  if (current) {
    current.value += 1;
    return;
  }

  counts.set(key, {
    group,
    source,
    target,
    value: 1
  });
}

function getAlluvialOutcomeColor(group: string | undefined) {
  return alluvialOutcomeColors[group as keyof typeof alluvialOutcomeColors] ?? alluvialOutcomeColors["In progress"];
}

function applyAlluvialOutcomeColors(container: HTMLElement) {
  const links = container.querySelectorAll<AlluvialLinkElement>("path.link");

  for (const link of links) {
    link.style.stroke = getAlluvialOutcomeColor(link.__data__?.group);
  }
}

async function geocodeQuery(query: string, signal: AbortSignal) {
  const cacheKey = normalizeFilterText(query);
  const cachedLocation = geocodeCache.get(cacheKey);
  if (cachedLocation) {
    return cachedLocation;
  }

  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    limit: "1"
  });
  const request = fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`, {
    signal
  })
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        features?: Array<{
          center?: [number, number];
        }>;
      };

      return payload.features?.[0]?.center ?? null;
    })
    .catch((error: unknown) => {
      geocodeCache.delete(cacheKey);
      throw error;
    });

  geocodeCache.set(cacheKey, request);
  return request;
}

async function geocodePostingLocation(posting: JobPostingDto, location: string, signal: AbortSignal): Promise<GeocodeResult | null> {
  const queries = getMapGeocodeQueries(posting, location);

  for (const [queryIndex, query] of queries.entries()) {
    const center = await geocodeQuery(query, signal);
    if (center) {
      return {
        center,
        isCompanySpecific: queryIndex === 0 && queries.length > 1
      };
    }
  }

  return null;
}

const CarbonSpatialMap = memo(function CarbonSpatialMap({
  location,
  posting,
  themeMode
}: {
  location: string | undefined;
  posting: JobPostingDto;
  themeMode: ThemeMode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const mapboxRef = useRef<MapboxGl | null>(null);
  const [mapMessage, setMapMessage] = useState<string | null>(mapboxAccessToken ? "Loading map" : "Mapbox token required");
  const [mapReadyVersion, setMapReadyVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !mapboxAccessToken || mapRef.current) {
      return;
    }

    let isMounted = true;

    async function initializeMap() {
      const [{ default: mapboxgl }] = await Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]);

      if (!isMounted || !containerRef.current) {
        return;
      }

      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = mapboxAccessToken;
      const map = new mapboxgl.Map({
        attributionControl: false,
        center: worldMapView.center,
        container: containerRef.current,
        cooperativeGestures: true,
        logoPosition: "bottom-right",
        style: carbonMapStyles[themeMode],
        zoom: worldMapView.zoom
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
      map.once("load", () => {
        if (!isMounted) {
          return;
        }

        setMapReadyVersion((currentVersion) => currentVersion + 1);
        setMapMessage(null);
      });
    }

    void initializeMap().catch((error: unknown) => {
      if (isMounted) {
        setMapMessage(error instanceof Error ? error.message : "Map unavailable.");
      }
    });

    return () => {
      isMounted = false;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.setStyle(carbonMapStyles[themeMode]);
  }, [themeMode]);

  useEffect(() => {
    if (!mapboxAccessToken || mapReadyVersion === 0) {
      return;
    }

    const abortController = new AbortController();

    async function updateMapView() {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      if (!location) {
        markerRef.current?.remove();
        markerRef.current = null;
        map.flyTo({ center: worldMapView.center, zoom: worldMapView.zoom });
        setMapMessage(null);
        return;
      }

      setMapMessage("Finding location");
      const resolvedLocation = await geocodePostingLocation(posting, location, abortController.signal);

      if (abortController.signal.aborted) {
        return;
      }

      if (!resolvedLocation) {
        markerRef.current?.remove();
        markerRef.current = null;
        map.flyTo({ center: worldMapView.center, zoom: worldMapView.zoom });
        setMapMessage("Location not found. Showing world view.");
        return;
      }

      if (!mapboxRef.current) {
        return;
      }

      markerRef.current?.remove();
      markerRef.current = new mapboxRef.current.Marker({ color: "#0f62fe" }).setLngLat(resolvedLocation.center).addTo(map);
      map.flyTo({ center: resolvedLocation.center, zoom: resolvedLocation.isCompanySpecific ? 12 : 9 });
      setMapMessage(null);
    }

    void updateMapView().catch((error: unknown) => {
      if (!abortController.signal.aborted) {
        setMapMessage(error instanceof Error ? error.message : "Map unavailable.");
      }
    });

    return () => {
      abortController.abort();
    };
  }, [location, mapReadyVersion, posting.company, posting.id]);

  if (!mapboxAccessToken) {
    return (
      <div className="map-frame map-frame--empty">
        <span>Set VITE_MAPBOX_ACCESS_TOKEN to render Carbon Mapbox themes.</span>
      </div>
    );
  }

  return (
    <div className="map-frame">
      <div className="carbon-map" ref={containerRef} aria-label={`${posting.company} spatial map`} />
      {mapMessage ? <div className="map-message">{mapMessage}</div> : null}
    </div>
  );
});

const VisualizationPanel = memo(function VisualizationPanel({ posting, themeMode }: { posting: JobPostingDto | null; themeMode: ThemeMode }) {
  if (!posting) {
    return (
      <Tile className="visualization-tile">
        <h2>Posting details</h2>
        <div className="visualization-empty">
          <p>No posting selected.</p>
          <span>Select a posting to inspect its location and application details.</span>
        </div>
      </Tile>
    );
  }

  const concreteLocation = getConcreteMapLocation(posting);
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
  const attributes = [
    posting.isNewToday ? "New" : null,
    posting.isFollowed ? "Followed" : null,
    posting.isTracked ? "Tracked" : null,
    posting.isFaang ? "FAANG+" : null,
    posting.requiresAdvancedDegree ? "Advanced degree" : null
  ].filter((attribute): attribute is string => Boolean(attribute));

  return (
    <Tile className="visualization-tile">
      <div className="section-header">
        <div>
          <h2>Posting details</h2>
          <p>{posting.company}</p>
        </div>
      </div>

      <CarbonSpatialMap location={concreteLocation} posting={posting} themeMode={themeMode} />

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

      {attributes.length > 0 ? (
        <div className="detail-tags">
          {attributes.map((attribute) => (
            <Tag type="gray" key={attribute}>
              {attribute}
            </Tag>
          ))}
        </div>
      ) : null}

      <div className="detail-actions">
        {posting.applicationUrls.map((url, index) => (
          <Button kind={index === 0 ? "primary" : "ghost"} size="sm" renderIcon={Launch} href={url} target="_blank" key={url}>
            {index === 0 ? "Apply" : `Link ${index + 1}`}
          </Button>
        ))}
        {posting.simplifyUrl ? (
          <Button kind="ghost" size="sm" renderIcon={Launch} href={posting.simplifyUrl} target="_blank">
            Simplify
          </Button>
        ) : null}
      </div>
    </Tile>
  );
});

const TrackingResultsTile = memo(function TrackingResultsTile({
  applications = [],
  isChartActive = false,
  themeMode
}: {
  applications?: ApplicationDto[];
  isChartActive?: boolean;
  themeMode: ThemeMode;
}) {
  const [canRenderAlluvial, setCanRenderAlluvial] = useState(false);
  const [showAlluvialLabels, setShowAlluvialLabels] = useState(true);
  const trackingResultsChartRef = useRef<HTMLDivElement | null>(null);
  const alluvialChartData = useMemo<ChartTabularData>(() => {
    const linkCounts = new Map<string, { group: string; source: string; target: string; value: number }>();

    for (const application of applications) {
      const reviewStage = getApplicationReviewStage(application);
      const resultStage = getApplicationResultStage(application);

      incrementAlluvialLink(linkCounts, resultStage, application.company, reviewStage);
      incrementAlluvialLink(linkCounts, resultStage, reviewStage, resultStage);
    }

    return Array.from(linkCounts.values()).sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.target.localeCompare(right.target) || left.group.localeCompare(right.group)
    );
  }, [applications]);
  const alluvialCompanies = useMemo(() => Array.from(new Set(applications.map((application) => application.company))).sort(), [applications]);
  const alluvialReviewStages = useMemo(
    () => Array.from(new Set(applications.map(getApplicationReviewStage))).sort(),
    [applications]
  );
  const alluvialResultStages = useMemo(
    () => Array.from(new Set(applications.map(getApplicationResultStage))).sort(),
    [applications]
  );
  const alluvialChartHeight = `${Math.max(16, Math.min(26, 8 + alluvialCompanies.length))}rem`;
  const trackingResultsChartStyle = { "--tracking-results-chart-height": alluvialChartHeight } as CSSProperties;
  const alluvialChartKey = useMemo(
    () => `${themeMode}-${alluvialChartData.map((item) => `${item.group}:${item.source}:${item.target}:${item.value}`).join("|")}`,
    [alluvialChartData, themeMode]
  );
  const alluvialChartOptions = useMemo<AlluvialChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Tracked applications by company, review stage, and result"
      },
      alluvial: {
        nodes: [
          ...alluvialCompanies.map((company) => ({
            name: company,
            category: "Company"
          })),
          ...alluvialReviewStages.map((stage) => ({
            name: stage,
            category: "Review"
          })),
          ...alluvialResultStages.map((result) => ({
            name: result,
            category: "Result"
          }))
        ],
        nodeAlignment: "left",
        nodePadding: 12,
        units: "applications"
      },
      data: {
        groupMapsTo: "group"
      },
      color: {
        scale: alluvialOutcomeColors
      },
      getStrokeColor: (group, _label, _data, defaultStrokeColor) =>
        alluvialOutcomeColors[group as keyof typeof alluvialOutcomeColors] ?? defaultStrokeColor ?? alluvialOutcomeColors["In progress"],
      height: alluvialChartHeight,
      legend: {
        enabled: false
      },
      theme: themeMode === "dark" ? "g100" : "white",
      toolbar: {
        enabled: false
      },
      tooltip: {
        valueFormatter: (value) => formatApplicationTooltipValue(value)
      }
    }),
    [alluvialChartHeight, alluvialCompanies, alluvialResultStages, alluvialReviewStages, themeMode]
  );

  useEffect(() => {
    if (alluvialChartData.length === 0) {
      setCanRenderAlluvial(false);
      return;
    }

    if (!isChartActive || canRenderAlluvial) {
      return;
    }

    setCanRenderAlluvial(false);
    const frameId = window.requestAnimationFrame(() => {
      setCanRenderAlluvial(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [alluvialChartData.length, canRenderAlluvial, isChartActive]);

  useEffect(() => {
    if (!canRenderAlluvial || !trackingResultsChartRef.current) {
      return;
    }

    const chartContainer = trackingResultsChartRef.current;
    const frameId = window.requestAnimationFrame(() => applyAlluvialOutcomeColors(chartContainer));
    const observer = new MutationObserver(() => applyAlluvialOutcomeColors(chartContainer));
    observer.observe(chartContainer, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [alluvialChartData, canRenderAlluvial, themeMode]);

  return (
    <Tile className="tracking-results-tile">
      <div className="tracking-results-panel">
        <div className="section-header">
          <div>
            <h2>Tracking results</h2>
            <p>Company to review to outcome</p>
          </div>
          <div className="tracking-results-controls">
            <Checkbox
              checked={showAlluvialLabels}
              id="show-alluvial-labels"
              labelText="Show labels"
              onChange={(_event, { checked }) => setShowAlluvialLabels(checked)}
            />
          </div>
        </div>
        {canRenderAlluvial ? (
          <div
            className={`tracking-results-chart${showAlluvialLabels ? " tracking-results-chart--labels-visible" : ""}`}
            ref={trackingResultsChartRef}
            style={trackingResultsChartStyle}
          >
            <AlluvialChart data={alluvialChartData} key={alluvialChartKey} options={alluvialChartOptions} />
          </div>
        ) : alluvialChartData.length > 0 ? (
          <div
            className="tracking-results-chart tracking-results-chart--placeholder"
            style={trackingResultsChartStyle}
            aria-hidden="true"
          />
        ) : (
          <div className="tracking-results-empty">No tracked applications yet.</div>
        )}
      </div>
    </Tile>
  );
});

const ApplicationActivityHeatmapTile = memo(function ApplicationActivityHeatmapTile({
  days = []
}: {
  days?: ApplicationActivityDayDto[];
}) {
  const weeks = useMemo(() => getActivityWeeks(days), [days]);
  const monthLabels = useMemo(() => getActivityMonthLabels(weeks), [weeks]);
  const totalActivity = useMemo(() => days.reduce((total, day) => total + day.count, 0), [days]);
  const maxCount = useMemo(() => Math.max(0, ...days.map((day) => day.count)), [days]);
  const activityCalendarGridStyle = { "--activity-week-count": Math.max(1, weeks.length) } as CSSProperties;

  return (
    <Tile className="activity-heatmap-tile">
      <div className="section-header">
        <div>
          <h2>Application activity</h2>
          <p>{getActivitySummaryLabel(totalActivity)}</p>
        </div>
      </div>

      <div className="activity-github-layout">
        <div className="activity-calendar-panel">
          <div className="activity-calendar-scroll">
            <div className="activity-calendar-grid" style={activityCalendarGridStyle}>
              <div className="activity-month-labels" aria-hidden="true">
                {monthLabels.map((month) => (
                  <span key={`${month.label}-${month.weekIndex}`} style={{ gridColumn: String(month.weekIndex + 1) }}>
                    {month.label}
                  </span>
                ))}
              </div>
              <div className="activity-weekday-labels" aria-hidden="true">
                <span style={{ gridRow: "2" }}>Mon</span>
                <span style={{ gridRow: "4" }}>Wed</span>
                <span style={{ gridRow: "6" }}>Fri</span>
              </div>
              <div className="activity-heatmap" aria-label="Application activity heatmap">
                {weeks.map((week, weekIndex) => (
                  <div className="activity-week" key={weekIndex}>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const day = week[dayIndex] ?? null;
                      if (!day) {
                        return <span className="activity-cell activity-cell--empty" key={dayIndex} aria-hidden="true" />;
                      }

                      const updateUnit = day.count === 1 ? "tracker update" : "tracker updates";
                      const activityLabel = `${formatActivityDate(day.date)}: ${day.count} ${updateUnit}`;

                      return (
                        <span
                          className={`activity-cell activity-cell--level-${getActivityLevel(day.count, maxCount)}`}
                          key={day.date}
                          title={activityLabel}
                          aria-label={activityLabel}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="activity-calendar-footer">
            <span>Application tracker updates</span>
            <div className="activity-legend" aria-hidden="true">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span className={`activity-cell activity-cell--level-${level}`} key={level} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

      </div>
    </Tile>
  );
});

const StatsOverviewTile = memo(function StatsOverviewTile({ applications, postings }: { applications: ApplicationDto[]; postings: JobPostingDto[] }) {
  const applicationCountsByStatus = useMemo(() => getApplicationStatusCounts(applications), [applications]);
  const stats = useMemo(
    () => [
      { label: "Total postings", value: postings.length },
      { label: "New today", value: postings.filter((posting) => posting.isNewToday).length },
      { label: "Applied", value: applicationCountsByStatus.get("APPLIED") ?? 0 },
      { label: "Interview", value: applicationCountsByStatus.get("INTERVIEW") ?? 0 },
      { label: "Offer", value: applicationCountsByStatus.get("OFFER") ?? 0 },
      { label: "Hired", value: applicationCountsByStatus.get("HIRED") ?? 0 },
      { label: "Rejected", value: applicationCountsByStatus.get("REJECTED") ?? 0 }
    ],
    [applicationCountsByStatus, postings]
  );

  return (
    <Tile className="stats-overview-tile">
      <div className="section-header">
        <div>
          <h2>Overview</h2>
          <p>Posting volume and active application outcomes</p>
        </div>
      </div>
      <div className="stats-strip" aria-label="Application and posting stats">
        {stats.map((stat) => (
          <div className="stats-strip__item" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
    </Tile>
  );
});

const StatsPanel = memo(function StatsPanel({
  activityDays,
  applications,
  isChartActive,
  postings,
  themeMode
}: {
  activityDays: ApplicationActivityDayDto[];
  applications: ApplicationDto[];
  isChartActive: boolean;
  postings: JobPostingDto[];
  themeMode: ThemeMode;
}) {
  return (
    <div className="stats-stack">
      <div className="stats-top-row">
        <TrackingResultsTile applications={applications} isChartActive={isChartActive} themeMode={themeMode} />
        <StatsOverviewTile applications={applications} postings={postings} />
      </div>
      <ApplicationActivityHeatmapTile days={activityDays} />
    </div>
  );
});

function ApplicationCard({
  application,
  onArchive,
  onDelete,
  onStatusChange
}: {
  application: ApplicationDto;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
}) {
  return (
    <article className="application-card">
      <div className="application-card__header">
        <div>
          <h3>{application.company}</h3>
          <p>
            {application.externalApplicationTrackingUrl ? (
              <a
                className="application-card__title-link"
                href={application.externalApplicationTrackingUrl}
                target="_blank"
                rel="noreferrer"
              >
                {application.role}
              </a>
            ) : (
              application.role
            )}
          </p>
        </div>
        <OverflowMenu
          aria-label={`Actions for ${application.company} ${application.role}`}
          className="application-card__menu"
          flipped
          iconDescription="Application actions"
          size="sm"
        >
          <OverflowMenuItem itemText="Archive" onClick={() => void onArchive(application)} />
          <OverflowMenuItem hasDivider isDelete itemText="Delete" onClick={() => void onDelete(application)} />
        </OverflowMenu>
      </div>

      <div className="application-card__meta">
        <span>Updated {formatDate(application.updatedAt)}</span>
      </div>

      <Select
        hideLabel
        id={`application-status-${application.id}`}
        labelText={`Status for ${application.company} ${application.role}`}
        size="sm"
        value={application.status}
        onChange={(event) => void onStatusChange(application, event.target.value as ApplicationStatus)}
      >
        {applicationStatuses.map((option) => (
          <SelectItem key={option.status} text={option.label} value={option.status} />
        ))}
      </Select>
    </article>
  );
}

const ApplicationTrackerPanel = memo(function ApplicationTrackerPanel({
  applications = [],
  isLoading,
  onArchive,
  onDelete,
  onStatusChange
}: {
  applications?: ApplicationDto[];
  isLoading: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
}) {
  const applicationsByStatus = useMemo(() => {
    const groupedApplications = new Map<ApplicationStatus, ApplicationDto[]>();
    for (const option of applicationStatuses) {
      groupedApplications.set(option.status, []);
    }

    for (const application of applications) {
      groupedApplications.get(application.status)?.push(application);
    }

    return groupedApplications;
  }, [applications]);

  return (
    <div className="tracker-stack">
      <Tile className="tracker-tile">
        <div className="section-header">
          <div>
            <h2>Application tracker</h2>
            <p>{applications.length} tracked applications</p>
          </div>
        </div>

        {isLoading ? <Loading description="Loading applications" withOverlay={false} /> : null}

        <div className="kanban-board" aria-label="Application tracker board">
          {applicationStatuses.map((option) => {
            const columnApplications = applicationsByStatus.get(option.status) ?? [];

            return (
              <section className="kanban-column" key={option.status} aria-label={option.label}>
                <div className="kanban-column__header">
                  <h3>{option.label}</h3>
                  <Tag type="gray">{columnApplications.length}</Tag>
                </div>

                <div className="application-card-list">
                  {columnApplications.map((application) => (
                    <ApplicationCard
                      application={application}
                      key={application.id}
                      onArchive={onArchive}
                      onDelete={onDelete}
                      onStatusChange={onStatusChange}
                    />
                  ))}

                  {!isLoading && columnApplications.length === 0 ? <p className="kanban-empty">No applications</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </Tile>
    </div>
  );
});

function App() {
  const didLoadInitialSnapshot = useRef(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [sourceConfig, setSourceConfig] = useState<SourceConfigDto | null>(null);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [activityDays, setActivityDays] = useState<ApplicationActivityDayDto[]>([]);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [hasOpenedStats, setHasOpenedStats] = useState(false);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [pendingTrackPosting, setPendingTrackPosting] = useState<JobPostingDto | null>(null);
  const [externalTrackingUrl, setExternalTrackingUrl] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [tagFilters, setTagFilters] = useState<PostingTagFilter[]>([]);
  const [sponsorship, setSponsorship] = useState<PostingFacetFilter[]>([]);
  const [citizenship, setCitizenship] = useState<PostingFacetFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackModalSubmitting, setIsTrackModalSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const carbonTheme = themeMode === "dark" ? "g100" : "white";
  const deferredSearch = useDeferredValue(search);
  const deferredLocation = useDeferredValue(location);

  const loadDashboardSnapshot = useCallback(async () => {
    setError(null);
    const [source, postingList, applicationList, activityList] = await Promise.all([
      getSourceConfig(),
      getPostings(),
      listApplications(),
      getApplicationActivity()
    ]);
    setSourceConfig(source);
    setPostings(postingList);
    setApplications(applicationList);
    setActivityDays(activityList);
  }, []);

  const refreshApplicationActivity = useCallback(async () => {
    setActivityDays(await getApplicationActivity());
  }, []);

  useEffect(() => {
    if (didLoadInitialSnapshot.current) {
      return;
    }

    didLoadInitialSnapshot.current = true;
    setIsLoading(true);
    void loadDashboardSnapshot()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
      })
      .finally(() => setIsLoading(false));
  }, [loadDashboardSnapshot]);

  const categories = useMemo(
    () => Array.from(new Set(postings.map((posting) => posting.category))).sort(),
    [postings]
  );
  const visiblePostings = useMemo(
    () =>
      postings.filter((posting) =>
        matchesPostingFilters(posting, {
          search: deferredSearch,
          categories: categoryFilters,
          location: deferredLocation,
          tags: tagFilters,
          sponsorship,
          citizenship
        })
      ),
    [categoryFilters, citizenship, deferredLocation, deferredSearch, postings, sponsorship, tagFilters]
  );
  const selectedPosting = useMemo(
    () => postings.find((posting) => posting.id === selectedPostingId) ?? null,
    [postings, selectedPostingId]
  );
  const pageHeader = useMemo(
    () => {
      if (selectedTabIndex === 0) {
        return {
          title: "Postings",
          subtitle: sourceConfig?.displayName ?? "SimplifyJobs internship postings",
          metricLabel: "Shown",
          metricValue: `${visiblePostings.length}/${postings.length}`
        };
      }

      if (selectedTabIndex === 1) {
        return {
          title: "Applications",
          subtitle: "Application tracker Kanban board",
          metricLabel: "Tracked",
          metricValue: String(applications.length)
        };
      }

      return {
        title: "Stats",
        subtitle: "Posting and application tracker analytics",
        metricLabel: "Postings",
        metricValue: String(postings.length)
      };
    },
    [applications.length, postings.length, selectedTabIndex, sourceConfig?.displayName, visiblePostings.length]
  );

  useEffect(() => {
    document.documentElement.dataset.appTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  const handleFollow = useCallback(async (posting: JobPostingDto) => {
    setError(null);
    try {
      if (posting.isFollowed) {
        await unfollowCompany(posting.normalizedCompanyName);
        setPostings((currentPostings) =>
          currentPostings.map((currentPosting) =>
            currentPosting.normalizedCompanyName === posting.normalizedCompanyName
              ? { ...currentPosting, isFollowed: false }
              : currentPosting
          )
        );
        setNotice(`Unfollowed ${posting.company}.`);
      } else {
        const followedCompany = await followCompany(posting.company);
        setPostings((currentPostings) =>
          currentPostings.map((currentPosting) =>
            currentPosting.normalizedCompanyName === followedCompany.normalizedCompanyName
              ? { ...currentPosting, isFollowed: true }
              : currentPosting
          )
        );
        setNotice(`Following ${posting.company}.`);
      }
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Company follow update failed.");
    }
  }, []);

  const handleTrack = useCallback(async (posting: JobPostingDto) => {
    setError(null);
    try {
      if (posting.trackedApplicationId) {
        await deleteApplication(posting.trackedApplicationId);
        setPostings((currentPostings) =>
          currentPostings.map((currentPosting) =>
            currentPosting.id === posting.id ? { ...currentPosting, isTracked: false, trackedApplicationId: null } : currentPosting
          )
        );
        setApplications((currentApplications) =>
          currentApplications.filter((application) => application.id !== posting.trackedApplicationId)
        );
        await refreshApplicationActivity();
        setNotice(`${posting.company} application removed from tracking.`);
      } else {
        setPendingTrackPosting(posting);
        setExternalTrackingUrl("");
      }
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not update application tracking.");
    }
  }, [refreshApplicationActivity]);
  const handleCloseTrackModal = useCallback(() => {
    if (isTrackModalSubmitting) {
      return;
    }

    setPendingTrackPosting(null);
    setExternalTrackingUrl("");
  }, [isTrackModalSubmitting]);
  const handleConfirmTrack = useCallback(async () => {
    if (!pendingTrackPosting) {
      return;
    }

    setError(null);
    setIsTrackModalSubmitting(true);
    try {
      const application = await createApplication(pendingTrackPosting.id, externalTrackingUrl.trim() || null);
      setApplications((currentApplications) => {
        const existingApplication = currentApplications.some((currentApplication) => currentApplication.id === application.id);
        return existingApplication
          ? currentApplications.map((currentApplication) =>
              currentApplication.id === application.id ? application : currentApplication
            )
          : [application, ...currentApplications];
      });
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) =>
          currentPosting.id === pendingTrackPosting.id
            ? { ...currentPosting, isTracked: true, trackedApplicationId: application.id }
            : currentPosting
        )
      );
      setNotice(`${pendingTrackPosting.company} application added to tracking.`);
      setPendingTrackPosting(null);
      setExternalTrackingUrl("");
      await refreshApplicationActivity();
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not add application to tracking.");
    } finally {
      setIsTrackModalSubmitting(false);
    }
  }, [externalTrackingUrl, pendingTrackPosting, refreshApplicationActivity]);
  const handleApplicationStatusChange = useCallback(
    async (application: ApplicationDto, status: ApplicationStatus) => {
      if (application.status === status) {
        return;
      }

      setError(null);
      try {
        const updatedApplication = await updateApplicationStatus(application.id, status);
        setApplications((currentApplications) =>
          currentApplications.map((currentApplication) =>
            currentApplication.id === updatedApplication.id ? updatedApplication : currentApplication
          )
        );
        setNotice(`${application.company} moved to ${getApplicationStatusLabel(status)}.`);
        await refreshApplicationActivity();
      } catch (statusError) {
        setError(statusError instanceof Error ? statusError.message : "Could not update application status.");
      }
    },
    [refreshApplicationActivity]
  );
  const removeApplicationFromTracker = useCallback((application: ApplicationDto) => {
    setApplications((currentApplications) =>
      currentApplications.filter((currentApplication) => currentApplication.id !== application.id)
    );
    if (application.jobPostingId) {
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) =>
          currentPosting.id === application.jobPostingId
            ? { ...currentPosting, isTracked: false, trackedApplicationId: null }
            : currentPosting
        )
      );
    }
  }, []);
  const handleApplicationArchive = useCallback(
    async (application: ApplicationDto) => {
      setError(null);
      try {
        await archiveApplication(application.id);
        removeApplicationFromTracker(application);
        setNotice(`${application.company} application archived.`);
      } catch (archiveError) {
        setError(archiveError instanceof Error ? archiveError.message : "Could not archive application.");
      }
    },
    [removeApplicationFromTracker]
  );
  const handleApplicationDelete = useCallback(
    async (application: ApplicationDto) => {
      setError(null);
      try {
        await deleteApplication(application.id);
        removeApplicationFromTracker(application);
        await refreshApplicationActivity();
        setNotice(`${application.company} application deleted.`);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete application.");
      }
    },
    [refreshApplicationActivity, removeApplicationFromTracker]
  );
  const handleSelectPosting = useCallback((posting: JobPostingDto) => {
    setSelectedPostingId(posting.id);
  }, []);

  return (
    <Theme theme={carbonTheme} className={`app-root app-root--${themeMode}`}>
      <Header aria-label="swe.locker" className="app-header">
        <SkipToContent />
        <HeaderName href="/" prefix="swe">
          locker
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={themeMode === "dark" ? "Use light theme" : "Use dark theme"}
            tooltipAlignment="end"
            onClick={() => setThemeMode((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
          >
            {themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <Content id="main-content" className="app-content">
        <Grid fullWidth className="dashboard-grid">
          <Column sm={4} md={8} lg={16}>
            <div className="app-tabs">
              <Tabs
                selectedIndex={selectedTabIndex}
                onChange={({ selectedIndex }) => {
                  setSelectedTabIndex(selectedIndex);
                  if (selectedIndex === 2) {
                    setHasOpenedStats(true);
                  }
                }}
              >
                <div className="page-header-box">
                  <div className="page-header-breadcrumb-row">
                    <Breadcrumb noTrailingSlash size="sm">
                      <BreadcrumbItem href="/">Homepage</BreadcrumbItem>
                      <BreadcrumbItem isCurrentPage>{pageHeader.title}</BreadcrumbItem>
                    </Breadcrumb>
                    <Tag type="gray" size="sm">
                      {sourceConfig?.season ?? "Summer 2026"}
                    </Tag>
                  </div>

                  <div className="page-header-content">
                    <div>
                      <h1>{pageHeader.title}</h1>
                      <p>{pageHeader.subtitle}</p>
                    </div>
                    <div className="page-header-metric" aria-label={`${pageHeader.metricLabel}: ${pageHeader.metricValue}`}>
                      <span>{pageHeader.metricLabel}</span>
                      <strong>{pageHeader.metricValue}</strong>
                    </div>
                  </div>

                  <div className="page-header-tabs">
                    <TabList aria-label="Dashboard sections" size="sm">
                      <Tab>Postings</Tab>
                      <Tab>Applications</Tab>
                      <Tab>Stats</Tab>
                    </TabList>
                  </div>
                </div>

                <TabPanels>
                  <TabPanel className="app-tab-panel">
                    <Grid fullWidth className="dashboard-grid dashboard-grid--tab dashboard-grid--postings">
                      <Column sm={4} md={8} lg={4} className="posting-side-column">
                        <Tile className="filters-tile">
                          <h2>Filters</h2>
                          <div className="filters-stack">
                            <TextInput
                              id="posting-search"
                              labelText="Search"
                              placeholder="Company, role, category"
                              size="sm"
                              value={search}
                              onChange={(event) => setSearch(event.target.value)}
                            />
                            <TextInput
                              id="posting-location"
                              labelText="Location"
                              placeholder="Remote, NYC, CA"
                              size="sm"
                              value={location}
                              onChange={(event) => setLocation(event.target.value)}
                            />
                            <MultiSelect
                              id="posting-category"
                              titleText="Category"
                              label="All categories"
                              items={categories}
                              itemToString={(item) => item}
                              selectedItems={categoryFilters}
                              selectionFeedback="fixed"
                              size="sm"
                              onChange={({ selectedItems }) => setCategoryFilters(selectedItems ?? [])}
                            />
                            <MultiSelect
                              id="posting-tags"
                              titleText="Tags"
                              label="All tags"
                              items={postingTagFilters}
                              itemToString={(item) => item.label}
                              selectedItems={tagFilters}
                              selectionFeedback="fixed"
                              size="sm"
                              onChange={({ selectedItems }) => setTagFilters(selectedItems ?? [])}
                            />
                            <MultiSelect
                              id="posting-sponsorship"
                              titleText="Sponsorship"
                              label="Any sponsorship status"
                              items={sponsorshipFilters}
                              itemToString={(item) => item.label}
                              selectedItems={sponsorship}
                              selectionFeedback="fixed"
                              size="sm"
                              onChange={({ selectedItems }) => setSponsorship(selectedItems ?? [])}
                            />
                            <MultiSelect
                              id="posting-citizenship"
                              titleText="Citizenship"
                              label="Any citizenship status"
                              items={citizenshipFilters}
                              itemToString={(item) => item.label}
                              selectedItems={citizenship}
                              selectionFeedback="fixed"
                              size="sm"
                              onChange={({ selectedItems }) => setCitizenship(selectedItems ?? [])}
                            />
                          </div>
                        </Tile>
                      </Column>

                      <Column sm={4} md={8} lg={8} className="posting-feed-column">
                        <Tile className="feed-shell feed-shell--scroll">
                          <div className="section-header">
                            <div>
                              <h2>Latest postings</h2>
                              <p>
                                {visiblePostings.length} of {postings.length} postings shown
                              </p>
                            </div>
                            {sourceConfig ? <Tag type="gray">{sourceConfig.season}</Tag> : null}
                          </div>

                          {isLoading ? <Loading description="Loading dashboard" withOverlay={false} /> : null}

                          <div className="posting-list" aria-label="Internship postings">
                            {visiblePostings.map((posting) => (
                              <PostingCard
                                key={posting.id}
                                isSelected={posting.id === selectedPostingId}
                                posting={posting}
                                onFollow={handleFollow}
                                onSelect={handleSelectPosting}
                                onTrack={handleTrack}
                              />
                            ))}

                            {!isLoading && visiblePostings.length === 0 ? (
                              <div className="posting-empty">
                                <p>No postings match the current filters.</p>
                                <span>Adjust filters.</span>
                              </div>
                            ) : null}
                          </div>
                        </Tile>
                      </Column>

                      <Column sm={4} md={8} lg={4} className="posting-side-column">
                        <div className="sidebar-stack">
                          {error ? (
                            <InlineNotification kind="error" lowContrast title="Dashboard error" subtitle={error} hideCloseButton />
                          ) : null}
                          {notice ? (
                            <InlineNotification
                              kind="success"
                              lowContrast
                              title="Updated"
                              subtitle={notice}
                              onCloseButtonClick={() => setNotice(null)}
                            />
                          ) : null}

                          <VisualizationPanel posting={selectedPosting} themeMode={themeMode} />
                        </div>
                      </Column>
                    </Grid>
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <div className="tracker-notices">
                      {error ? <InlineNotification kind="error" lowContrast title="Dashboard error" subtitle={error} hideCloseButton /> : null}
                      {notice ? (
                        <InlineNotification
                          kind="success"
                          lowContrast
                          title="Updated"
                          subtitle={notice}
                          onCloseButtonClick={() => setNotice(null)}
                        />
                      ) : null}
                    </div>
                    <ApplicationTrackerPanel
                      applications={applications}
                      isLoading={isLoading}
                      onArchive={handleApplicationArchive}
                      onDelete={handleApplicationDelete}
                      onStatusChange={handleApplicationStatusChange}
                    />
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <div className="tracker-notices">
                      {error ? <InlineNotification kind="error" lowContrast title="Dashboard error" subtitle={error} hideCloseButton /> : null}
                      {notice ? (
                        <InlineNotification
                          kind="success"
                          lowContrast
                          title="Updated"
                          subtitle={notice}
                          onCloseButtonClick={() => setNotice(null)}
                        />
                      ) : null}
                    </div>
                    <StatsPanel
                      activityDays={activityDays}
                      applications={applications}
                      isChartActive={hasOpenedStats || selectedTabIndex === 2}
                      postings={postings}
                      themeMode={themeMode}
                    />
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </Column>
        </Grid>
      </Content>

      <Modal
        modalHeading={pendingTrackPosting ? `Track ${pendingTrackPosting.company}` : "Track application"}
        modalLabel="Application tracker"
        open={Boolean(pendingTrackPosting)}
        primaryButtonDisabled={isTrackModalSubmitting}
        primaryButtonText={isTrackModalSubmitting ? "Tracking" : "Track"}
        secondaryButtonText="Cancel"
        size="sm"
        onRequestClose={handleCloseTrackModal}
        onRequestSubmit={() => void handleConfirmTrack()}
      >
        <div className="track-modal-body">
          <p>{pendingTrackPosting?.role}</p>
          <TextInput
            id="external-tracking-url"
            labelText="External tracking link"
            placeholder="https://company.example.com/application"
            size="sm"
            type="url"
            value={externalTrackingUrl}
            onChange={(event) => setExternalTrackingUrl(event.target.value)}
          />
        </div>
      </Modal>
    </Theme>
  );
}

export default App;
