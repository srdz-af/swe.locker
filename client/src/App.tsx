import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Column,
  Content,
  Grid,
  Header,
  HeaderName,
  InlineNotification,
  Loading,
  Select,
  SelectItem,
  SkipToContent,
  Tag,
  TextInput,
  Tile
} from "@carbon/react";
import { Add, Launch, Renew, Star, StarFilled } from "@carbon/icons-react";
import type { DashboardStatsDto, JobPostingDto, SourceConfigDto } from "../../shared/src/index";
import {
  apiBaseUrl,
  createApplication,
  deleteApplication,
  followCompany,
  getDashboardStats,
  getPostings,
  getSourceConfig,
  refreshSource,
  unfollowCompany
} from "./api";
import "./styles.scss";

const defaultStats: DashboardStatsDto = {
  totalPostings: 0,
  newPostingsToday: 0,
  followedCompanyPostings: 0,
  trackedApplications: 0,
  applicationsByStatus: {
    APPLIED: 0,
    INTERVIEW: 0,
    OFFER: 0,
    HIRED: 0,
    REJECTED: 0
  },
  lastFetchRun: null
};

function App() {
  const [sourceConfig, setSourceConfig] = useState<SourceConfigDto | null>(null);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [stats, setStats] = useState<DashboardStatsDto>(defaultStats);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [followedOnly, setFollowedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setError(null);
    const [source, postingList, dashboardStats] = await Promise.all([
      getSourceConfig(),
      getPostings({ search, category, location, newOnly, followedOnly }),
      getDashboardStats()
    ]);
    setSourceConfig(source);
    setPostings(postingList);
    setStats(dashboardStats);
  }, [category, followedOnly, location, newOnly, search]);

  useEffect(() => {
    setIsLoading(true);
    void loadDashboard()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
      })
      .finally(() => setIsLoading(false));
  }, [loadDashboard]);

  const categories = useMemo(
    () => Array.from(new Set(postings.map((posting) => posting.category))).sort(),
    [postings]
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const result = await refreshSource();
      setNotice(
        `Refresh complete: ${result.fetchRun.postingsFound} postings, ${result.fetchRun.newPostings} new.`
      );
      await loadDashboard();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleFollow(posting: JobPostingDto) {
    setError(null);
    try {
      if (posting.isFollowed) {
        await unfollowCompany(posting.normalizedCompanyName);
        setNotice(`Unfollowed ${posting.company}.`);
      } else {
        await followCompany(posting.company);
        setNotice(`Following ${posting.company}.`);
      }
      await loadDashboard();
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Company follow update failed.");
    }
  }

  async function handleTrack(posting: JobPostingDto) {
    setError(null);
    try {
      if (posting.trackedApplicationId) {
        await deleteApplication(posting.trackedApplicationId);
        setNotice(`${posting.company} application removed from tracking.`);
      } else {
        await createApplication(posting.id);
        setNotice(`${posting.company} application added to tracking.`);
      }
      await loadDashboard();
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not update application tracking.");
    }
  }

  const statItems = [
    { label: "Total postings", value: stats.totalPostings },
    { label: "New today", value: stats.newPostingsToday },
    { label: "Followed matches", value: stats.followedCompanyPostings },
    { label: "Tracked applications", value: stats.trackedApplications },
    { label: "Applied", value: stats.applicationsByStatus.APPLIED },
    { label: "Interview", value: stats.applicationsByStatus.INTERVIEW }
  ];

  return (
    <>
      <Header aria-label="swe.locker">
        <SkipToContent />
        <HeaderName href="/" prefix="swe">
          locker
        </HeaderName>
      </Header>

      <Content id="main-content" className="app-content">
        <Grid fullWidth className="dashboard-grid">
          <Column sm={4} md={8} lg={16}>
            <div className="dashboard-heading">
              <div>
                <Tag type="blue" size="md">
                  {sourceConfig?.season ?? "Summer 2026"}
                </Tag>
                <h1>Internship dashboard</h1>
                <p>{sourceConfig?.displayName ?? "SimplifyJobs internship postings"}</p>
              </div>

              <div className="dashboard-actions">
                <Button kind="secondary" renderIcon={Renew} onClick={handleRefresh} disabled={isRefreshing}>
                  {isRefreshing ? "Refreshing" : "Refresh source"}
                </Button>
              </div>
            </div>
          </Column>

          <Column sm={4} md={8} lg={11}>
            <Tile className="feed-shell">
              <div className="section-header">
                <div>
                  <h2>Latest postings</h2>
                  <p>{postings.length} postings shown from {apiBaseUrl}</p>
                </div>
                {sourceConfig ? <Tag type="gray">{sourceConfig.season}</Tag> : null}
              </div>

              <div className="filters-grid">
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
                <Select id="posting-category" labelText="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <SelectItem text="All categories" value="" />
                  {categories.map((categoryOption) => (
                    <SelectItem text={categoryOption} value={categoryOption} key={categoryOption} />
                  ))}
                </Select>
                <div className="filter-checks">
                  <Checkbox id="new-only" labelText="New only" checked={newOnly} onChange={(_, data) => setNewOnly(Boolean(data.checked))} />
                  <Checkbox
                    id="followed-only"
                    labelText="Followed only"
                    checked={followedOnly}
                    onChange={(_, data) => setFollowedOnly(Boolean(data.checked))}
                  />
                </div>
              </div>

              {isLoading ? <Loading description="Loading dashboard" withOverlay={false} /> : null}

              <div className="posting-list" aria-label="Internship postings">
                {postings.map((posting) => (
                  <article className="posting-card" key={posting.id}>
                    <div className="posting-main">
                      <div className="posting-title-line">
                        <h3>{posting.company}</h3>
                        <div className="posting-tags">
                          {posting.isNewToday ? <Tag type="green">New</Tag> : null}
                          {posting.isFollowed ? <Tag type="purple">Followed</Tag> : null}
                          {posting.isTracked ? <Tag type="cyan">Tracked</Tag> : null}
                          {posting.isFaang ? <Tag type="red">FAANG+</Tag> : null}
                          {posting.requiresAdvancedDegree ? <Tag type="magenta">Advanced degree</Tag> : null}
                          {posting.doesNotOfferSponsorship ? <Tag type="cool-gray">No sponsorship</Tag> : null}
                          {posting.requiresUsCitizenship ? <Tag type="teal">US citizenship</Tag> : null}
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
                        kind="ghost"
                        size="sm"
                        renderIcon={posting.isFollowed ? StarFilled : Star}
                        onClick={() => void handleFollow(posting)}
                      >
                        {posting.isFollowed ? "Unfollow" : "Follow"}
                      </Button>
                      <Button kind="secondary" size="sm" renderIcon={Add} onClick={() => void handleTrack(posting)}>
                        {posting.isTracked ? "Untrack" : "Track"}
                      </Button>
                      {posting.primaryApplicationUrl ? (
                        <Button kind="primary" size="sm" renderIcon={Launch} href={posting.primaryApplicationUrl} target="_blank">
                          Apply
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}

                {!isLoading && postings.length === 0 ? (
                  <div className="posting-empty">
                    <p>No postings match the current filters.</p>
                    <span>Refresh the source or adjust filters.</span>
                  </div>
                ) : null}
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={5}>
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

              <Tile className="source-tile">
                <h2>Source</h2>
                <p>{sourceConfig?.repositoryUrl ?? "Source configuration loading"}</p>
                <p>
                  Last fetch:{" "}
                  {stats.lastFetchRun?.completedAt ? new Date(stats.lastFetchRun.completedAt).toLocaleString() : "No completed fetch yet"}
                </p>
              </Tile>
            </div>
          </Column>
        </Grid>
      </Content>
    </>
  );
}

export default App;
