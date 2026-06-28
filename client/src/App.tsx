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
  FileUploaderButton,
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
import { Add, Help, Launch, Moon, Star, StarFilled, Sun } from "@carbon/icons-react";
import { AlluvialChart, DonutChart, LineChart, RadarChart, ScaleTypes } from "@carbon/charts-react";
import type { AlluvialChartOptions, ChartTabularData, DonutChartOptions, LineChartOptions, RadarChartOptions } from "@carbon/charts-react";
import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  JobPostingDto,
  OfficeImageSearchDto
} from "../../shared/src/index";
import {
  archiveApplication,
  createApplication,
  createManualApplication,
  deleteApplication,
  followCompany,
  getApplicationActivity,
  getOfficeImages,
  getPostings,
  listApplications,
  updateApplicationStatus,
  unfollowCompany
} from "./api";
import "@carbon/charts-react/styles.css";
import "./styles.scss";

type ThemeMode = "light" | "dark";

const themeStorageKey = "swe.locker.theme";
const resumeRunsStorageKey = "swe.locker.resumeRuns";
const darkPreferenceQuery = "(prefers-color-scheme: dark)";
const resumeAcceptedFileTypes = [".pdf", ".txt", ".md", "application/pdf", "text/plain", "text/markdown"];
const resumeMaxFileSizeBytes = 10 * 1024 * 1024;
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

type ConfettiBurstState = {
  id: number;
  status: Extract<ApplicationStatus, "OFFER" | "HIRED">;
};

type ConfettiPieceStyle = CSSProperties & {
  "--confetti-color": string;
  "--confetti-delay": string;
  "--confetti-rotate": string;
  "--confetti-x": string;
  "--confetti-y": string;
};

type ManualApplicationFormState = {
  company: string;
  role: string;
  jobPostingUrl: string;
  externalApplicationTrackingUrl: string;
  status: ApplicationStatus;
};

type ResumeTier = "S" | "A" | "B" | "C";

type ResumeGraderMetric = {
  label: string;
  value: number;
};

type ResumeGraderRun = {
  id: string;
  createdAt: string;
  sourceName: string;
  parsedText: string;
  grade: number | null;
  tier: ResumeTier | null;
  verdict: string | null;
  metrics: ResumeGraderMetric[];
};

const initialManualApplicationForm: ManualApplicationFormState = {
  company: "",
  role: "",
  jobPostingUrl: "",
  externalApplicationTrackingUrl: "",
  status: "APPLIED"
};

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

const statsOutcomeColors = {
  applied: "#8d8d8d",
  interview: "#1192e8",
  offer: "#0f62fe",
  rejected: "#d02670"
};

const alluvialOutcomeColors = {
  "In progress": statsOutcomeColors.applied,
  Offer: statsOutcomeColors.offer,
  Rejected: statsOutcomeColors.rejected
};
const confettiPieces: ConfettiPieceStyle[] = [
  { "--confetti-color": "#0f62fe", "--confetti-delay": "0ms", "--confetti-rotate": "-28deg", "--confetti-x": "-44vw", "--confetti-y": "-24vh" },
  { "--confetti-color": "#24a148", "--confetti-delay": "20ms", "--confetti-rotate": "32deg", "--confetti-x": "-35vw", "--confetti-y": "-32vh" },
  { "--confetti-color": "#da1e28", "--confetti-delay": "40ms", "--confetti-rotate": "72deg", "--confetti-x": "-25vw", "--confetti-y": "-20vh" },
  { "--confetti-color": "#8a3ffc", "--confetti-delay": "60ms", "--confetti-rotate": "-64deg", "--confetti-x": "-14vw", "--confetti-y": "-34vh" },
  { "--confetti-color": "#1192e8", "--confetti-delay": "80ms", "--confetti-rotate": "48deg", "--confetti-x": "-5vw", "--confetti-y": "-22vh" },
  { "--confetti-color": "#f1c21b", "--confetti-delay": "100ms", "--confetti-rotate": "-18deg", "--confetti-x": "6vw", "--confetti-y": "-36vh" },
  { "--confetti-color": "#0f62fe", "--confetti-delay": "120ms", "--confetti-rotate": "82deg", "--confetti-x": "15vw", "--confetti-y": "-20vh" },
  { "--confetti-color": "#24a148", "--confetti-delay": "140ms", "--confetti-rotate": "-52deg", "--confetti-x": "25vw", "--confetti-y": "-31vh" },
  { "--confetti-color": "#da1e28", "--confetti-delay": "160ms", "--confetti-rotate": "24deg", "--confetti-x": "36vw", "--confetti-y": "-23vh" },
  { "--confetti-color": "#8a3ffc", "--confetti-delay": "180ms", "--confetti-rotate": "-88deg", "--confetti-x": "44vw", "--confetti-y": "-35vh" },
  { "--confetti-color": "#1192e8", "--confetti-delay": "60ms", "--confetti-rotate": "18deg", "--confetti-x": "-38vw", "--confetti-y": "2vh" },
  { "--confetti-color": "#f1c21b", "--confetti-delay": "90ms", "--confetti-rotate": "-38deg", "--confetti-x": "-28vw", "--confetti-y": "8vh" },
  { "--confetti-color": "#0f62fe", "--confetti-delay": "120ms", "--confetti-rotate": "58deg", "--confetti-x": "-16vw", "--confetti-y": "4vh" },
  { "--confetti-color": "#24a148", "--confetti-delay": "150ms", "--confetti-rotate": "-72deg", "--confetti-x": "-4vw", "--confetti-y": "10vh" },
  { "--confetti-color": "#da1e28", "--confetti-delay": "180ms", "--confetti-rotate": "36deg", "--confetti-x": "8vw", "--confetti-y": "5vh" },
  { "--confetti-color": "#8a3ffc", "--confetti-delay": "210ms", "--confetti-rotate": "-24deg", "--confetti-x": "19vw", "--confetti-y": "12vh" },
  { "--confetti-color": "#1192e8", "--confetti-delay": "240ms", "--confetti-rotate": "66deg", "--confetti-x": "31vw", "--confetti-y": "6vh" },
  { "--confetti-color": "#f1c21b", "--confetti-delay": "270ms", "--confetti-rotate": "-46deg", "--confetti-x": "41vw", "--confetti-y": "14vh" }
];
const postingListDesktopQuery = "(min-width: 66rem)";
const postingRowEstimate = 116;
const postingRowGap = 8;
const postingRowOverscan = 6;
const resumeMockRunIdPrefix = "mock_resume_run_";
const staleResumeSeedRunIds = new Set(["resume_run_1", "resume_run_2"]);
const resumeMetricLabels = ["Structure", "Impact", "Evidence", "Specificity", "Relevance"];
const resumeGraderRunsSeed: ResumeGraderRun[] = createMockResumeRuns(50);

type PdfTextContentItem = {
  hasEOL: boolean;
  str: string;
};

type AlluvialLinkElement = SVGPathElement & {
  __data__?: {
    group?: string;
  };
};

function createMockResumeRuns(count: number) {
  const latestRunTimestamp = Date.parse("2026-06-27T16:20:00.000Z");
  const dayMs = 24 * 60 * 60 * 1000;

  return Array.from({ length: count }, (_, index): ResumeGraderRun => {
    const createdAt = new Date(latestRunTimestamp - index * dayMs * 2 - (index % 4) * 60 * 60 * 1000).toISOString();
    const fileVersion = count - index;
    const fileDate = createdAt.slice(0, 10).replace(/-/g, "");
    const progress = count <= 1 ? 1 : (count - 1 - index) / (count - 1);
    const grade = clampResumeScore(58 + progress * 36 + Math.sin(index * 1.7) * 3 + ((index % 5) - 2));
    const tier = getMockResumeTier(index);

    return {
      id: `${resumeMockRunIdPrefix}${String(fileVersion).padStart(2, "0")}`,
      createdAt,
      sourceName: `alex-rivera-resume-${fileDate}-v${String(fileVersion).padStart(2, "0")}.pdf`,
      parsedText: `Alex Rivera
Software Engineering Intern

Mock parsed text for ${fileDate} resume revision ${fileVersion}.

Experience
- Built and iterated on full-stack TypeScript projects.
- Improved dashboard workflows with React, Express, Prisma, and SQLite.
- Refined resume bullets across structure, impact, evidence, specificity, and relevance.`,
      grade,
      tier,
      verdict: getMockResumeVerdict(grade),
      metrics: resumeMetricLabels.map((label, metricIndex) => ({
        label,
        value: clampResumeScore(grade + ((index * 5 + metricIndex * 7) % 17) - 8)
      }))
    };
  });
}

function clampResumeScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getMockResumeTier(index: number): ResumeTier {
  const signal = (index * 13) % 100;

  if (signal >= 92) {
    return "S";
  }

  if (signal >= 70) {
    return "A";
  }

  if (signal >= 36) {
    return "B";
  }

  return "C";
}

function getMockResumeVerdict(grade: number) {
  if (grade >= 90) {
    return "Strong revision with clear scope, evidence, and outcome-driven bullets.";
  }

  if (grade >= 80) {
    return "Solid revision. A few bullets still need sharper metrics and ownership signals.";
  }

  if (grade >= 70) {
    return "Usable revision, but impact and specificity are uneven across the resume.";
  }

  return "Early revision. Improve structure, quantify work, and remove vague responsibility bullets.";
}

function getInitialResumeRuns() {
  if (typeof window === "undefined") {
    return resumeGraderRunsSeed;
  }

  const storedRuns = window.localStorage.getItem(resumeRunsStorageKey);
  if (!storedRuns) {
    return resumeGraderRunsSeed;
  }

  try {
    const parsedRuns = JSON.parse(storedRuns) as ResumeGraderRun[];
    if (!Array.isArray(parsedRuns)) {
      return resumeGraderRunsSeed;
    }

    return mergeResumeRunsWithSeed(parsedRuns.filter(isResumeGraderRun));
  } catch {
    return resumeGraderRunsSeed;
  }
}

function mergeResumeRunsWithSeed(runs: ResumeGraderRun[]) {
  const userRuns = runs.filter((run) => !isSeedResumeRun(run));
  return [...userRuns, ...resumeGraderRunsSeed].sort(compareResumeRunsByCreatedAtDesc);
}

function isSeedResumeRun(run: ResumeGraderRun) {
  return run.id.startsWith(resumeMockRunIdPrefix) || staleResumeSeedRunIds.has(run.id);
}

function compareResumeRunsByCreatedAtDesc(firstRun: ResumeGraderRun, secondRun: ResumeGraderRun) {
  return getResumeRunTime(secondRun) - getResumeRunTime(firstRun);
}

function compareResumeRunsByCreatedAtAsc(firstRun: ResumeGraderRun, secondRun: ResumeGraderRun) {
  return getResumeRunTime(firstRun) - getResumeRunTime(secondRun);
}

function getResumeRunTime(run: ResumeGraderRun) {
  const time = Date.parse(run.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function getResumeRunIdFromChartTarget(target: EventTarget | null, container: HTMLElement) {
  let element = target instanceof Element ? target : null;

  while (element && element !== container) {
    const runId = getResumeRunIdFromChartDatum((element as Element & { __data__?: unknown }).__data__);
    if (runId) {
      return runId;
    }

    element = element.parentElement;
  }

  return null;
}

function getResumeRunIdFromChartDatum(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const datum = value as { runId?: unknown; datum?: unknown; data?: unknown };
  if (typeof datum.runId === "string") {
    return datum.runId;
  }

  return getResumeRunIdFromChartDatum(datum.datum) ?? getResumeRunIdFromChartDatum(datum.data);
}

function isResumeGraderRun(value: unknown): value is ResumeGraderRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ResumeGraderRun;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.sourceName === "string" &&
    typeof candidate.parsedText === "string" &&
    Array.isArray(candidate.metrics)
  );
}

async function extractResumeText(file: File) {
  if (file.size > resumeMaxFileSizeBytes) {
    throw new Error("Upload a resume smaller than 10 MB.");
  }

  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractPdfResumeText(file);
  }

  if (
    file.type.startsWith("text/") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".markdown")
  ) {
    return normalizeExtractedResumeText(await file.text());
  }

  throw new Error("Upload a PDF, TXT, or Markdown resume.");
}

async function extractPdfResumeText(file: File) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer())
  });
  const document = await documentTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if (!isPdfTextContentItem(item)) {
            return "";
          }

          return item.hasEOL ? `${item.str}\n` : `${item.str} `;
        })
        .join("");

      pageTexts.push(pageText);
    }
  } finally {
    await document.cleanup();
    await documentTask.destroy();
  }

  return normalizeExtractedResumeText(pageTexts.join("\n\n"));
}

function isPdfTextContentItem(value: unknown): value is PdfTextContentItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "str" in value &&
      typeof value.str === "string" &&
      "hasEOL" in value &&
      typeof value.hasEOL === "boolean"
  );
}

function normalizeExtractedResumeText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createExtractedResumeRun(file: File, parsedText: string): ResumeGraderRun {
  return {
    id: `resume_run_${Date.now()}`,
    createdAt: new Date().toISOString(),
    sourceName: file.name,
    parsedText,
    grade: null,
    tier: null,
    verdict: "Raw text extracted. Grading is not implemented yet.",
    metrics: []
  };
}

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
              tooltipAlignment="center"
              tooltipPosition="right"
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

function VirtualizedPostingList({
  isLoading,
  onFollow,
  onSelect,
  onTrack,
  postings,
  selectedPostingId
}: {
  isLoading: boolean;
  onFollow: (posting: JobPostingDto) => Promise<void>;
  onSelect: (posting: JobPostingDto) => void;
  onTrack: (posting: JobPostingDto) => Promise<void>;
  postings: JobPostingDto[];
  selectedPostingId: string | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const measuredRowsRef = useRef(new Map<string, number>());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredVersion, setMeasuredVersion] = useState(0);
  const [shouldVirtualize, setShouldVirtualize] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(postingListDesktopQuery).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(postingListDesktopQuery);
    const updateVirtualizationMode = () => setShouldVirtualize(mediaQuery.matches);

    updateVirtualizationMode();
    mediaQuery.addEventListener("change", updateVirtualizationMode);

    return () => mediaQuery.removeEventListener("change", updateVirtualizationMode);
  }, []);

  useEffect(() => {
    if (!shouldVirtualize || !listRef.current) {
      return undefined;
    }

    const element = listRef.current;
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight);
      setScrollTop(element.scrollTop);
    });
    resizeObserver.observe(element);
    setViewportHeight(element.clientHeight);
    setScrollTop(element.scrollTop);

    return () => resizeObserver.disconnect();
  }, [shouldVirtualize]);

  const measuredRows = measuredVersion ? measuredRowsRef.current : measuredRowsRef.current;
  const virtualRows = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        rows: postings.map((posting, index) => ({
          index,
          posting,
          start: 0
        })),
        totalSize: 0
      };
    }

    const visibleStart = Math.max(0, scrollTop - postingRowEstimate * postingRowOverscan);
    const visibleEnd = scrollTop + Math.max(viewportHeight, postingRowEstimate * 4) + postingRowEstimate * postingRowOverscan;
    const rows: Array<{ index: number; posting: JobPostingDto; start: number }> = [];
    let offset = 0;

    for (const [index, posting] of postings.entries()) {
      const measuredHeight = measuredRows.get(posting.id);
      const rowSize = (measuredHeight ?? postingRowEstimate) + postingRowGap;
      const rowEnd = offset + rowSize;

      if (rowEnd >= visibleStart && offset <= visibleEnd) {
        rows.push({
          index,
          posting,
          start: offset
        });
      }

      offset = rowEnd;
    }

    return {
      rows,
      totalSize: Math.max(0, offset - postingRowGap)
    };
  }, [measuredRows, postings, scrollTop, shouldVirtualize, viewportHeight]);

  const setMeasuredRow = useCallback((postingId: string, element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }

    const measuredHeight = Math.ceil(element.getBoundingClientRect().height);
    if (measuredHeight <= 0 || measuredRowsRef.current.get(postingId) === measuredHeight) {
      return;
    }

    measuredRowsRef.current.set(postingId, measuredHeight);
    setMeasuredVersion((currentVersion) => currentVersion + 1);
  }, []);

  return (
    <div
      className={`posting-list${shouldVirtualize ? " posting-list--virtualized" : ""}`}
      aria-label="Internship postings"
      ref={listRef}
      onScroll={shouldVirtualize ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
    >
      {!isLoading && postings.length === 0 ? (
        <div className="posting-empty">
          <p>No postings match the current filters.</p>
          <span>Adjust filters.</span>
        </div>
      ) : null}

      {shouldVirtualize ? (
        <div className="posting-list__space" style={{ blockSize: `${virtualRows.totalSize}px` }}>
          {virtualRows.rows.map(({ posting, start }) => (
            <div
              className="posting-list__row"
              key={posting.id}
              ref={(element) => setMeasuredRow(posting.id, element)}
              style={{ transform: `translateY(${start}px)` }}
            >
              <PostingCard
                isSelected={posting.id === selectedPostingId}
                posting={posting}
                onFollow={onFollow}
                onSelect={onSelect}
                onTrack={onTrack}
              />
            </div>
          ))}
        </div>
      ) : (
        postings.map((posting) => (
          <PostingCard
            key={posting.id}
            isSelected={posting.id === selectedPostingId}
            posting={posting}
            onFollow={onFollow}
            onSelect={onSelect}
            onTrack={onTrack}
          />
        ))
      )}
    </div>
  );
}

function isRemoteLocation(location: string) {
  return /\b(remote|virtual|anywhere|worldwide)\b/i.test(location);
}

function getOfficeImageLocation(posting: JobPostingDto) {
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

function shouldShowStatusConfetti(status: ApplicationStatus): status is ConfettiBurstState["status"] {
  return status === "OFFER" || status === "HIRED";
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
    return "Resume pending";
  }

  if (application.status === "REJECTED") {
    return hasReachedInterview(application) ? "Interview" : "Resume rejected";
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

const OfficeImagePanel = memo(function OfficeImagePanel({ company, location }: { company: string; location?: string }) {
  const [imageSearch, setImageSearch] = useState<OfficeImageSearchDto | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    setImageSearch(null);
    setImageError(null);
    setIsImageLoading(true);

    void getOfficeImages(company, location)
      .then((result) => {
        if (!abortController.signal.aborted) {
          setImageSearch(result);
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setImageError(error instanceof Error ? error.message : "Office image unavailable.");
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsImageLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [company, location]);

  const officeImage = imageSearch?.images[0] ?? null;
  const imageSource = officeImage?.thumbnailUrl ?? officeImage?.imageUrl ?? null;
  const searchUrl = imageSearch?.searchUrl ?? getOfficeImageSearchUrl(company, location);

  return (
    <div className="office-image-panel">
      <div className="office-image-frame">
        {imageSource ? (
          <img src={imageSource} alt={officeImage?.title ?? `${company} office`} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="office-image-placeholder">
            {isImageLoading ? (
              <Loading small withOverlay={false} description="Searching office images" />
            ) : (
              <span>{imageError ?? "No office image found"}</span>
            )}
          </div>
        )}
      </div>
      <div className="office-image-actions">
        <span>{imageSearch?.query ?? [company, "offices", location].filter(Boolean).join(" ")}</span>
        <div>
          {officeImage?.sourceUrl ? (
            <Button kind="ghost" size="sm" renderIcon={Launch} href={officeImage.sourceUrl} target="_blank">
              Source
            </Button>
          ) : null}
          <Button kind="ghost" size="sm" renderIcon={Launch} href={searchUrl} target="_blank">
            Images
          </Button>
        </div>
      </div>
    </div>
  );
});

function getOfficeImageSearchUrl(company: string, location?: string) {
  const searchUrl = new URL("https://duckduckgo.com/");
  searchUrl.searchParams.set("q", [company, "offices", location].filter(Boolean).join(" "));
  searchUrl.searchParams.set("iax", "images");
  searchUrl.searchParams.set("ia", "images");
  return searchUrl.toString();
}

const VisualizationPanel = memo(function VisualizationPanel({ posting }: { posting: JobPostingDto | null }) {
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

  const officeImageLocation = getOfficeImageLocation(posting);
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

      <OfficeImagePanel company={posting.company} location={officeImageLocation} />

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

const StatsOverviewTile = memo(function StatsOverviewTile({
  applications,
  postings,
  themeMode
}: {
  applications: ApplicationDto[];
  postings: JobPostingDto[];
  themeMode: ThemeMode;
}) {
  const applicationCountsByStatus = useMemo(() => getApplicationStatusCounts(applications), [applications]);
  const postingStats = useMemo(
    () => [
      { label: "Total postings", value: postings.length },
      { label: "New today", value: postings.filter((posting) => posting.isNewToday).length }
    ],
    [postings]
  );
  const applicationOutcomeData = useMemo<ChartTabularData>(
    () =>
      applicationStatuses
        .map((option) => ({
          group: option.label,
          value: applicationCountsByStatus.get(option.status) ?? 0
        }))
        .filter((item) => item.value > 0),
    [applicationCountsByStatus]
  );
  const applicationOutcomeOptions = useMemo<DonutChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Application outcomes by status"
      },
      color: {
        scale: {
          Applied: statsOutcomeColors.applied,
          Interview: statsOutcomeColors.interview,
          Offer: statsOutcomeColors.offer,
          Hired: statsOutcomeColors.offer,
          Rejected: statsOutcomeColors.rejected
        }
      },
      data: {
        groupMapsTo: "group"
      },
      donut: {
        alignment: "center",
        center: {
          label: "Tracked",
          number: applications.length,
          numberFontSize: () => "1.5rem",
          titleFontSize: () => "0.75rem"
        }
      },
      height: "100%",
      legend: {
        alignment: "center",
        enabled: true,
        position: "bottom"
      },
      pie: {
        alignment: "center",
        labels: {
          enabled: false
        },
        valueMapsTo: "value"
      },
      theme: themeMode === "dark" ? "g100" : "white",
      toolbar: {
        enabled: false
      },
      tooltip: {
        valueFormatter: (value) => formatApplicationTooltipValue(value)
      }
    }),
    [applications.length, themeMode]
  );

  return (
    <Tile className="stats-overview-tile">
      <div className="section-header">
        <div>
          <h2>Overview</h2>
          <p>Posting volume and active application outcomes</p>
        </div>
      </div>
      <div className="stats-overview-grid">
        <div className="stats-strip stats-strip--postings" aria-label="Posting stats">
          {postingStats.map((stat) => (
            <div className="stats-strip__item" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        <div className="application-outcome-chart" aria-label="Application outcomes">
          {applicationOutcomeData.length > 0 ? (
            <DonutChart data={applicationOutcomeData} options={applicationOutcomeOptions} />
          ) : (
            <div className="posting-empty">
              <p>No application outcomes yet.</p>
              <span>Tracked applications will appear here.</span>
            </div>
          )}
        </div>
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
        <StatsOverviewTile applications={applications} postings={postings} themeMode={themeMode} />
      </div>
      <ApplicationActivityHeatmapTile days={activityDays} />
    </div>
  );
});

const ResumeGraderPanel = memo(function ResumeGraderPanel({
  isUploadPending,
  onUpload,
  runs,
  themeMode,
  uploadError
}: {
  isUploadPending: boolean;
  onUpload: (file: File) => void;
  runs: ResumeGraderRun[];
  themeMode: ThemeMode;
  uploadError: string | null;
}) {
  const latestRun = runs[0] ?? null;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => latestRun?.id ?? null);
  const resumeHistoryChartRef = useRef<HTMLDivElement | null>(null);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? latestRun,
    [latestRun, runs, selectedRunId]
  );
  const selectedGrade = selectedRun?.grade ?? null;
  const selectedTier = selectedRun?.tier ?? null;
  const hasSelectedGrade = selectedGrade !== null && selectedTier !== null;

  useEffect(() => {
    setSelectedRunId((currentRunId) => {
      if (currentRunId && runs.some((run) => run.id === currentRunId)) {
        return currentRunId;
      }

      return runs[0]?.id ?? null;
    });
  }, [runs]);

  const runHistoryData = useMemo<ChartTabularData>(
    () =>
      [...runs].sort(compareResumeRunsByCreatedAtAsc).map((run, runIndex) => ({
        group: "Grade",
        run: `${runIndex + 1}. ${formatDate(run.createdAt)}`,
        runId: run.id,
        value: run.grade ?? 0
      })),
    [runs]
  );
  const selectedRunRadarData = useMemo<ChartTabularData>(
    () =>
      selectedRun?.metrics.map((metric) => ({
        group: "Selected",
        metric: metric.label,
        value: metric.value
      })) ?? [],
    [selectedRun]
  );
  const radarOptions = useMemo<RadarChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Resume grader metric profile"
      },
      data: {
        groupMapsTo: "group"
      },
      height: "18rem",
      legend: {
        enabled: false
      },
      radar: {
        axes: {
          angle: "metric",
          value: "value"
        },
        maxValue: 100
      },
      theme: themeMode === "dark" ? "g100" : "white",
      toolbar: {
        enabled: false
      }
    }),
    [themeMode]
  );
  const runHistoryOptions = useMemo<LineChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Resume grade history"
      },
      axes: {
        bottom: {
          mapsTo: "run",
          scaleType: ScaleTypes.LABELS,
          visible: false
        },
        left: {
          domain: [0, 100],
          mapsTo: "value",
          ticks: {
            number: 5
          }
        }
      },
      points: {
        radius: 4
      },
      color: {
        scale: {
          Grade: "#0f62fe"
        }
      },
      data: {
        groupMapsTo: "group"
      },
      height: "100%",
      legend: {
        enabled: false
      },
      theme: themeMode === "dark" ? "g100" : "white",
      toolbar: {
        enabled: false
      },
      tooltip: {
        valueFormatter: (value) => `${value}/100`
      }
    }),
    [themeMode]
  );

  useEffect(() => {
    const chartElement = resumeHistoryChartRef.current;
    if (!chartElement) {
      return undefined;
    }

    const runIds = new Set(runs.map((run) => run.id));
    const handleChartClick = (event: MouseEvent) => {
      const runId = getResumeRunIdFromChartTarget(event.target, chartElement);
      if (runId && runIds.has(runId)) {
        setSelectedRunId(runId);
      }
    };

    chartElement.addEventListener("click", handleChartClick);

    return () => chartElement.removeEventListener("click", handleChartClick);
  }, [runs]);

  useEffect(() => {
    const chartElement = resumeHistoryChartRef.current;
    if (!chartElement) {
      return;
    }

    const chartPoints = chartElement.querySelectorAll("circle");
    chartPoints.forEach((point) => {
      const runId = getResumeRunIdFromChartDatum((point as SVGCircleElement & { __data__?: unknown }).__data__);
      point.classList.toggle("resume-history-point--selected", Boolean(runId && runId === selectedRun?.id));
    });
  }, [runHistoryData, selectedRun?.id]);

  return (
    <div className="resume-grader-stack">
      <div className="resume-upload-actions">
        {isUploadPending ? <Loading description="Extracting resume text" small withOverlay={false} /> : null}
        <FileUploaderButton
          accept={resumeAcceptedFileTypes}
          buttonKind="secondary"
          disabled={isUploadPending}
          disableLabelChanges
          id="resume-upload"
          labelText={isUploadPending ? "Extracting..." : "Upload resume"}
          multiple={false}
          name="resume-upload"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              onUpload(file);
            }
          }}
          size="sm"
        />
      </div>

      {uploadError ? <InlineNotification kind="error" lowContrast title="Resume upload failed" subtitle={uploadError} hideCloseButton /> : null}

      <Tile className="resume-grader-latest-tile">
        {latestRun ? (
          <div className="resume-grader-latest">
            <div className="resume-grader-summary">
              <div className="section-header">
                <div>
                  <h2>{selectedRun?.sourceName ?? "Resume run"}</h2>
                </div>
                {selectedRun ? <span className="resume-run-date">{formatDate(selectedRun.createdAt)}</span> : null}
              </div>

              <div className="resume-verdict-panel">
                <h3>Verdict</h3>
                <p>{selectedRun?.verdict ?? "Raw text extracted. Grading is not implemented yet."}</p>
              </div>

              <div className="resume-history-chart-panel">
                <h3>Run history</h3>
                {runHistoryData.length > 0 ? (
                  <div className="resume-history-line-chart" ref={resumeHistoryChartRef}>
                    <LineChart data={runHistoryData} options={runHistoryOptions} />
                  </div>
                ) : (
                  <div className="posting-empty">
                    <p>No resume runs yet.</p>
                    <span>Run a resume analysis.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="resume-radar-panel">
              {hasSelectedGrade ? (
                <div className="resume-score-panel">
                  <div className="resume-tier-cell" aria-label={`Tier ${selectedTier}`}>
                    <span className="resume-score-cell-label">
                      Rank
                      <span
                        className="resume-score-help"
                        tabIndex={0}
                        aria-label="Measures raw signal based on experience, achievements and prestige, for example worked at Google"
                      >
                        <Help size={14} />
                        <span className="resume-score-tooltip" role="tooltip">
                          Measures raw signal based on experience, achievements and prestige (e.g. worked at Google)
                        </span>
                      </span>
                    </span>
                    <strong>{selectedTier}</strong>
                  </div>
                  <div className="resume-grade-cell" aria-label={`Numeric grade ${selectedGrade} out of 100`}>
                    <span className="resume-score-cell-label">
                      Grade
                      <span
                        className="resume-score-help"
                        tabIndex={0}
                        aria-label="Measures how good the resume is built against resume best practices, for example use of STAR format"
                      >
                        <Help size={14} />
                        <span className="resume-score-tooltip" role="tooltip">
                          Measures how good the resume is built against resume best practices (e.g. use of STAR format)
                        </span>
                      </span>
                    </span>
                    <strong>{selectedGrade}</strong>
                    <span className="resume-grade-denominator">/100</span>
                  </div>
                </div>
              ) : (
                <div className="resume-score-placeholder">
                  <strong>Raw text</strong>
                  <span>Grading is not implemented yet.</span>
                </div>
              )}
              {selectedRunRadarData.length > 0 ? (
                <div className="resume-radar-chart">
                  <RadarChart data={selectedRunRadarData} options={radarOptions} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="posting-empty">
            <p>No resume runs yet.</p>
            <span>Run a resume analysis.</span>
          </div>
        )}
      </Tile>

      <Tile className="resume-runs-tile">
        <div className="section-header">
          <div>
            <h2>Past runs</h2>
            <p>{runs.length} resume analyses</p>
          </div>
        </div>

        {runs.length > 0 ? (
          <div className="resume-runs-list">
            {runs.map((run) => (
              <button
                className={`resume-run-row${run.id === selectedRun?.id ? " resume-run-row--selected" : ""}`}
                key={run.id}
                type="button"
                aria-pressed={run.id === selectedRun?.id}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div>
                  <h3>{run.sourceName}</h3>
                </div>
                <span className="resume-run-row-date">{formatDate(run.createdAt)}</span>
                <div className="resume-run-score" aria-label={`Grade ${run.grade ?? "not graded"}, tier ${run.tier ?? "not graded"}`}>
                  <strong className="resume-run-grade">{run.grade ?? "--"}</strong>
                  <strong className="resume-run-tier">{run.tier ?? "--"}</strong>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="posting-empty">
            <p>No resume runs yet.</p>
            <span>Run a resume analysis.</span>
          </div>
        )}
      </Tile>
    </div>
  );
});

const StatusConfetti = memo(function StatusConfetti({ burst }: { burst: ConfettiBurstState | null }) {
  if (!burst) {
    return null;
  }

  return (
    <div className={`confetti-burst confetti-burst--${burst.status.toLowerCase()}`} key={burst.id} aria-hidden="true">
      {confettiPieces.map((piece, index) => (
        <span className="confetti-piece" key={`${burst.id}-${index}`} style={piece} />
      ))}
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
  const applicationTitleUrl = application.externalApplicationTrackingUrl ?? application.jobPostingUrl;

  return (
    <article className="application-card">
      <div className="application-card__header">
        <div>
          <h3>{application.company}</h3>
          <p>
            {applicationTitleUrl ? (
              <a
                className="application-card__title-link"
                href={applicationTitleUrl}
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
  onCreate,
  onDelete,
  onStatusChange
}: {
  applications?: ApplicationDto[];
  isLoading: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onCreate: () => void;
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
          <Button kind="primary" renderIcon={Add} size="sm" onClick={onCreate}>
            Add application
          </Button>
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
  const [postings, setPostings] = useState<JobPostingDto[]>([]);
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [activityDays, setActivityDays] = useState<ApplicationActivityDayDto[]>([]);
  const [resumeRuns, setResumeRuns] = useState<ResumeGraderRun[]>(getInitialResumeRuns);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [hasOpenedStats, setHasOpenedStats] = useState(false);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
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
  const [isResumeUploadPending, setIsResumeUploadPending] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confettiBurst, setConfettiBurst] = useState<ConfettiBurstState | null>(null);
  const carbonTheme = themeMode === "dark" ? "g100" : "white";
  const deferredSearch = useDeferredValue(search);
  const deferredLocation = useDeferredValue(location);

  const loadDashboardSnapshot = useCallback(async () => {
    setError(null);
    const [postingList, applicationList, activityList] = await Promise.all([
      getPostings(),
      listApplications(),
      getApplicationActivity()
    ]);
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

  useEffect(() => {
    window.localStorage.setItem(resumeRunsStorageKey, JSON.stringify(resumeRuns));
  }, [resumeRuns]);

  useEffect(() => {
    if (!confettiBurst) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setConfettiBurst(null), 1800);

    return () => window.clearTimeout(timeoutId);
  }, [confettiBurst]);

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

      const resumeRun = createExtractedResumeRun(file, parsedText);
      setResumeRuns((currentRuns) => [resumeRun, ...currentRuns]);
      setNotice(`Extracted text from ${file.name}.`);
    } catch (uploadError) {
      setResumeUploadError(uploadError instanceof Error ? uploadError.message : "Could not extract resume text.");
    } finally {
      setIsResumeUploadPending(false);
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
        if (shouldShowStatusConfetti(status)) {
          setConfettiBurst({ id: Date.now(), status });
        }
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
      <StatusConfetti burst={confettiBurst} />
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

                          <VisualizationPanel posting={selectedPosting} />
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
                      onCreate={handleOpenManualApplicationModal}
                      onDelete={handleApplicationDelete}
                      onStatusChange={handleApplicationStatusChange}
                    />
                  </TabPanel>
                  <TabPanel className="app-tab-panel">
                    <ResumeGraderPanel
                      isUploadPending={isResumeUploadPending}
                      onUpload={handleResumeUpload}
                      runs={resumeRuns}
                      themeMode={themeMode}
                      uploadError={resumeUploadError}
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
                      isChartActive={hasOpenedStats || selectedTabIndex === 3}
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
