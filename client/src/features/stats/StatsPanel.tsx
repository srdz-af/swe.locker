import {
  memo,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Button, Checkbox, Tile } from "@carbon/react";
import { Download } from "@carbon/icons-react";
import { AlluvialChart as CarbonAlluvialChart, alluvial as carbonAlluvialConfig } from "@carbon/charts";
import type { AlluvialChartOptions, ChartTabularData } from "@carbon/charts";
import { DonutChart, RadarChart } from "@carbon/charts-react";
import type { DonutChartOptions, RadarChartOptions } from "@carbon/charts-react";
import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  JobPostingDto
} from "../../../../shared/src/index";
import { applicationStatuses, getApplicationStatusColor, getResumeGradeColor } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatApplicationTooltipValue } from "../../utils/format";

const applicationOutcomeColors = Object.fromEntries(applicationStatuses.map((option) => [option.label, option.color]));
const carbonCompanyGradientLight = ["#002d9c", "#0f62fe", "#4589ff", "#8a3ffc", "#a56eff"];
const carbonCompanyGradientDark = ["#33b1ff", "#4589ff", "#78a9ff", "#be95ff", "#d4bbff"];
const trackingResultsAlluvialNodePadding = 8;

// Carbon's default 24px minimum collapses link width when a 30rem chart has many company nodes.
carbonAlluvialConfig.minNodePadding = Math.min(carbonAlluvialConfig.minNodePadding, trackingResultsAlluvialNodePadding);

function TrackingResultsAlluvialChart({
  data,
  onExporterChange,
  options
}: {
  data: ChartTabularData;
  onExporterChange?: (exporter: (() => void) | null) => void;
  options: AlluvialChartOptions;
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    if (!chartContainer) {
      return;
    }

    const chartHolder = document.createElement("div");
    chartHolder.className = "chart-holder";
    chartContainer.replaceChildren(chartHolder);
    const chart = new CarbonAlluvialChart(chartHolder, { data, options });
    onExporterChange?.(() => chart.services.domUtils.exportToPNG());

    return () => {
      onExporterChange?.(null);
      chart.destroy();
      chartContainer.replaceChildren();
    };
  }, [data, onExporterChange, options]);

  return <div className="tracking-results-chart__core" ref={chartContainerRef} />;
}

type IncomingInterviewItem = {
  applicationId: string;
  company: string;
  date: Date;
  dateKey: string;
  label: string;
  role: string;
  timeLabel: string;
};

type IncomingCalendarDay = {
  date: Date;
  dateKey: string;
  dayNumber: number;
  interviews: IncomingInterviewItem[];
  isToday: boolean;
};

const calendarWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const unit = totalActivity === 1 ? "application tracked" : "applications tracked";
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

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function formatCalendarMonth(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function formatIncomingCalendarDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatInterviewTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getIncomingInterviews(applications: ApplicationDto[]) {
  const now = Date.now();

  return applications
    .flatMap((application) => {
      if (application.status !== "INTERVIEW") {
        return [];
      }

      return application.interviewDates.flatMap((interviewDate, index) => {
        const date = new Date(interviewDate.date);

        if (!Number.isFinite(date.getTime()) || date.getTime() < now) {
          return [];
        }

        return [
          {
            applicationId: application.id,
            company: application.company,
            date,
            dateKey: getLocalDateKey(date),
            label: interviewDate.label?.trim() || `Interview ${index + 1}`,
            role: application.role,
            timeLabel: formatInterviewTime(date)
          }
        ];
      });
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function getIncomingCalendarMonth(interviews: IncomingInterviewItem[]) {
  const currentMonth = getMonthStart(new Date());

  if (interviews.some((interview) => isSameMonth(interview.date, currentMonth))) {
    return currentMonth;
  }

  const firstInterview = interviews[0];
  return firstInterview ? getMonthStart(firstInterview.date) : currentMonth;
}

function getIncomingCalendarDays(month: Date, interviews: IncomingInterviewItem[]) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const todayKey = getLocalDateKey(new Date());
  const interviewsByDate = new Map<string, IncomingInterviewItem[]>();

  for (const interview of interviews) {
    if (!isSameMonth(interview.date, month)) {
      continue;
    }

    interviewsByDate.set(interview.dateKey, [...(interviewsByDate.get(interview.dateKey) ?? []), interview]);
  }

  const calendarDays: Array<IncomingCalendarDay | null> = Array.from({ length: firstWeekday }, () => null);

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(year, monthIndex, dayNumber);
    const dateKey = getLocalDateKey(date);

    calendarDays.push({
      date,
      dateKey,
      dayNumber,
      interviews: interviewsByDate.get(dateKey) ?? [],
      isToday: dateKey === todayKey
    });
  }

  return calendarDays;
}

function getInterviewDayLabel(day: IncomingCalendarDay) {
  if (day.interviews.length === 0) {
    return formatIncomingCalendarDate(day.date);
  }

  const interviewDetails = day.interviews
    .map((interview) => `${interview.timeLabel} ${interview.company}: ${interview.role} (${interview.label})`)
    .join("; ");

  return `${formatIncomingCalendarDate(day.date)}: ${interviewDetails}`;
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

function getApplicationAlluvialColorGroup(application: ApplicationDto) {
  if (application.status === "INTERVIEW") {
    return "Interview";
  }

  if (application.status === "OFFER" || application.status === "HIRED") {
    return "Offer";
  }

  if (application.status === "REJECTED") {
    return "Rejected";
  }

  return "Applied";
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

function incrementAlluvialLink(
  counts: Map<string, { group: string; source: string; target: string; value: number }>,
  group: string,
  source: string,
  target: string
) {
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

function getAlluvialReviewStageColor(stage: string) {
  const reviewStageColors: Record<string, string> = {
    Interview: getApplicationStatusColor("INTERVIEW"),
    "Resume pending": getApplicationStatusColor("APPLIED"),
    "Resume rejected": getApplicationStatusColor("REJECTED")
  };

  return reviewStageColors[stage] ?? getApplicationStatusColor("INTERVIEW");
}

function getAlluvialResultStageColor(result: string) {
  const resultStageColors: Record<string, string> = {
    "In progress": getApplicationStatusColor("APPLIED"),
    Offer: getApplicationStatusColor("OFFER"),
    Rejected: getApplicationStatusColor("REJECTED")
  };

  return resultStageColors[result] ?? getApplicationStatusColor("APPLIED");
}

function getAlluvialNodeColorScale(
  companies: string[],
  reviewStages: string[],
  resultStages: string[],
  themeMode: ThemeMode
) {
  const companyColors = Object.fromEntries(
    companies.map((company, index) => [company, getCompanyGradientColor(index, companies.length, themeMode)])
  );
  const reviewStageColors = Object.fromEntries(reviewStages.map((stage) => [stage, getAlluvialReviewStageColor(stage)]));
  const resultStageColors = Object.fromEntries(resultStages.map((result) => [result, getAlluvialResultStageColor(result)]));

  return {
    ...companyColors,
    ...reviewStageColors,
    ...resultStageColors
  };
}

function getCompanyGradientColor(index: number, total: number, themeMode: ThemeMode) {
  const stops = themeMode === "dark" ? carbonCompanyGradientDark : carbonCompanyGradientLight;
  if (total <= 1) {
    return stops[Math.floor(stops.length / 2)];
  }

  const scaledIndex = (index / (total - 1)) * (stops.length - 1);
  const lowerStopIndex = Math.floor(scaledIndex);
  const upperStopIndex = Math.ceil(scaledIndex);

  if (lowerStopIndex === upperStopIndex) {
    return stops[lowerStopIndex];
  }

  return interpolateHexColor(
    stops[lowerStopIndex],
    stops[upperStopIndex],
    scaledIndex - lowerStopIndex
  );
}

function interpolateHexColor(startHex: string, endHex: string, ratio: number) {
  const start = parseHexColor(startHex);
  const end = parseHexColor(endHex);
  return `#${[0, 1, 2]
    .map((channel) =>
      Math.round(start[channel] + (end[channel] - start[channel]) * ratio)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function parseHexColor(hexColor: string) {
  const normalizedHexColor = hexColor.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(normalizedHexColor.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number
  ];
}

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
  const [canExportAlluvialPng, setCanExportAlluvialPng] = useState(false);
  const alluvialExportPngRef = useRef<(() => void) | null>(null);
  const alluvialChartData = useMemo<ChartTabularData>(() => {
    const linkCounts = new Map<string, { group: string; source: string; target: string; value: number }>();

    for (const application of applications) {
      const reviewStage = getApplicationReviewStage(application);
      const resultStage = getApplicationResultStage(application);
      const colorGroup = getApplicationAlluvialColorGroup(application);

      incrementAlluvialLink(linkCounts, colorGroup, application.company, reviewStage);
      incrementAlluvialLink(linkCounts, colorGroup, reviewStage, resultStage);
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
  const alluvialChartHeight = "100%";
  const trackingResultsChartMinHeight = "14rem";
  const trackingResultsChartStyle = { "--tracking-results-chart-min-height": trackingResultsChartMinHeight } as CSSProperties;
  const alluvialChartKey = useMemo(
    () => `${themeMode}-${alluvialChartData.map((item) => `${item.group}:${item.source}:${item.target}:${item.value}`).join("|")}`,
    [alluvialChartData, themeMode]
  );
  const alluvialNodeColorScale = useMemo(
    () =>
      getAlluvialNodeColorScale(
        alluvialCompanies,
        alluvialReviewStages,
        alluvialResultStages,
        themeMode
      ),
    [alluvialCompanies, alluvialResultStages, alluvialReviewStages, themeMode]
  );
  const handleAlluvialExporterChange = useCallback((exporter: (() => void) | null) => {
    alluvialExportPngRef.current = exporter;
    setCanExportAlluvialPng(Boolean(exporter));
  }, []);
  const handleDownloadAlluvialPng = useCallback(() => {
    alluvialExportPngRef.current?.();
  }, []);
  const alluvialChartOptions = useMemo<AlluvialChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Tracked applications by company, status, and result"
      },
      alluvial: {
        nodes: [
          ...alluvialCompanies.map((company) => ({
            name: company,
            category: "Company"
          })),
          ...alluvialReviewStages.map((stage) => ({
            name: stage,
            category: "Status"
          })),
          ...alluvialResultStages.map((result) => ({
            name: result,
            category: "Result"
          }))
        ],
        nodeAlignment: "left",
        nodePadding: trackingResultsAlluvialNodePadding,
        units: "applications"
      },
      data: {
        groupMapsTo: "group"
      },
      color: {
        gradient: {
          enabled: true
        },
        scale: alluvialNodeColorScale
      },
      fileDownload: {
        fileName: "tracking-results-alluvial"
      },
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
    [alluvialChartHeight, alluvialCompanies, alluvialNodeColorScale, alluvialResultStages, alluvialReviewStages, themeMode]
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

  return (
    <Tile className="tracking-results-tile">
      <div className="tracking-results-panel">
        <div className="section-header">
          <div>
            <h2>Tracking results</h2>
            <p>Company to status to outcome</p>
          </div>
          <div className="tracking-results-controls">
            <Button
              disabled={!canExportAlluvialPng}
              hasIconOnly
              iconDescription="Download alluvial as PNG"
              kind="ghost"
              onClick={handleDownloadAlluvialPng}
              renderIcon={Download}
              size="sm"
            />
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
            style={trackingResultsChartStyle}
          >
            <TrackingResultsAlluvialChart
              data={alluvialChartData}
              key={alluvialChartKey}
              onExporterChange={handleAlluvialExporterChange}
              options={alluvialChartOptions}
            />
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

const IncomingInterviewsCalendarTile = memo(function IncomingInterviewsCalendarTile({
  applications = []
}: {
  applications?: ApplicationDto[];
}) {
  const incomingInterviews = useMemo(() => getIncomingInterviews(applications), [applications]);
  const calendarMonth = useMemo(() => getIncomingCalendarMonth(incomingInterviews), [incomingInterviews]);
  const calendarDays = useMemo(() => getIncomingCalendarDays(calendarMonth, incomingInterviews), [calendarMonth, incomingInterviews]);
  const incomingSummary = `${incomingInterviews.length} incoming ${
    incomingInterviews.length === 1 ? "interview" : "interviews"
  }`;
  const incomingCalendarStyle = {
    "--incoming-interview-color": getApplicationStatusColor("INTERVIEW")
  } as CSSProperties;

  return (
    <Tile className="incoming-interviews-tile">
      <div className="section-header">
        <div>
          <h2>Upcoming interviews</h2>
          <p>{incomingInterviews.length > 0 ? incomingSummary : "No incoming interviews"}</p>
        </div>
      </div>

      <div
        className="incoming-calendar"
        style={incomingCalendarStyle}
        aria-label={`${formatCalendarMonth(calendarMonth)} interview calendar`}
      >
        <div className="incoming-calendar__month">{formatCalendarMonth(calendarMonth)}</div>
        <div className="incoming-calendar__weekdays" aria-hidden="true">
          {calendarWeekdayLabels.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="incoming-calendar__grid">
          {calendarDays.map((day, index) =>
            day ? (
              <span
                className={`incoming-calendar__day${day.isToday ? " incoming-calendar__day--today" : ""}${
                  day.interviews.length > 0 ? " incoming-calendar__day--has-interview" : ""
                }`}
                key={day.dateKey}
                title={getInterviewDayLabel(day)}
                aria-label={getInterviewDayLabel(day)}
              >
                <span>{day.dayNumber}</span>
                {day.interviews.length > 0 ? <span className="incoming-calendar__indicator" aria-hidden="true" /> : null}
              </span>
            ) : (
              <span className="incoming-calendar__day incoming-calendar__day--empty" key={`empty-${index}`} aria-hidden="true" />
            )
          )}
        </div>
      </div>
    </Tile>
  );
});

const LatestResumeRadarTile = memo(function LatestResumeRadarTile({
  isChartActive = false,
  runs = [],
  themeMode
}: {
  isChartActive?: boolean;
  runs?: ResumeGraderRun[];
  themeMode: ThemeMode;
}) {
  const latestRun = runs[0] ?? null;
  const [canRenderRadar, setCanRenderRadar] = useState(false);
  const latestRunGradeColor = useMemo(() => getResumeGradeColor(latestRun?.grade), [latestRun?.grade]);
  const latestRunRadarData = useMemo<ChartTabularData>(
    () =>
      latestRun?.metrics.map((metric) => ({
        group: "Latest",
        metric: metric.label,
        value: metric.value
      })) ?? [],
    [latestRun]
  );
  const radarOptions = useMemo<RadarChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Latest resume grader metric profile"
      },
      data: {
        groupMapsTo: "group"
      },
      color: {
        scale: {
          Latest: latestRunGradeColor
        }
      },
      height: "14rem",
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
    [latestRunGradeColor, themeMode]
  );
  const radarChartKey = useMemo(
    () => `${themeMode}-${latestRun?.id ?? "none"}-${latestRunRadarData.map((item) => `${item.metric}:${item.value}`).join("|")}`,
    [latestRun?.id, latestRunRadarData, themeMode]
  );

  useEffect(() => {
    if (latestRunRadarData.length === 0 || !isChartActive) {
      setCanRenderRadar(false);
      return;
    }

    setCanRenderRadar(false);
    const frameId = window.requestAnimationFrame(() => {
      setCanRenderRadar(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isChartActive, latestRunRadarData.length, radarChartKey]);

  return (
    <Tile className="stats-resume-radar-tile">
      <div className="section-header">
        <div>
          <h2>Last resume run</h2>
          <p>{latestRun?.sourceName ?? "No resume runs"}</p>
        </div>
        <div
          className="stats-resume-run-score"
          aria-label={`Grade ${latestRun?.grade ?? "not graded"}, rank ${latestRun?.tier ?? "not graded"}`}
        >
          <strong className="stats-resume-run-grade">{latestRun?.grade ?? "--"}</strong>
          <strong className="stats-resume-run-rank">{latestRun?.tier ?? "--"}</strong>
        </div>
      </div>

      {latestRun ? (
        <div className="stats-resume-radar-panel">
          {canRenderRadar && isChartActive ? (
            <div className="stats-resume-radar-chart">
              <RadarChart data={latestRunRadarData} key={radarChartKey} options={radarOptions} />
            </div>
          ) : latestRunRadarData.length > 0 ? (
            <div className="stats-resume-radar-placeholder" aria-hidden="true" />
          ) : (
            <div className="stats-resume-radar-placeholder" aria-label="No metric scores yet" />
          )}
        </div>
      ) : (
        <div className="stats-resume-radar-panel">
          <div className="stats-resume-radar-placeholder" aria-label="No resume runs yet" />
        </div>
      )}
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

                      const applicationUnit = day.count === 1 ? "application" : "applications";
                      const activityLabel = `${formatActivityDate(day.date)}: ${day.count} ${applicationUnit}`;

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
            <span>Unique applications</span>
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
  const applicationOutcomeColorScale = useMemo(
    () =>
      Object.fromEntries(
        applicationOutcomeData
          .map((item) => item.group)
          .filter((group): group is string => typeof group === "string")
          .map((group) => [group, applicationOutcomeColors[group] ?? getApplicationStatusColor("APPLIED")])
      ),
    [applicationOutcomeData]
  );
  const applicationOutcomeOptions = useMemo<DonutChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Application outcomes by status"
      },
      color: {
        scale: applicationOutcomeColorScale
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
    [applicationOutcomeColorScale, applications.length, themeMode]
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

export const StatsPanel = memo(function StatsPanel({
  activityDays,
  applications,
  isChartActive,
  postings,
  resumeRuns,
  themeMode
}: {
  activityDays: ApplicationActivityDayDto[];
  applications: ApplicationDto[];
  isChartActive: boolean;
  postings: JobPostingDto[];
  resumeRuns: ResumeGraderRun[];
  themeMode: ThemeMode;
}) {
  return (
    <div className="stats-stack">
      <div className="stats-top-row">
        <TrackingResultsTile applications={applications} isChartActive={isChartActive} themeMode={themeMode} />
        <StatsOverviewTile applications={applications} postings={postings} themeMode={themeMode} />
      </div>
      <div className="stats-activity-row">
        <IncomingInterviewsCalendarTile applications={applications} />
        <ApplicationActivityHeatmapTile days={activityDays} />
        <LatestResumeRadarTile isChartActive={isChartActive} runs={resumeRuns} themeMode={themeMode} />
      </div>
    </div>
  );
});
