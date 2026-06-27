import { memo, type KeyboardEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
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
import type { ApplicationActivityDayDto, ApplicationDto, ApplicationStatus, JobPostingDto, SourceConfigDto } from "../../shared/src/index";
import {
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
  { id: "sponsorship-available", label: "Sponsorship available", matches: (posting) => !posting.doesNotOfferSponsorship },
  { id: "no-sponsorship", label: "No sponsorship", matches: (posting) => posting.doesNotOfferSponsorship }
];

const citizenshipFilters: PostingFacetFilter[] = [
  { id: "no-us-citizenship", label: "No US citizenship required", matches: (posting) => !posting.requiresUsCitizenship },
  { id: "us-citizenship", label: "US citizenship required", matches: (posting) => posting.requiresUsCitizenship }
];

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

async function geocodeLocation(location: string, signal: AbortSignal) {
  const cacheKey = normalizeFilterText(location);
  const cachedLocation = geocodeCache.get(cacheKey);
  if (cachedLocation) {
    return cachedLocation;
  }

  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    limit: "1"
  });
  const request = fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?${params}`, {
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

function CarbonSpatialMap({ location, posting, themeMode }: { location: string | undefined; posting: JobPostingDto; themeMode: ThemeMode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const mapboxRef = useRef<MapboxGl | null>(null);
  const [mapMessage, setMapMessage] = useState<string | null>(mapboxAccessToken ? "Loading map" : "Mapbox token required");

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
      mapRef.current = new mapboxgl.Map({
        attributionControl: false,
        center: worldMapView.center,
        container: containerRef.current,
        cooperativeGestures: true,
        logoPosition: "bottom-right",
        style: carbonMapStyles[themeMode],
        zoom: worldMapView.zoom
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
      setMapMessage(null);
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
    if (!mapboxAccessToken) {
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
      const resolvedCenter = await geocodeLocation(location, abortController.signal);

      if (abortController.signal.aborted) {
        return;
      }

      if (!resolvedCenter) {
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
      markerRef.current = new mapboxRef.current.Marker({ color: "#0f62fe" }).setLngLat(resolvedCenter).addTo(map);
      map.flyTo({ center: resolvedCenter, zoom: 9 });
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
  }, [location, posting.id]);

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
}

function VisualizationPanel({ posting, themeMode }: { posting: JobPostingDto | null; themeMode: ThemeMode }) {
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
    { label: "Sponsorship", value: posting.doesNotOfferSponsorship ? "No sponsorship" : "Sponsorship available" },
    { label: "Citizenship", value: posting.requiresUsCitizenship ? "US citizenship required" : "No US citizenship required" }
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
}

function ApplicationActivityHeatmap({ days }: { days: ApplicationActivityDayDto[] }) {
  const weeks = useMemo(() => getActivityWeeks(days), [days]);
  const totalActivity = useMemo(() => days.reduce((total, day) => total + day.count, 0), [days]);
  const maxCount = useMemo(() => Math.max(0, ...days.map((day) => day.count)), [days]);

  return (
    <Tile className="activity-tile">
      <div className="section-header">
        <div>
          <h2>Application activity</h2>
          <p>{totalActivity} tracker updates in the last 365 days</p>
        </div>
      </div>

      <div className="activity-heatmap" aria-label="Application activity heatmap">
        {weeks.map((week, weekIndex) => (
          <div className="activity-week" key={weekIndex}>
            {Array.from({ length: 7 }, (_, dayIndex) => {
              const day = week[dayIndex] ?? null;
              if (!day) {
                return <span className="activity-cell activity-cell--empty" key={dayIndex} aria-hidden="true" />;
              }

              return (
                <span
                  className={`activity-cell activity-cell--level-${getActivityLevel(day.count, maxCount)}`}
                  key={day.date}
                  title={`${day.date}: ${day.count} tracker update${day.count === 1 ? "" : "s"}`}
                  aria-label={`${day.date}: ${day.count} tracker update${day.count === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="activity-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span className={`activity-cell activity-cell--level-${level}`} key={level} />
        ))}
        <span>More</span>
      </div>
    </Tile>
  );
}

function ApplicationCard({
  application,
  onStatusChange
}: {
  application: ApplicationDto;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
}) {
  const statusLabel = getApplicationStatusLabel(application.status);

  return (
    <article className="application-card">
      <div className="application-card__header">
        <div>
          <h3>{application.company}</h3>
          <p>{application.role}</p>
        </div>
        <Tag type="gray">{statusLabel}</Tag>
      </div>

      <div className="application-card__meta">
        <span>Updated {formatDate(application.updatedAt)}</span>
      </div>

      <div className="application-card__links">
        {application.jobPostingUrl ? (
          <Button kind="ghost" size="sm" renderIcon={Launch} href={application.jobPostingUrl} target="_blank">
            Posting
          </Button>
        ) : null}
        {application.externalApplicationTrackingUrl ? (
          <Button kind="ghost" size="sm" renderIcon={Launch} href={application.externalApplicationTrackingUrl} target="_blank">
            Tracker
          </Button>
        ) : null}
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

function ApplicationTrackerPanel({
  applications,
  activityDays,
  isLoading,
  onStatusChange
}: {
  applications: ApplicationDto[];
  activityDays: ApplicationActivityDayDto[];
  isLoading: boolean;
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
      <ApplicationActivityHeatmap days={activityDays} />

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
                    <ApplicationCard application={application} key={application.id} onStatusChange={onStatusChange} />
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
}

function App() {
  const didLoadInitialSnapshot = useRef(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [sourceConfig, setSourceConfig] = useState<SourceConfigDto | null>(null);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [activityDays, setActivityDays] = useState<ApplicationActivityDayDto[]>([]);
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
  const applicationCountsByStatus = useMemo(() => {
    const counts = new Map<ApplicationStatus, number>();
    for (const option of applicationStatuses) {
      counts.set(option.status, 0);
    }
    for (const application of applications) {
      counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
    }
    return counts;
  }, [applications]);
  const statItems = useMemo(() => {
    return [
      { label: "Total postings", value: postings.length },
      { label: "New today", value: postings.filter((posting) => posting.isNewToday).length },
      { label: "Followed matches", value: postings.filter((posting) => posting.isFollowed).length },
      { label: "Tracked applications", value: applications.length },
      { label: "Applied", value: applicationCountsByStatus.get("APPLIED") ?? 0 },
      { label: "Interview", value: applicationCountsByStatus.get("INTERVIEW") ?? 0 },
      { label: "Offer", value: applicationCountsByStatus.get("OFFER") ?? 0 },
      { label: "Hired", value: applicationCountsByStatus.get("HIRED") ?? 0 },
      { label: "Rejected", value: applicationCountsByStatus.get("REJECTED") ?? 0 }
    ];
  }, [applicationCountsByStatus, applications.length, postings]);

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
        void refreshApplicationActivity().catch((activityError: unknown) => {
          setError(activityError instanceof Error ? activityError.message : "Could not refresh application activity.");
        });
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
            <div className="dashboard-heading">
              <div>
                <Tag type="gray" size="sm">
                  {sourceConfig?.season ?? "Summer 2026"}
                </Tag>
                <h1>Internship dashboard</h1>
                <p>{sourceConfig?.displayName ?? "SimplifyJobs internship postings"}</p>
              </div>
            </div>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <div className="app-tabs">
              <Tabs>
                <TabList aria-label="Dashboard sections" size="sm">
                  <Tab>Postings</Tab>
                  <Tab>Applications</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel className="app-tab-panel">
                    <Grid fullWidth className="dashboard-grid dashboard-grid--tab">
                    <Column sm={4} md={8} lg={4}>
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
                            label="All sponsorship"
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
                            label="All citizenship"
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

                    <Column sm={4} md={8} lg={8}>
                      <Tile className="feed-shell">
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

                    <Column sm={4} md={8} lg={4}>
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

                        <Tile className="stats-tile">
                          <h2>Stats</h2>
                          <div className="stats-grid">
                            {statItems.map((item) => (
                              <div className="stat-item" key={item.label}>
                                <strong>{item.value}</strong>
                                <span>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </Tile>
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
                      activityDays={activityDays}
                      isLoading={isLoading}
                      onStatusChange={handleApplicationStatusChange}
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
