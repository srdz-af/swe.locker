import {
  memo,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Checkbox, Tile } from "@carbon/react";
import { AlluvialChart, DonutChart } from "@carbon/charts-react";
import type { AlluvialChartOptions, ChartTabularData, DonutChartOptions } from "@carbon/charts-react";
import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  JobPostingDto
} from "../../../../shared/src/index";
import { applicationStatuses, getApplicationStatusColor } from "../../constants";
import type { ThemeMode } from "../../types/app";
import { formatApplicationTooltipValue } from "../../utils/format";

const applicationOutcomeColors = Object.fromEntries(applicationStatuses.map((option) => [option.label, option.color]));

const alluvialOutcomeColors = {
  Applied: getApplicationStatusColor("APPLIED"),
  Interview: getApplicationStatusColor("INTERVIEW"),
  Offer: getApplicationStatusColor("OFFER"),
  Rejected: getApplicationStatusColor("REJECTED")
};

type AlluvialLinkElement = SVGPathElement & {
  __data__?: {
    group?: string;
  };
};

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

function getAlluvialOutcomeColor(group: string | undefined) {
  return alluvialOutcomeColors[group as keyof typeof alluvialOutcomeColors] ?? getApplicationStatusColor("APPLIED");
}

function applyAlluvialOutcomeColors(container: HTMLElement) {
  const links = container.querySelectorAll<AlluvialLinkElement>("path.link");

  for (const link of links) {
    link.style.stroke = getAlluvialOutcomeColor(link.__data__?.group);
  }
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
  const trackingResultsChartRef = useRef<HTMLDivElement | null>(null);
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
  const alluvialChartHeight = `${Math.max(16, Math.min(26, 8 + alluvialCompanies.length))}rem`;
  const trackingResultsChartStyle = { "--tracking-results-chart-height": alluvialChartHeight } as CSSProperties;
  const alluvialChartKey = useMemo(
    () => `${themeMode}-${alluvialChartData.map((item) => `${item.group}:${item.source}:${item.target}:${item.value}`).join("|")}`,
    [alluvialChartData, themeMode]
  );
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
        alluvialOutcomeColors[group as keyof typeof alluvialOutcomeColors] ?? defaultStrokeColor ?? getApplicationStatusColor("APPLIED"),
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
            <p>Company to status to outcome</p>
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
        scale: applicationOutcomeColors
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

export const StatsPanel = memo(function StatsPanel({
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
