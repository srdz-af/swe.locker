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
import { RadarChart } from "@carbon/charts-react";
import type { RadarChartOptions } from "@carbon/charts-react";
import type {
  ApplicationActivityDayDto,
  ApplicationDto
} from "../../../../shared/src/index";
import { getApplicationStatusColor, getResumeGradeColor } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatApplicationTooltipValue } from "../../utils/format";

const carbonCompanyGradientLight = ["#002d9c", "#0f62fe", "#4589ff", "#8a3ffc", "#a56eff"];
const carbonCompanyGradientDark = ["#33b1ff", "#4589ff", "#78a9ff", "#be95ff", "#d4bbff"];
const trackingResultsAlluvialNodePadding = 18;

// Carbon's default 24px minimum can collapse link width when a compact chart has many company nodes.
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
    const chart = createCarbonAlluvialChart(chartHolder, { data, options });
    onExporterChange?.(() => chart.services.domUtils.exportToPNG());

    return () => {
      onExporterChange?.(null);
      chart.destroy();
      chartContainer.replaceChildren();
    };
  }, [data, onExporterChange, options]);

  return <div className="tracking-results-chart__core" ref={chartContainerRef} />;
}

function createCarbonAlluvialChart(
  holder: HTMLDivElement,
  config: {
    data: ChartTabularData;
    options: AlluvialChartOptions;
  }
) {
  const originalWarn = console.warn;

  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (typeof args[0] === "string" && /^".+" does not exist in data groups\.$/.test(args[0])) {
      return;
    }

    originalWarn(...args);
  };

  try {
    return new CarbonAlluvialChart(holder, config);
  } finally {
    console.warn = originalWarn;
  }
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
const alluvialUnderReviewStage = "Under review";
const alluvialOfferStage = "Offer";
const alluvialRejectedStage = "Rejected";
const alluvialHiredResult = "Hired";
const alluvialDeclinedResult = "Declined";
const alluvialGhostedResult = "Ghosted";
const alluvialWithdrawnResult = "Withdrawn";
const alluvialLayoutGroup = "__layout";
const alluvialOfferStageOrder = [alluvialOfferStage, alluvialRejectedStage];
const alluvialResultOrder = [alluvialHiredResult, alluvialDeclinedResult, alluvialGhostedResult, alluvialWithdrawnResult];
const alluvialDirectTerminalResults = [alluvialGhostedResult, alluvialWithdrawnResult];
const maxAlluvialInterviewRound = 20;
const trackingResultsChartBaseHeightRem = 20;
const trackingResultsChartCompanyRowRem = 1.25;
const trackingResultsChartDepthNodeRowRem = 1.75;

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
      if (application.archivedAt || application.status !== "INTERVIEW") {
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

function getAlluvialInterviewStage(round: number) {
  return round === 1 ? "Interview" : `Round ${round}`;
}

function getAlluvialInterviewStageOrder(maxRound: number) {
  return Array.from({ length: Math.max(0, maxRound) }, (_value, index) => getAlluvialInterviewStage(index + 1));
}

function isAlluvialInterviewStage(stage: string) {
  return stage === "Interview" || /^r\d+$/.test(stage) || /^Round \d+$/.test(stage);
}

function hasReachedInterview(application: ApplicationDto) {
  if (
    application.status === "INTERVIEW" ||
    application.status === "OFFER" ||
    application.status === "HIRED" ||
    application.status === "DECLINED"
  ) {
    return true;
  }

  return (application.events ?? []).some(
    (event) =>
      event.newStatus === "INTERVIEW" ||
      event.newStatus === "OFFER" ||
      event.newStatus === "HIRED" ||
      event.newStatus === "DECLINED" ||
      event.previousStatus === "INTERVIEW" ||
      event.previousStatus === "OFFER" ||
      event.previousStatus === "HIRED" ||
      event.previousStatus === "DECLINED"
  );
}

function getApplicationInterviewRound(application: ApplicationDto) {
  if (!hasReachedInterview(application)) {
    return 0;
  }

  const round = application.interviewRound ?? 1;
  if (!Number.isInteger(round)) {
    return 1;
  }

  return Math.max(1, Math.min(maxAlluvialInterviewRound, round));
}

function getApplicationAlluvialPath(application: ApplicationDto) {
  const path = [application.company, alluvialUnderReviewStage];

  if (application.status === "APPLIED") {
    return path;
  }

  const reachedInterview = hasReachedInterview(application);

  if (application.status === "REJECTED" && !reachedInterview) {
    return [...path, alluvialRejectedStage];
  }

  const interviewRound = getApplicationInterviewRound(application);
  for (let round = 1; round <= interviewRound; round += 1) {
    path.push(getAlluvialInterviewStage(round));
  }

  if (application.status === "INTERVIEW") {
    return path;
  }

  if (application.status === "REJECTED") {
    return [...path, alluvialRejectedStage];
  }

  if (application.status === "GHOSTED") {
    return [...path, alluvialGhostedResult];
  }

  if (application.status === "WITHDRAWN") {
    return [...path, alluvialWithdrawnResult];
  }

  path.push(alluvialOfferStage);

  if (application.status === "OFFER") {
    return path;
  }

  if (application.status === "HIRED") {
    return [...path, alluvialHiredResult];
  }

  if (application.status === "DECLINED") {
    return [...path, alluvialDeclinedResult];
  }

  return path;
}

function getApplicationAlluvialColorGroup(application: ApplicationDto) {
  if (application.status === "HIRED") {
    return alluvialHiredResult;
  }

  if (application.status === "DECLINED") {
    return alluvialDeclinedResult;
  }

  if (application.status === "GHOSTED") {
    return alluvialGhostedResult;
  }

  if (application.status === "WITHDRAWN") {
    return alluvialWithdrawnResult;
  }

  if (application.status === "REJECTED") {
    return alluvialRejectedStage;
  }

  if (application.status === "OFFER") {
    return alluvialOfferStage;
  }

  if (application.status === "INTERVIEW") {
    return getAlluvialInterviewStage(getApplicationInterviewRound(application) || 1);
  }

  return alluvialUnderReviewStage;
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

function addAlluvialLayoutLink(
  counts: Map<string, { group: string; source: string; target: string; value: number }>,
  source: string,
  target: string
) {
  counts.set(`${source}\u0000${target}\u0000${alluvialLayoutGroup}`, {
    group: alluvialLayoutGroup,
    source,
    target,
    value: 0
  });
}

function getAlluvialStageColor(stage: string) {
  if (isAlluvialInterviewStage(stage)) {
    return getApplicationStatusColor("INTERVIEW");
  }

  const stageColors: Record<string, string> = {
    [alluvialUnderReviewStage]: getApplicationStatusColor("APPLIED"),
    [alluvialOfferStage]: getApplicationStatusColor("OFFER"),
    [alluvialRejectedStage]: getApplicationStatusColor("REJECTED"),
    [alluvialHiredResult]: getApplicationStatusColor("HIRED"),
    [alluvialDeclinedResult]: getApplicationStatusColor("DECLINED"),
    [alluvialGhostedResult]: getApplicationStatusColor("GHOSTED"),
    [alluvialWithdrawnResult]: getApplicationStatusColor("WITHDRAWN")
  };

  return stageColors[stage] ?? getApplicationStatusColor("APPLIED");
}

function getAlluvialNodeColorScale(companies: string[], stages: string[], themeMode: ThemeMode) {
  const companyColors = Object.fromEntries(
    companies.map((company, index) => [company, getCompanyGradientColor(index, companies.length, themeMode)])
  );
  const stageColors = Object.fromEntries(stages.map((stage) => [stage, getAlluvialStageColor(stage)]));

  return {
    ...companyColors,
    ...stageColors
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

function getIncludedAlluvialStages(paths: string[][], stageOrder: string[]) {
  return stageOrder.filter((stage) => paths.some((path) => path.includes(stage)));
}

function getIncludedAlluvialDirectTerminalResults(paths: string[][]) {
  return alluvialDirectTerminalResults.filter((result) => paths.some((path) => path.includes(result)));
}

function getMaxAlluvialPathDepthNodeCount(paths: string[][]) {
  const nodesByDepth = new Map<number, Set<string>>();

  for (const path of paths) {
    path.forEach((node, depth) => {
      const depthNodes = nodesByDepth.get(depth) ?? new Set<string>();
      depthNodes.add(node);
      nodesByDepth.set(depth, depthNodes);
    });
  }

  return Math.max(0, ...Array.from(nodesByDepth.values(), (nodes) => nodes.size));
}

function getTrackingResultsChartMinHeight(companyCount: number, maxDepthNodeCount: number) {
  return `${Math.max(
    trackingResultsChartBaseHeightRem,
    companyCount * trackingResultsChartCompanyRowRem,
    maxDepthNodeCount * trackingResultsChartDepthNodeRowRem
  )}rem`;
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
  const maxRenderedInterviewRound = useMemo(
    () => Math.max(0, ...applications.map(getApplicationInterviewRound)),
    [applications]
  );
  const alluvialPaths = useMemo(() => applications.map(getApplicationAlluvialPath), [applications]);
  const alluvialInterviewStageOrder = useMemo(
    () => getAlluvialInterviewStageOrder(maxRenderedInterviewRound),
    [maxRenderedInterviewRound]
  );
  const alluvialChartData = useMemo<ChartTabularData>(() => {
    const linkCounts = new Map<string, { group: string; source: string; target: string; value: number }>();

    for (const [applicationIndex, application] of applications.entries()) {
      const path = alluvialPaths[applicationIndex];
      const colorGroup = getApplicationAlluvialColorGroup(application);

      for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex += 1) {
        incrementAlluvialLink(linkCounts, colorGroup, path[pathIndex], path[pathIndex + 1]);
      }
    }

    if (maxRenderedInterviewRound > 0) {
      const lastInterviewStage = getAlluvialInterviewStage(maxRenderedInterviewRound);
      const hasOfferStage = alluvialPaths.some((path) => path.includes(alluvialOfferStage));
      const directTerminalResults = getIncludedAlluvialDirectTerminalResults(alluvialPaths);

      if (hasOfferStage) {
        addAlluvialLayoutLink(linkCounts, lastInterviewStage, alluvialOfferStage);
      }

      if (alluvialPaths.some((path) => path.includes(alluvialRejectedStage))) {
        addAlluvialLayoutLink(linkCounts, lastInterviewStage, alluvialRejectedStage);
      }

      for (const result of directTerminalResults) {
        addAlluvialLayoutLink(linkCounts, hasOfferStage ? alluvialOfferStage : lastInterviewStage, result);
      }
    }

    return Array.from(linkCounts.values()).sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.target.localeCompare(right.target) || left.group.localeCompare(right.group)
    );
  }, [alluvialPaths, applications, maxRenderedInterviewRound]);
  const alluvialCompanies = useMemo(() => Array.from(new Set(applications.map((application) => application.company))).sort(), [applications]);
  const alluvialResumeStages = useMemo(
    () => (alluvialPaths.length > 0 ? [alluvialUnderReviewStage] : []),
    [alluvialPaths.length]
  );
  const alluvialInterviewStages = useMemo(
    () => getIncludedAlluvialStages(alluvialPaths, alluvialInterviewStageOrder),
    [alluvialInterviewStageOrder, alluvialPaths]
  );
  const alluvialOfferStages = useMemo(
    () => getIncludedAlluvialStages(alluvialPaths, alluvialOfferStageOrder),
    [alluvialPaths]
  );
  const alluvialResultStages = useMemo(
    () => getIncludedAlluvialStages(alluvialPaths, alluvialResultOrder),
    [alluvialPaths]
  );
  const alluvialStages = useMemo(
    () => [...alluvialResumeStages, ...alluvialInterviewStages, ...alluvialOfferStages, ...alluvialResultStages],
    [alluvialInterviewStages, alluvialOfferStages, alluvialResultStages, alluvialResumeStages]
  );
  const maxAlluvialPathDepthNodeCount = useMemo(() => getMaxAlluvialPathDepthNodeCount(alluvialPaths), [alluvialPaths]);
  const alluvialChartHeight = "100%";
  const trackingResultsChartMinHeight = useMemo(
    () => getTrackingResultsChartMinHeight(alluvialCompanies.length, maxAlluvialPathDepthNodeCount),
    [alluvialCompanies.length, maxAlluvialPathDepthNodeCount]
  );
  const trackingResultsChartStyle = { "--tracking-results-chart-min-height": trackingResultsChartMinHeight } as CSSProperties;
  const alluvialChartKey = useMemo(
    () => `${themeMode}-${alluvialChartData.map((item) => `${item.group}:${item.source}:${item.target}:${item.value}`).join("|")}`,
    [alluvialChartData, themeMode]
  );
  const alluvialNodeColorScale = useMemo(
    () =>
      getAlluvialNodeColorScale(
        alluvialCompanies,
        alluvialStages,
        themeMode
      ),
    [alluvialCompanies, alluvialStages, themeMode]
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
        svgAriaLabel: "Tracked applications by company, review stage, interview rounds, offer stage, and result"
      },
      alluvial: {
        nodes: [
          ...alluvialCompanies.map((company) => ({
            name: company,
            category: ""
          })),
          ...alluvialResumeStages.map((stage) => ({
            name: stage,
            category: ""
          })),
          ...alluvialInterviewStages.map((stage) => ({
            name: stage,
            category: ""
          })),
          ...alluvialOfferStages.map((stage) => ({
            name: stage,
            category: ""
          })),
          ...alluvialResultStages.map((result) => ({
            name: result,
            category: ""
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
    [
      alluvialChartHeight,
      alluvialCompanies,
      alluvialInterviewStages,
      alluvialNodeColorScale,
      alluvialOfferStages,
      alluvialResultStages,
      alluvialResumeStages,
      themeMode
    ]
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
            <p>Company to review, interview, and outcome</p>
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

export const StatsPanel = memo(function StatsPanel({
  activityDays,
  applications,
  isChartActive,
  resumeRuns,
  themeMode
}: {
  activityDays: ApplicationActivityDayDto[];
  applications: ApplicationDto[];
  isChartActive: boolean;
  resumeRuns: ResumeGraderRun[];
  themeMode: ThemeMode;
}) {
  return (
    <div className="stats-stack">
      <div className="stats-top-row">
        <TrackingResultsTile applications={applications} isChartActive={isChartActive} themeMode={themeMode} />
      </div>
      <div className="stats-activity-row">
        <IncomingInterviewsCalendarTile applications={applications} />
        <ApplicationActivityHeatmapTile days={activityDays} />
        <LatestResumeRadarTile isChartActive={isChartActive} runs={resumeRuns} themeMode={themeMode} />
      </div>
    </div>
  );
});
