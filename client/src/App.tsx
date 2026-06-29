import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
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
  TextInput,
  Theme,
  Tile,
  Tabs
} from "@carbon/react";
import { Moon, Sun } from "@carbon/icons-react";
import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  JobPostingDto,
  UpdateApplicationDetailsRequest
} from "../../shared/src/index";
import {
  archiveApplication,
  createApplication,
  createManualApplication,
  createResumeRun,
  deleteApplication,
  deleteResumeRun,
  followCompany,
  getApplicationActivity,
  getPostings,
  listResumeRuns,
  listApplications,
  updateApplicationDetails,
  updateApplicationStatus,
  unfollowCompany
} from "./api";
import {
  applicationStatuses,
  darkPreferenceQuery,
  initialManualApplicationForm,
  themeStorageKey
} from "./constants";
import { ApplicationTrackerPanel } from "./features/applications/ApplicationTrackerPanel";
import { matchesPostingFilters, postingTagFilters, citizenshipFilters, sponsorshipFilters } from "./features/postings/filters";
import { VirtualizedPostingList } from "./features/postings/PostingList";
import { VisualizationPanel } from "./features/postings/VisualizationPanel";
import { ResumeGraderPanel } from "./features/resume-grader/ResumeGraderPanel";
import {
  compareResumeRunsByCreatedAtDesc,
  createExtractedResumeRun,
  extractResumeText,
  toCreateResumeRunRequest
} from "./features/resume-grader/resumeRuns";
import { StatsPanel } from "./features/stats/StatsPanel";
import type {
  ManualApplicationFormState,
  PostingFacetFilter,
  PostingTagFilter,
  ResumeGraderRun,
  ThemeMode
} from "./types/app";
import { getApplicationStatusLabel } from "./utils/format";
import "@carbon/charts-react/styles.css";
import "./styles.scss";

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

function App() {
  const didLoadInitialSnapshot = useRef(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [activityDays, setActivityDays] = useState<ApplicationActivityDayDto[]>([]);
  const [resumeRuns, setResumeRuns] = useState<ResumeGraderRun[]>([]);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [hasOpenedStats, setHasOpenedStats] = useState(false);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [pendingTrackPosting, setPendingTrackPosting] = useState<JobPostingDto | null>(null);
  const [externalTrackingUrl, setExternalTrackingUrl] = useState("");
  const [isManualApplicationModalOpen, setIsManualApplicationModalOpen] = useState(false);
  const [manualApplicationForm, setManualApplicationForm] = useState<ManualApplicationFormState>(initialManualApplicationForm);
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [tagFilters, setTagFilters] = useState<PostingTagFilter[]>([]);
  const [sponsorship, setSponsorship] = useState<PostingFacetFilter[]>([]);
  const [citizenship, setCitizenship] = useState<PostingFacetFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackModalSubmitting, setIsTrackModalSubmitting] = useState(false);
  const [isManualApplicationSubmitting, setIsManualApplicationSubmitting] = useState(false);
  const [isApplicationDetailsSaving, setIsApplicationDetailsSaving] = useState(false);
  const [isResumeUploadPending, setIsResumeUploadPending] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const carbonTheme = themeMode === "dark" ? "g100" : "white";
  const deferredSearch = useDeferredValue(search);
  const deferredLocation = useDeferredValue(location);

  const loadDashboardSnapshot = useCallback(async () => {
    setError(null);
    const [postingList, applicationList, activityList, persistedResumeRuns] = await Promise.all([
      getPostings(),
      listApplications(),
      getApplicationActivity(),
      listResumeRuns()
    ]);

    setPostings(postingList);
    setApplications(applicationList);
    setActivityDays(activityList);
    setResumeRuns([...persistedResumeRuns].sort(compareResumeRunsByCreatedAtDesc));
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

  useEffect(() => {
    setSelectedApplicationId((currentApplicationId) => {
      if (currentApplicationId && applications.some((application) => application.id === currentApplicationId)) {
        return currentApplicationId;
      }

      return applications[0]?.id ?? null;
    });
  }, [applications]);

  const pageHeader = useMemo(
    () => {
      if (selectedTabIndex === 0) {
        return {
          title: "Postings",
          metricLabel: "Shown",
          metricValue: `${visiblePostings.length}/${postings.length}`
        };
      }

      if (selectedTabIndex === 1) {
        return {
          title: "Applications",
          metricLabel: "Tracked",
          metricValue: String(applications.length)
        };
      }

      if (selectedTabIndex === 2) {
        const latestRun = resumeRuns[0] ?? null;

        return {
          title: "Resume Grader",
          metricLabel: latestRun?.grade === null ? "Latest run" : "Numeric grade",
          metricValue: latestRun ? (latestRun.grade === null ? "Raw text" : `${latestRun.grade}/100`) : "None"
        };
      }

      return {
        title: "Stats",
        metricLabel: "Postings",
        metricValue: String(postings.length)
      };
    },
    [applications.length, postings.length, resumeRuns, selectedTabIndex, visiblePostings.length]
  );

  useEffect(() => {
    document.documentElement.dataset.appTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  const handleResumeUpload = useCallback(async (file: File) => {
    setError(null);
    setNotice(null);
    setResumeUploadError(null);
    setIsResumeUploadPending(true);

    try {
      const parsedText = await extractResumeText(file);

      if (!parsedText) {
        throw new Error("No readable text was found in that file.");
      }

      const resumeRun = await createResumeRun(toCreateResumeRunRequest(createExtractedResumeRun(file, parsedText)));
      setResumeRuns((currentRuns) => [resumeRun, ...currentRuns].sort(compareResumeRunsByCreatedAtDesc));
      setNotice(`Extracted text from ${file.name}.`);
    } catch (uploadError) {
      setResumeUploadError(uploadError instanceof Error ? uploadError.message : "Could not extract resume text.");
    } finally {
      setIsResumeUploadPending(false);
    }
  }, []);

  const handleResumeRunDelete = useCallback(async (run: ResumeGraderRun) => {
    setError(null);
    try {
      await deleteResumeRun(run.id);
      setResumeRuns((currentRuns) => currentRuns.filter((currentRun) => currentRun.id !== run.id));
      setNotice(`${run.sourceName} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete resume run.");
    }
  }, []);

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
      setSelectedApplicationId(application.id);
      setPendingTrackPosting(null);
      setExternalTrackingUrl("");
      await refreshApplicationActivity();
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not add application to tracking.");
    } finally {
      setIsTrackModalSubmitting(false);
    }
  }, [externalTrackingUrl, pendingTrackPosting, refreshApplicationActivity]);

  const handleOpenManualApplicationModal = useCallback(() => {
    setError(null);
    setManualApplicationForm(initialManualApplicationForm);
    setIsManualApplicationModalOpen(true);
  }, []);

  const handleCloseManualApplicationModal = useCallback(() => {
    if (isManualApplicationSubmitting) {
      return;
    }

    setIsManualApplicationModalOpen(false);
    setManualApplicationForm(initialManualApplicationForm);
  }, [isManualApplicationSubmitting]);

  const isManualApplicationSubmitDisabled =
    isManualApplicationSubmitting || !manualApplicationForm.company.trim() || !manualApplicationForm.role.trim();

  const handleCreateManualApplication = useCallback(async () => {
    if (!manualApplicationForm.company.trim() || !manualApplicationForm.role.trim()) {
      return;
    }

    setError(null);
    setIsManualApplicationSubmitting(true);
    try {
      const application = await createManualApplication({
        company: manualApplicationForm.company,
        role: manualApplicationForm.role,
        jobPostingUrl: manualApplicationForm.jobPostingUrl || null,
        externalApplicationTrackingUrl: manualApplicationForm.externalApplicationTrackingUrl || null,
        status: manualApplicationForm.status
      });
      setApplications((currentApplications) => [application, ...currentApplications]);
      setSelectedApplicationId(application.id);
      setNotice(`${application.company} application added.`);
      setIsManualApplicationModalOpen(false);
      setManualApplicationForm(initialManualApplicationForm);
      await refreshApplicationActivity();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create application.");
    } finally {
      setIsManualApplicationSubmitting(false);
    }
  }, [manualApplicationForm, refreshApplicationActivity]);

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

  const handleApplicationDetailsSave = useCallback(
    async (application: ApplicationDto, details: UpdateApplicationDetailsRequest) => {
      setError(null);
      setIsApplicationDetailsSaving(true);
      try {
        const updatedApplication = await updateApplicationDetails(application.id, details);
        setApplications((currentApplications) =>
          currentApplications.map((currentApplication) =>
            currentApplication.id === updatedApplication.id ? updatedApplication : currentApplication
          )
        );
        setSelectedApplicationId(updatedApplication.id);
        setNotice(`${application.company} details saved.`);
      } catch (detailsError) {
        setError(detailsError instanceof Error ? detailsError.message : "Could not save application details.");
        throw detailsError;
      } finally {
        setIsApplicationDetailsSaving(false);
      }
    },
    []
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

  const handleSelectApplication = useCallback((application: ApplicationDto) => {
    setSelectedApplicationId(application.id);
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
                  if (selectedIndex === 3) {
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
                  </div>

                  <div className="page-header-content">
                    <div>
                      <h1>{pageHeader.title}</h1>
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
                      <Tab>Resume Grader</Tab>
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
                          </div>

                          {isLoading ? <Loading description="Loading dashboard" withOverlay={false} /> : null}

                          <VirtualizedPostingList
                            isLoading={isLoading}
                            postings={visiblePostings}
                            selectedPostingId={selectedPostingId}
                            onFollow={handleFollow}
                            onSelect={handleSelectPosting}
                            onTrack={handleTrack}
                          />
                        </Tile>
                      </Column>

                      <Column sm={4} md={8} lg={4} className="posting-side-column">
                        <div className="sidebar-stack">
                          <VisualizationPanel posting={selectedPosting} />
                        </div>
                      </Column>
                    </Grid>
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <ApplicationTrackerPanel
                      applications={applications}
                      isLoading={isLoading}
                      isSavingDetails={isApplicationDetailsSaving}
                      onArchive={handleApplicationArchive}
                      onCreate={handleOpenManualApplicationModal}
                      onDelete={handleApplicationDelete}
                      onDetailsSave={handleApplicationDetailsSave}
                      onSelect={handleSelectApplication}
                      onStatusChange={handleApplicationStatusChange}
                      selectedApplicationId={selectedApplicationId}
                    />
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <ResumeGraderPanel
                      isUploadPending={isResumeUploadPending}
                      onDeleteRun={handleResumeRunDelete}
                      onUpload={handleResumeUpload}
                      runs={resumeRuns}
                      themeMode={themeMode}
                    />
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <StatsPanel
                      activityDays={activityDays}
                      applications={applications}
                      isChartActive={hasOpenedStats || selectedTabIndex === 3}
                      postings={postings}
                      resumeRuns={resumeRuns}
                      themeMode={themeMode}
                    />
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </Column>
        </Grid>
      </Content>

      {error || notice || resumeUploadError ? (
        <div className="floating-notices" aria-live="polite">
          {error ? <InlineNotification kind="error" lowContrast title="Dashboard error" subtitle={error} hideCloseButton /> : null}
          {resumeUploadError ? (
            <InlineNotification kind="error" lowContrast title="Resume upload failed" subtitle={resumeUploadError} hideCloseButton />
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
        </div>
      ) : null}

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

      <Modal
        modalHeading="Add application"
        modalLabel="Application tracker"
        open={isManualApplicationModalOpen}
        primaryButtonDisabled={isManualApplicationSubmitDisabled}
        primaryButtonText={isManualApplicationSubmitting ? "Adding" : "Add"}
        secondaryButtonText="Cancel"
        size="sm"
        onRequestClose={handleCloseManualApplicationModal}
        onRequestSubmit={() => void handleCreateManualApplication()}
      >
        <div className="track-modal-body">
          <TextInput
            id="manual-application-company"
            labelText="Company"
            placeholder="Company name"
            size="sm"
            value={manualApplicationForm.company}
            onChange={(event) =>
              setManualApplicationForm((currentForm) => ({
                ...currentForm,
                company: event.target.value
              }))
            }
          />
          <TextInput
            id="manual-application-role"
            labelText="Role"
            placeholder="Software Engineer Intern"
            size="sm"
            value={manualApplicationForm.role}
            onChange={(event) =>
              setManualApplicationForm((currentForm) => ({
                ...currentForm,
                role: event.target.value
              }))
            }
          />
          <TextInput
            id="manual-application-posting-url"
            labelText="Posting link"
            placeholder="https://company.example.com/job"
            size="sm"
            type="url"
            value={manualApplicationForm.jobPostingUrl}
            onChange={(event) =>
              setManualApplicationForm((currentForm) => ({
                ...currentForm,
                jobPostingUrl: event.target.value
              }))
            }
          />
          <TextInput
            id="manual-application-tracking-url"
            labelText="Tracking link"
            placeholder="https://company.example.com/application"
            size="sm"
            type="url"
            value={manualApplicationForm.externalApplicationTrackingUrl}
            onChange={(event) =>
              setManualApplicationForm((currentForm) => ({
                ...currentForm,
                externalApplicationTrackingUrl: event.target.value
              }))
            }
          />
          <Select
            id="manual-application-status"
            labelText="Status"
            size="sm"
            value={manualApplicationForm.status}
            onChange={(event) =>
              setManualApplicationForm((currentForm) => ({
                ...currentForm,
                status: event.target.value as ApplicationStatus
              }))
            }
          >
            {applicationStatuses.map((option) => (
              <SelectItem key={option.status} text={option.label} value={option.status} />
            ))}
          </Select>
        </div>
      </Modal>
    </Theme>
  );
}

export default App;
