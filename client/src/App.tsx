import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  MultiSelect,
  SkipToContent,
  Tag,
  TextInput,
  Theme,
  Tile
} from "@carbon/react";
import { Add, Launch, Moon, Star, StarFilled, Sun } from "@carbon/icons-react";
import type { JobPostingDto, SourceConfigDto } from "../../shared/src/index";
import {
  createApplication,
  deleteApplication,
  followCompany,
  getPostings,
  getSourceConfig,
  unfollowCompany
} from "./api";
import "./styles.scss";

type ThemeMode = "light" | "dark";

const themeStorageKey = "swe.locker.theme";
const darkPreferenceQuery = "(prefers-color-scheme: dark)";

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
  posting: JobPostingDto;
  onFollow: (posting: JobPostingDto) => Promise<void>;
  onTrack: (posting: JobPostingDto) => Promise<void>;
};

const PostingCard = memo(function PostingCard({ posting, onFollow, onTrack }: PostingCardProps) {
  return (
    <article className="posting-card">
      <div className="posting-main">
        <div className="posting-title-line">
          <div className="posting-company">
            <Button
              hasIconOnly
              kind="ghost"
              size="sm"
              renderIcon={posting.isFollowed ? StarFilled : Star}
              iconDescription={posting.isFollowed ? `Unfollow ${posting.company}` : `Follow ${posting.company}`}
              onClick={() => void onFollow(posting)}
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
        <Button kind="secondary" size="sm" renderIcon={Add} onClick={() => void onTrack(posting)}>
          {posting.isTracked ? "Untrack" : "Track"}
        </Button>
        {posting.primaryApplicationUrl ? (
          <Button kind="primary" size="sm" renderIcon={Launch} href={posting.primaryApplicationUrl} target="_blank">
            Apply
          </Button>
        ) : null}
      </div>
    </article>
  );
});

function App() {
  const didLoadInitialSnapshot = useRef(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [sourceConfig, setSourceConfig] = useState<SourceConfigDto | null>(null);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [tagFilters, setTagFilters] = useState<PostingTagFilter[]>([]);
  const [sponsorship, setSponsorship] = useState<PostingFacetFilter[]>([]);
  const [citizenship, setCitizenship] = useState<PostingFacetFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const carbonTheme = themeMode === "dark" ? "g100" : "white";
  const deferredSearch = useDeferredValue(search);
  const deferredLocation = useDeferredValue(location);

  const loadDashboardSnapshot = useCallback(async () => {
    setError(null);
    const [source, postingList] = await Promise.all([getSourceConfig(), getPostings()]);
    setSourceConfig(source);
    setPostings(postingList);
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
  const statItems = useMemo(() => {
    const trackedApplicationCount = postings.filter((posting) => posting.isTracked).length;

    return [
      { label: "Total postings", value: postings.length },
      { label: "New today", value: postings.filter((posting) => posting.isNewToday).length },
      { label: "Followed matches", value: postings.filter((posting) => posting.isFollowed).length },
      { label: "Tracked applications", value: trackedApplicationCount },
      { label: "Applied", value: trackedApplicationCount },
      { label: "Interview", value: 0 }
    ];
  }, [postings]);

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
        setNotice(`${posting.company} application removed from tracking.`);
      } else {
        const application = await createApplication(posting.id);
        setPostings((currentPostings) =>
          currentPostings.map((currentPosting) =>
            currentPosting.id === posting.id
              ? { ...currentPosting, isTracked: true, trackedApplicationId: application.id }
              : currentPosting
          )
        );
        setNotice(`${posting.company} application added to tracking.`);
      }
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not update application tracking.");
    }
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
                <Tag type="gray" size="md">
                  {sourceConfig?.season ?? "Summer 2026"}
                </Tag>
                <h1>Internship dashboard</h1>
                <p>{sourceConfig?.displayName ?? "SimplifyJobs internship postings"}</p>
              </div>
            </div>
          </Column>

          <Column sm={4} md={8} lg={4}>
            <Tile className="filters-tile">
              <h2>Filters</h2>
              <div className="filters-stack">
                <TextInput
                  id="posting-search"
                  labelText="Search"
                  placeholder="Company, role, category"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <TextInput
                  id="posting-location"
                  labelText="Location"
                  placeholder="Remote, NYC, CA"
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
                  <PostingCard key={posting.id} posting={posting} onFollow={handleFollow} onTrack={handleTrack} />
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
                <InlineNotification kind="success" lowContrast title="Updated" subtitle={notice} onCloseButtonClick={() => setNotice(null)} />
              ) : null}

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
      </Content>
    </Theme>
  );
}

export default App;
