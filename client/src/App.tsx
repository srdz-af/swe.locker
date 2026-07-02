import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionableNotification,
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
  RestoreApplicationSnapshotRequest,
  SourceConfigDto,
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
  getSourceConfigs,
  listResumeRuns,
  listApplications,
  purgeArchivedApplications,
  restoreApplicationSnapshot,
  restoreResumeRunSnapshot,
  unarchiveApplication,
  updateApplicationDetails,
  updateApplicationStatus,
  unfollowCompany
} from "./api";
import {
  activeApplicationStatuses,
  darkPreferenceQuery,
  initialManualApplicationForm,
  isArchivedApplicationStatus,
  modalPrimaryFocusSelector,
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

const allPostingSourcesValue = "all";
const noticeAutoDismissMs = 10_000;

type DashboardNotice = {
  id: number;
  message: string;
  undo?: () => Promise<void> | void;
  isUndoing?: boolean;
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

function App() {
  const didLoadInitialSnapshot = useRef(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfigDto[]>([]);
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
  const [selectedSourceId, setSelectedSourceId] = useState(allPostingSourcesValue);
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
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noticeIdRef = useRef(0);
  const carbonTheme = themeMode === "dark" ? "g100" : "white";
  const deferredSearch = useDeferredValue(search);
  const deferredLocation = useDeferredValue(location);

  const loadDashboardSnapshot = useCallback(async () => {
    setError(null);
    const [sourceConfigList, postingList, applicationList, activityList, persistedResumeRuns] = await Promise.all([
      getSourceConfigs(),
      getPostings(),
      listApplications({ includeArchived: true }),
      getApplicationActivity(),
      listResumeRuns()
    ]);

    setSourceConfigs(sourceConfigList);
    setPostings(postingList);
    setApplications(applicationList);
    setActivityDays(activityList);
    setResumeRuns([...persistedResumeRuns].sort(compareResumeRunsByCreatedAtDesc));
  }, []);

  const refreshApplicationActivity = useCallback(async () => {
    setActivityDays(await getApplicationActivity());
  }, []);

  const dismissNotice = useCallback((noticeId?: number) => {
    setNotice((currentNotice) => {
      if (noticeId !== undefined && currentNotice?.id !== noticeId) {
        return currentNotice;
      }

      return null;
    });
  }, []);

  const showNotice = useCallback((message: string, undo?: () => Promise<void> | void) => {
    noticeIdRef.current += 1;
    setNotice({
      id: noticeIdRef.current,
      message,
      undo
    });
  }, []);

  const upsertApplication = useCallback((application: ApplicationDto) => {
    setApplications((currentApplications) => {
      const remainingApplications = currentApplications.filter((currentApplication) => currentApplication.id !== application.id);
      return [application, ...remainingApplications];
    });

    if (application.jobPostingId) {
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) =>
          currentPosting.id === application.jobPostingId
            ? { ...currentPosting, isTracked: true, trackedApplicationId: application.id }
            : currentPosting
        )
      );
    }

    setSelectedApplicationId(application.id);
  }, []);

  const removeApplicationFromState = useCallback((application: ApplicationDto) => {
    setApplications((currentApplications) =>
      currentApplications.filter((currentApplication) => currentApplication.id !== application.id)
    );

    if (application.jobPostingId) {
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) =>
          currentPosting.id === application.jobPostingId && currentPosting.trackedApplicationId === application.id
            ? { ...currentPosting, isTracked: false, trackedApplicationId: null }
            : currentPosting
        )
      );
    }
  }, []);

  const removeApplicationsFromState = useCallback((applicationsToRemove: ApplicationDto[]) => {
    const applicationIds = new Set(applicationsToRemove.map((application) => application.id));
    const trackedPostingIdsByApplicationId = new Map(
      applicationsToRemove
        .filter((application) => application.jobPostingId)
        .map((application) => [application.id, application.jobPostingId])
    );

    setApplications((currentApplications) =>
      currentApplications.filter((currentApplication) => !applicationIds.has(currentApplication.id))
    );

    if (trackedPostingIdsByApplicationId.size > 0) {
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) => {
          const jobPostingId = currentPosting.trackedApplicationId
            ? trackedPostingIdsByApplicationId.get(currentPosting.trackedApplicationId)
            : null;

          return jobPostingId && currentPosting.id === jobPostingId
            ? { ...currentPosting, isTracked: false, trackedApplicationId: null }
            : currentPosting;
        })
      );
    }
  }, []);

  const archiveApplicationInState = useCallback((application: ApplicationDto) => {
    setApplications((currentApplications) => {
      const hasApplication = currentApplications.some((currentApplication) => currentApplication.id === application.id);
      if (!hasApplication) {
        return [application, ...currentApplications];
      }

      return currentApplications.map((currentApplication) =>
        currentApplication.id === application.id ? application : currentApplication
      );
    });

    if (application.jobPostingId) {
      setPostings((currentPostings) =>
        currentPostings.map((currentPosting) =>
          currentPosting.id === application.jobPostingId && currentPosting.trackedApplicationId === application.id
            ? { ...currentPosting, isTracked: false, trackedApplicationId: null }
            : currentPosting
        )
      );
    }
  }, []);

  const restoreApplicationFromSnapshot = useCallback(
    async (application: ApplicationDto) => {
      const restoredApplication = await restoreApplicationSnapshot(toRestoreApplicationSnapshot(application));
      if (restoredApplication.archivedAt) {
        archiveApplicationInState(restoredApplication);
      } else {
        upsertApplication(restoredApplication);
      }
      await refreshApplicationActivity();
    },
    [archiveApplicationInState, refreshApplicationActivity, upsertApplication]
  );

  const handleNoticeUndo = useCallback(
    async (noticeToUndo: DashboardNotice) => {
      if (!noticeToUndo.undo || noticeToUndo.isUndoing) {
        return;
      }

      setNotice((currentNotice) =>
        currentNotice?.id === noticeToUndo.id ? { ...currentNotice, isUndoing: true } : currentNotice
      );

      try {
        await noticeToUndo.undo();
        dismissNotice(noticeToUndo.id);
      } catch (undoError) {
        setError(undoError instanceof Error ? undoError.message : "Could not undo that operation.");
        setNotice((currentNotice) =>
          currentNotice?.id === noticeToUndo.id ? { ...currentNotice, isUndoing: false } : currentNotice
        );
      }
    },
    [dismissNotice]
  );

  useEffect(() => {
    if (!notice || notice.isUndoing) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => dismissNotice(notice.id), noticeAutoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [dismissNotice, notice]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setError(null), noticeAutoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => {
    if (!resumeUploadError) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setResumeUploadError(null), noticeAutoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [resumeUploadError]);

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

  useEffect(() => {
    setSelectedSourceId((currentSourceId) => {
      if (
        currentSourceId === allPostingSourcesValue ||
        sourceConfigs.some((sourceConfig) => sourceConfig.id === currentSourceId)
      ) {
        return currentSourceId;
      }

      return allPostingSourcesValue;
    });
  }, [sourceConfigs]);

  const sourceFilteredPostings = useMemo(
    () =>
      selectedSourceId === allPostingSourcesValue
        ? postings
        : postings.filter((posting) => posting.sourceConfigId === selectedSourceId),
    [postings, selectedSourceId]
  );
  const categories = useMemo(
    () => Array.from(new Set(sourceFilteredPostings.map((posting) => posting.category))).sort(),
    [sourceFilteredPostings]
  );
  const visiblePostings = useMemo(
    () =>
      sourceFilteredPostings.filter((posting) =>
        matchesPostingFilters(posting, {
          search: deferredSearch,
          categories: categoryFilters,
          location: deferredLocation,
          tags: tagFilters,
          sponsorship,
          citizenship
        })
      ),
    [categoryFilters, citizenship, deferredLocation, deferredSearch, sourceFilteredPostings, sponsorship, tagFilters]
  );

  useEffect(() => {
    setSelectedPostingId((currentPostingId) => {
      if (currentPostingId && sourceFilteredPostings.some((posting) => posting.id === currentPostingId)) {
        return currentPostingId;
      }

      return sourceFilteredPostings[0]?.id ?? null;
    });
  }, [sourceFilteredPostings]);

  const selectedPosting = useMemo(
    () => postings.find((posting) => posting.id === selectedPostingId) ?? null,
    [postings, selectedPostingId]
  );
  const activeApplications = useMemo(
    () => applications.filter((application) => !application.archivedAt),
    [applications]
  );

  useEffect(() => {
    setSelectedApplicationId((currentApplicationId) => {
      if (currentApplicationId && applications.some((application) => application.id === currentApplicationId)) {
        return currentApplicationId;
      }

      return activeApplications[0]?.id ?? applications[0]?.id ?? null;
    });
  }, [activeApplications, applications]);

  const pageHeader = useMemo(
    () => {
      if (selectedTabIndex === 0) {
        return {
          title: "Postings",
          metricLabel: "Shown",
          metricValue: `${visiblePostings.length}/${sourceFilteredPostings.length}`
        };
      }

      if (selectedTabIndex === 1) {
        return {
          title: "Applications",
          metricLabel: "Tracked",
          metricValue: String(activeApplications.length)
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
    [activeApplications.length, postings.length, resumeRuns, selectedTabIndex, sourceFilteredPostings.length, visiblePostings.length]
  );

  useEffect(() => {
    document.documentElement.dataset.appTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  const handleResumeUpload = useCallback(async (file: File) => {
    setError(null);
    dismissNotice();
    setResumeUploadError(null);
    setIsResumeUploadPending(true);

    try {
      const parsedText = await extractResumeText(file);

      if (!parsedText) {
        throw new Error("No readable text was found in that file.");
      }

      const resumeRun = await createResumeRun(toCreateResumeRunRequest(createExtractedResumeRun(file, parsedText)));
      setResumeRuns((currentRuns) => [resumeRun, ...currentRuns].sort(compareResumeRunsByCreatedAtDesc));
      showNotice(`Extracted text from ${file.name}.`);
    } catch (uploadError) {
      setResumeUploadError(uploadError instanceof Error ? uploadError.message : "Could not extract resume text.");
    } finally {
      setIsResumeUploadPending(false);
    }
  }, [dismissNotice, showNotice]);

  const handleResumeRunDelete = useCallback(async (run: ResumeGraderRun) => {
    setError(null);
    const associatedApplications = applications.filter(
      (application) => !application.archivedAt && application.submittedResumeRunId === run.id
    );
    try {
      await deleteResumeRun(run.id);
      setResumeRuns((currentRuns) => currentRuns.filter((currentRun) => currentRun.id !== run.id));
      setApplications((currentApplications) =>
        currentApplications.map((currentApplication) =>
          currentApplication.submittedResumeRunId === run.id
            ? { ...currentApplication, submittedResumeRunId: null }
            : currentApplication
        )
      );
      showNotice(`${run.sourceName} deleted.`, async () => {
        const restoredRun = await restoreResumeRunSnapshot(run);
        setResumeRuns((currentRuns) => [restoredRun, ...currentRuns].sort(compareResumeRunsByCreatedAtDesc));
        const restoredApplications = await Promise.all(
          associatedApplications.map((application) =>
            updateApplicationDetails(application.id, {
              submittedResumeRunId: restoredRun.id
            })
          )
        );
        setApplications((currentApplications) =>
          currentApplications.map(
            (currentApplication) =>
              restoredApplications.find((restoredApplication) => restoredApplication.id === currentApplication.id) ??
              currentApplication
          )
        );
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete resume run.");
    }
  }, [applications, showNotice]);

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
        showNotice(`Unfollowed ${posting.company}.`, async () => {
          const followedCompany = await followCompany(posting.company);
          setPostings((currentPostings) =>
            currentPostings.map((currentPosting) =>
              currentPosting.normalizedCompanyName === followedCompany.normalizedCompanyName
                ? { ...currentPosting, isFollowed: true }
                : currentPosting
            )
          );
        });
      } else {
        const followedCompany = await followCompany(posting.company);
        setPostings((currentPostings) =>
          currentPostings.map((currentPosting) =>
            currentPosting.normalizedCompanyName === followedCompany.normalizedCompanyName
              ? { ...currentPosting, isFollowed: true }
              : currentPosting
          )
        );
        showNotice(`Following ${posting.company}.`, async () => {
          await unfollowCompany(followedCompany.normalizedCompanyName);
          setPostings((currentPostings) =>
            currentPostings.map((currentPosting) =>
              currentPosting.normalizedCompanyName === followedCompany.normalizedCompanyName
                ? { ...currentPosting, isFollowed: false }
                : currentPosting
            )
          );
        });
      }
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Company follow update failed.");
    }
  }, [showNotice]);

  const handleTrack = useCallback(async (posting: JobPostingDto) => {
    setError(null);
    try {
      if (posting.trackedApplicationId) {
        const applicationSnapshot =
          applications.find((application) => application.id === posting.trackedApplicationId) ?? null;
        await deleteApplication(posting.trackedApplicationId);
        if (applicationSnapshot) {
          removeApplicationFromState(applicationSnapshot);
        } else {
          setPostings((currentPostings) =>
            currentPostings.map((currentPosting) =>
              currentPosting.id === posting.id ? { ...currentPosting, isTracked: false, trackedApplicationId: null } : currentPosting
            )
          );
          setApplications((currentApplications) =>
            currentApplications.filter((application) => application.id !== posting.trackedApplicationId)
          );
        }
        await refreshApplicationActivity();
        showNotice(
          `${posting.company} application removed from tracking.`,
          applicationSnapshot ? () => restoreApplicationFromSnapshot(applicationSnapshot) : undefined
        );
      } else {
        setPendingTrackPosting(posting);
        setExternalTrackingUrl("");
      }
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not update application tracking.");
    }
  }, [applications, refreshApplicationActivity, removeApplicationFromState, restoreApplicationFromSnapshot, showNotice]);

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
      upsertApplication(application);
      showNotice(`${pendingTrackPosting.company} application added to tracking.`, async () => {
        await deleteApplication(application.id);
        removeApplicationFromState(application);
        await refreshApplicationActivity();
      });
      setPendingTrackPosting(null);
      setExternalTrackingUrl("");
      await refreshApplicationActivity();
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not add application to tracking.");
    } finally {
      setIsTrackModalSubmitting(false);
    }
  }, [externalTrackingUrl, pendingTrackPosting, refreshApplicationActivity, removeApplicationFromState, showNotice, upsertApplication]);

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
      upsertApplication(application);
      showNotice(`${application.company} application added.`, async () => {
        await deleteApplication(application.id);
        removeApplicationFromState(application);
        await refreshApplicationActivity();
      });
      setIsManualApplicationModalOpen(false);
      setManualApplicationForm(initialManualApplicationForm);
      await refreshApplicationActivity();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create application.");
    } finally {
      setIsManualApplicationSubmitting(false);
    }
  }, [manualApplicationForm, refreshApplicationActivity, removeApplicationFromState, showNotice, upsertApplication]);

  const handleApplicationStatusChange = useCallback(
    async (application: ApplicationDto, status: ApplicationStatus) => {
      if (application.status === status) {
        return;
      }

      setError(null);
      try {
        const updatedApplication = await updateApplicationStatus(application.id, status);
        if (isArchivedApplicationStatus(status)) {
          archiveApplicationInState(updatedApplication);
          showNotice(`${application.company} ${getApplicationStatusLabel(status).toLowerCase()} and archived.`, () =>
            restoreApplicationFromSnapshot(application)
          );
          await refreshApplicationActivity();
          return;
        }

        setApplications((currentApplications) =>
          currentApplications.map((currentApplication) =>
            currentApplication.id === updatedApplication.id ? updatedApplication : currentApplication
          )
        );
        showNotice(`${application.company} moved to ${getApplicationStatusLabel(status)}.`, async () => {
          const restoredApplication = await updateApplicationStatus(application.id, application.status);
          setApplications((currentApplications) =>
            currentApplications.map((currentApplication) =>
              currentApplication.id === restoredApplication.id ? restoredApplication : currentApplication
            )
          );
          await refreshApplicationActivity();
        });
        await refreshApplicationActivity();
      } catch (statusError) {
        setError(statusError instanceof Error ? statusError.message : "Could not update application status.");
      }
    },
    [archiveApplicationInState, refreshApplicationActivity, restoreApplicationFromSnapshot, showNotice]
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
        showNotice(`${application.company} details saved.`, async () => {
          const restoredApplication = await updateApplicationDetails(application.id, {
            notes: application.notes,
            interviewDates: application.interviewDates,
            interviewRound: application.interviewRound,
            links: application.links,
            submittedResumeRunId: application.submittedResumeRunId
          });
          setApplications((currentApplications) =>
            currentApplications.map((currentApplication) =>
              currentApplication.id === restoredApplication.id ? restoredApplication : currentApplication
            )
          );
          setSelectedApplicationId(restoredApplication.id);
        });
      } catch (detailsError) {
        setError(detailsError instanceof Error ? detailsError.message : "Could not save application details.");
        throw detailsError;
      } finally {
        setIsApplicationDetailsSaving(false);
      }
    },
    [showNotice]
  );

  const handleApplicationArchive = useCallback(
    async (application: ApplicationDto) => {
      setError(null);
      try {
        if (application.archivedAt) {
          const unarchivedApplication = await unarchiveApplication(application.id);
          upsertApplication(unarchivedApplication);
          showNotice(`${application.company} application unarchived.`, () => restoreApplicationFromSnapshot(application));
          return;
        }

        const archivedApplication = await archiveApplication(application.id);
        archiveApplicationInState(archivedApplication);
        showNotice(`${application.company} application archived.`, () => restoreApplicationFromSnapshot(application));
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : application.archivedAt
              ? "Could not unarchive application."
              : "Could not archive application."
        );
      }
    },
    [archiveApplicationInState, restoreApplicationFromSnapshot, showNotice, upsertApplication]
  );

  const handleApplicationDelete = useCallback(
    async (application: ApplicationDto) => {
      setError(null);
      try {
        await deleteApplication(application.id);
        removeApplicationFromState(application);
        await refreshApplicationActivity();
        showNotice(`${application.company} application deleted.`, () => restoreApplicationFromSnapshot(application));
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete application.");
      }
    },
    [refreshApplicationActivity, removeApplicationFromState, restoreApplicationFromSnapshot, showNotice]
  );

  const handleArchivedApplicationsPurge = useCallback(
    async (archivedApplications: ApplicationDto[]) => {
      if (archivedApplications.length === 0) {
        return;
      }

      setError(null);
      try {
        const result = await purgeArchivedApplications();
        removeApplicationsFromState(archivedApplications);
        await refreshApplicationActivity();
        const deletedCount = result.deletedCount || archivedApplications.length;
        showNotice(`${deletedCount} archived ${deletedCount === 1 ? "application" : "applications"} purged.`, async () => {
          for (const application of archivedApplications) {
            await restoreApplicationFromSnapshot(application);
          }
        });
      } catch (purgeError) {
        setError(purgeError instanceof Error ? purgeError.message : "Could not purge archived applications.");
      }
    },
    [refreshApplicationActivity, removeApplicationsFromState, restoreApplicationFromSnapshot, showNotice]
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
                            <Select
                              id="posting-source"
                              labelText="Source"
                              size="sm"
                              value={selectedSourceId}
                              onChange={(event) => {
                                setSelectedSourceId(event.target.value);
                                setCategoryFilters([]);
                              }}
                            >
                              <SelectItem text="All sources" value={allPostingSourcesValue} />
                              {sourceConfigs.map((sourceConfig) => (
                                <SelectItem
                                  key={sourceConfig.id}
                                  text={sourceConfig.displayName}
                                  value={sourceConfig.id}
                                />
                              ))}
                            </Select>
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
                                {visiblePostings.length} of {sourceFilteredPostings.length} postings shown
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
                          <VisualizationPanel posting={selectedPosting} themeMode={themeMode} />
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
                      onPurgeArchived={handleArchivedApplicationsPurge}
                      onSelect={handleSelectApplication}
                      onStatusChange={handleApplicationStatusChange}
                      resumeRuns={resumeRuns}
                      selectedApplicationId={selectedApplicationId}
                    />
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <ResumeGraderPanel
                      applications={applications}
                      isActive={selectedTabIndex === 2}
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
            notice.undo ? (
              <ActionableNotification
                actionButtonLabel={notice.isUndoing ? "Undoing" : "Undo"}
                hideCloseButton
                inline
                kind="success"
                lowContrast
                role="status"
                subtitle={notice.message}
                title="Updated"
                onActionButtonClick={() => void handleNoticeUndo(notice)}
              />
            ) : (
              <InlineNotification kind="success" lowContrast title="Updated" subtitle={notice.message} hideCloseButton />
            )
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
        selectorPrimaryFocus={modalPrimaryFocusSelector}
        size="sm"
        onRequestClose={handleCloseTrackModal}
        onRequestSubmit={() => void handleConfirmTrack()}
      >
        <div className="track-modal-body" data-app-modal-primary-focus tabIndex={-1}>
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
        selectorPrimaryFocus={modalPrimaryFocusSelector}
        size="sm"
        onRequestClose={handleCloseManualApplicationModal}
        onRequestSubmit={() => void handleCreateManualApplication()}
      >
        <div className="track-modal-body" data-app-modal-primary-focus tabIndex={-1}>
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
            {activeApplicationStatuses
              .filter((option) => option.status !== "HIRED")
              .map((option) => (
                <SelectItem key={option.status} text={option.label} value={option.status} />
              ))}
          </Select>
        </div>
      </Modal>
    </Theme>
  );
}

function toRestoreApplicationSnapshot(application: ApplicationDto): RestoreApplicationSnapshotRequest {
  return {
    id: application.id,
    jobPostingId: application.jobPostingId,
    company: application.company,
    role: application.role,
    jobPostingUrl: application.jobPostingUrl,
    externalApplicationTrackingUrl: application.externalApplicationTrackingUrl,
    notes: application.notes,
    interviewDates: application.interviewDates,
    interviewRound: application.interviewRound,
    links: application.links,
    submittedResumeRunId: application.submittedResumeRunId,
    status: application.status,
    archivedAt: application.archivedAt,
    createdAt: application.createdAt,
    events: application.events
  };
}

export default App;
