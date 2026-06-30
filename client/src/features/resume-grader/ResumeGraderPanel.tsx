import { memo, type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, FileUploaderButton, Loading, Modal, Tab, TabList, TabPanel, TabPanels, Tabs, Tile } from "@carbon/react";
import { ChevronDown, Help, TrashCan } from "@carbon/icons-react";
import { LineChart, RadarChart, ScaleTypes } from "@carbon/charts-react";
import type { ChartTabularData, LineChartOptions, RadarChartOptions } from "@carbon/charts-react";
import type { ApplicationDto } from "../../../../shared/src/index";
import { TextModePanel, type TextMode } from "../../components/TextModePanel";
import { getResumeGradeColor, resumeAcceptedFileTypes } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatDate, getApplicationStatusLabel } from "../../utils/format";
import {
  compareResumeRunsByCreatedAtAsc,
  getResumeRunIdFromChartDatum,
  getResumeRunIdFromChartTarget
} from "./resumeRuns";
import { parseResumeMarkdownModel } from "./resumeMarkdown";
import type { ParsedResumeDocument } from "./resumeMarkdown";

export const ResumeGraderPanel = memo(function ResumeGraderPanel({
  applications,
  isUploadPending,
  onDeleteRun,
  onUpload,
  runs,
  themeMode
}: {
  applications: ApplicationDto[];
  isUploadPending: boolean;
  onDeleteRun: (run: ResumeGraderRun) => Promise<void>;
  onUpload: (file: File) => void;
  runs: ResumeGraderRun[];
  themeMode: ThemeMode;
}) {
  const latestRun = runs[0] ?? null;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => latestRun?.id ?? null);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [resumeTextViewMode, setResumeTextViewMode] = useState<TextMode>("preview");
  const resumeHistoryChartRef = useRef<HTMLDivElement | null>(null);
  const previousLatestRunIdRef = useRef<string | null>(latestRun?.id ?? null);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? latestRun,
    [latestRun, runs, selectedRunId]
  );
  const selectedGrade = selectedRun?.grade ?? null;
  const selectedTier = selectedRun?.tier ?? null;
  const selectedGradeColor = useMemo(() => getResumeGradeColor(selectedGrade), [selectedGrade]);
  const hasSelectedGrade = selectedGrade !== null && selectedTier !== null;
  const selectedRunComments = selectedRun?.verdict ?? "Raw text extracted. Grading is not implemented yet.";
  const resumeCommentGroups = useMemo(() => (selectedRun ? getResumeCommentGroups(selectedRun) : []), [selectedRun]);
  const resumeReviewComments = useMemo(() => getResumeReviewComments(resumeCommentGroups), [resumeCommentGroups]);
  const selectedRunApplications = useMemo(
    () => getAssociatedResumeApplications(applications, selectedRun?.id ?? null),
    [applications, selectedRun?.id]
  );
  const selectedRunMetricColumns = useMemo(
    () => (selectedRun ? getResumeMetricColumns(selectedRun, resumeCommentGroups) : []),
    [resumeCommentGroups, selectedRun]
  );
  const resumeMarkdownDocument = useMemo(
    () => (selectedRun ? parseResumeMarkdownModel(selectedRun.parsedText) : null),
    [selectedRun?.parsedText]
  );
  const hasResumeReadabilityWarning = resumeMarkdownDocument
    ? hasResumeMarkdownReadabilityWarning(resumeMarkdownDocument.warnings)
    : false;

  useEffect(() => {
    const previousLatestRunId = previousLatestRunIdRef.current;
    const latestRunId = latestRun?.id ?? null;
    previousLatestRunIdRef.current = latestRunId;

    setSelectedRunId((currentRunId) => {
      if (latestRunId && previousLatestRunId && latestRunId !== previousLatestRunId) {
        return latestRunId;
      }

      if (currentRunId && runs.some((run) => run.id === currentRunId)) {
        return currentRunId;
      }

      return latestRunId;
    });
  }, [latestRun?.id, runs]);

  useEffect(() => {
    setExpandedCommentId(null);
    setResumeTextViewMode("preview");
  }, [selectedRun?.id]);

  useEffect(() => {
    setExpandedCommentId((currentCommentId) => {
      if (currentCommentId && resumeReviewComments.some((comment) => comment.id === currentCommentId)) {
        return currentCommentId;
      }

      return null;
    });
  }, [resumeReviewComments]);

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
      color: {
        scale: {
          Selected: selectedGradeColor
        }
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
    [selectedGradeColor, themeMode]
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
                <p>{selectedRunComments}</p>
                <Button
                  kind="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setResumeTextViewMode("preview");
                    setIsCommentsModalOpen(true);
                  }}
                >
                  Review
                </Button>
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
                        aria-label="Measures how well the resume is built against resume best practices, for example use of STAR format"
                      >
                        <Help size={14} />
                        <span className="resume-score-tooltip" role="tooltip">
                          Measures how well the resume is built against resume best practices (e.g. use of STAR format)
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

      <Modal
        className="resume-comments-modal"
        modalHeading="Review"
        open={isCommentsModalOpen}
        passiveModal
        size="lg"
        onRequestClose={() => setIsCommentsModalOpen(false)}
      >
        {selectedRun ? (
          <div className="resume-comments-layout">
            <div className="resume-review-tabs">
              <Tabs>
                <TabList aria-label="Resume review details" size="sm">
                  <Tab>Comments</Tab>
                  <Tab>Associated applications</Tab>
                  <Tab>Metrics</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel className="resume-review-tab-panel resume-review-tab-panel--comments">
                    <TextModePanel
                      ariaLabel="Original resume"
                      actionsClassName="resume-comments-panel-actions"
                      className="resume-comments-original-panel"
                      footer={<span className="resume-comments-character-count">{selectedRun.parsedText.length} chars</span>}
                      headerClassName="resume-comments-panel-header"
                      id={`resume-text-${selectedRun.id}`}
                      mode={resumeTextViewMode}
                      onModeChange={setResumeTextViewMode}
                      previewBodyClassName="resume-review-body"
                      previewContent={
                        resumeTextViewMode === "preview" && resumeMarkdownDocument ? (
                          <ResumeFormattedReviewDocument
                            beforeContent={
                              hasResumeReadabilityWarning ? (
                                <div className="resume-ats-warning">
                                  <strong>ATS readability warning</strong>
                                  <span>Could not confidently recover resume structure from the extracted text.</span>
                                </div>
                              ) : null
                            }
                            comments={resumeReviewComments}
                            document={resumeMarkdownDocument}
                            expandedCommentId={expandedCommentId}
                            onCommentToggle={(commentId) =>
                              setExpandedCommentId((currentCommentId) =>
                                currentCommentId === commentId ? null : commentId
                              )
                            }
                            onHighlightClick={(commentId) => setExpandedCommentId(commentId)}
                            text={selectedRun.parsedText}
                          />
                        ) : null
                      }
                      previewLabel="Formatted"
                      rawBodyClassName="resume-review-body"
                      rawContent={
                        resumeTextViewMode === "raw" ? (
                          <ResumeReviewDocument
                            comments={resumeReviewComments}
                            expandedCommentId={expandedCommentId}
                            onCommentToggle={(commentId) =>
                              setExpandedCommentId((currentCommentId) =>
                                currentCommentId === commentId ? null : commentId
                              )
                            }
                            onHighlightClick={(commentId) => setExpandedCommentId(commentId)}
                            text={selectedRun.parsedText}
                          />
                        ) : null
                      }
                      rawLabel="Raw"
                      scrollKey={`${selectedRun.id}-review`}
                      title={selectedRun.sourceName}
                      tabsAriaLabel="Resume text view"
                      tabsClassName="resume-text-view-tabs"
                      tabsHelp={
                        <span
                          className="resume-text-view-help"
                          tabIndex={0}
                          aria-label="Shows the resume text exactly as extracted. Use this to check whether ATS parsing may have missed, reordered, or misread anything."
                        >
                          <Help size={16} />
                          <span className="resume-text-view-help-tooltip" role="tooltip">
                            Shows the resume text exactly as extracted. Use this to check whether ATS parsing may have
                            missed, reordered, or misread anything.
                          </span>
                        </span>
                      }
                      toggleLabel="Raw text"
                    />
                  </TabPanel>
                  <TabPanel className="resume-review-tab-panel resume-review-tab-panel--details">
                    <div className="resume-review-detail-panel">
                      <ResumeAssociatedApplications applications={selectedRunApplications} />
                    </div>
                  </TabPanel>
                  <TabPanel className="resume-review-tab-panel resume-review-tab-panel--details">
                    <div className="resume-review-detail-panel">
                      <ResumeMetricsTable columns={selectedRunMetricColumns} />
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </div>
        ) : null}
      </Modal>

      <Tile className="resume-runs-tile">
        <div className="section-header">
          <div>
            <h2>Past runs</h2>
            <p>{runs.length} resume analyses</p>
          </div>
          <div className="resume-runs-header-actions">
            {isUploadPending ? <Loading description="Extracting resume text" small withOverlay={false} /> : null}
            <FileUploaderButton
              accept={resumeAcceptedFileTypes}
              buttonKind="primary"
              disabled={isUploadPending}
              disableLabelChanges
              id="resume-new-run"
              labelText="New run"
              multiple={false}
              name="resume-new-run"
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
        </div>

        {runs.length > 0 ? (
          <div className="resume-runs-list">
            {runs.map((run) => (
              <div
                className={`resume-run-row${run.id === selectedRun?.id ? " resume-run-row--selected" : ""}`}
                key={run.id}
              >
                <button
                  className="resume-run-row__select"
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
                <Button
                  className="resume-run-row__delete"
                  hasIconOnly
                  iconDescription={`Delete ${run.sourceName}`}
                  kind="ghost"
                  renderIcon={TrashCan}
                  size="sm"
                  tooltipPosition="left"
                  onClick={() => void onDeleteRun(run)}
                />
              </div>
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

type ResumeTextComment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

type ResumeReviewComment = ResumeTextComment & {
  colorIndex: number;
  groupId: string;
  groupLabel: string;
  ordinal: number;
};

type ResumeCommentGroup = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeTextComment[];
};

type ResumeMetricColumn = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeTextComment[];
};

type ResumeTextSegment = {
  anchorCommentIds: string[];
  comments: ResumeReviewComment[];
  text: string;
};

type ResumeTextRange = {
  start: number;
  end: number;
};

type ResumeReviewLayoutState = {
  measuredCommentId: string | null;
  minBlockSize: number;
  positions: Record<string, number>;
};

type SetResumeReviewHighlightRef = (commentId: string, refKey: string, element: HTMLElement | null) => void;
type SetResumeReviewClickedHighlightRef = (commentId: string, element: HTMLElement) => void;

type ResumeNormalizedTextIndex = {
  normalizedText: string;
  rawIndices: number[];
};

const resumeReviewColorCount = 8;

function hasResumeMarkdownReadabilityWarning(warnings: string[]) {
  return warnings.some((warning) =>
    ["garbled_text", "low_structure_confidence", "missing_sections", "many_short_lines"].includes(warning)
  );
}

function getAssociatedResumeApplications(applications: ApplicationDto[], resumeRunId: string | null) {
  if (!resumeRunId) {
    return [];
  }

  return applications
    .filter((application) => application.submittedResumeRunId === resumeRunId)
    .sort((firstApplication, secondApplication) => {
      const firstUpdatedAt = Date.parse(firstApplication.updatedAt);
      const secondUpdatedAt = Date.parse(secondApplication.updatedAt);

      return secondUpdatedAt - firstUpdatedAt;
    });
}

function getResumeCommentGroups(run: ResumeGraderRun): ResumeCommentGroup[] {
  const storedGroups = run.comments ?? [];
  const usedStoredGroupIds = new Set<string>();
  const signalGroup =
    findResumeCommentGroup(storedGroups, usedStoredGroupIds, "rank", "Signal") ??
    findResumeCommentGroup(storedGroups, usedStoredGroupIds, "signal", "Signal") ??
    findResumeCommentGroup(storedGroups, usedStoredGroupIds, "rank", "Rank");
  const groups: ResumeCommentGroup[] = [];

  for (const [metricIndex, metric] of run.metrics.entries()) {
    const metricId = `metric-${slugifyResumeCommentId(metric.label)}-${metricIndex}`;
    const metricGroup = findResumeCommentGroup(storedGroups, usedStoredGroupIds, metricId, metric.label);

    groups.push({
      id: metricGroup?.id ?? metricId,
      label: metricGroup?.label ?? metric.label,
      scoreLabel: metricGroup?.scoreLabel ?? `${metric.value}/100`,
      comments: metricGroup?.comments ?? []
    });
  }

  for (const storedGroup of storedGroups) {
    if (!usedStoredGroupIds.has(storedGroup.id)) {
      groups.push(storedGroup);
    }
  }

  groups.push({
    id: signalGroup?.id ?? "rank",
    label: "Signal",
    scoreLabel: getSignalScoreLabel(signalGroup?.scoreLabel, run.tier),
    comments: signalGroup?.comments ?? []
  });

  return groups;
}

function getResumeMetricColumns(run: ResumeGraderRun, groups: ResumeCommentGroup[]): ResumeMetricColumn[] {
  return run.metrics.map((metric, metricIndex) => {
    const metricId = `metric-${slugifyResumeCommentId(metric.label)}-${metricIndex}`;
    const metricGroup =
      groups.find((group) => group.id === metricId) ??
      groups.find((group) => normalizeResumeCommentGroupLabel(group.label) === normalizeResumeCommentGroupLabel(metric.label));

    return {
      id: metricGroup?.id ?? metricId,
      label: metric.label,
      scoreLabel: metricGroup?.scoreLabel ?? `${metric.value}/100`,
      comments: metricGroup?.comments ?? []
    };
  });
}

function getResumeReviewComments(groups: ResumeCommentGroup[]): ResumeReviewComment[] {
  let ordinal = 0;

  return groups
    .flatMap((group, groupIndex) =>
      group.comments.map((comment) => {
        ordinal += 1;

        return {
          ...comment,
          colorIndex: groupIndex % resumeReviewColorCount,
          groupId: group.id,
          groupLabel: group.label,
          ordinal
        };
      })
    )
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);
}

function getSignalScoreLabel(scoreLabel: string | undefined, tier: string | null) {
  return scoreLabel?.replace(/^(?:Rank|Signal)\s+/i, "") ?? tier ?? "--";
}

function findResumeCommentGroup(
  groups: ResumeCommentGroup[],
  usedGroupIds: Set<string>,
  id: string,
  label: string
) {
  const idMatch = groups.find((group) => group.id === id && !usedGroupIds.has(group.id));
  if (idMatch) {
    usedGroupIds.add(idMatch.id);
    return idMatch;
  }

  const normalizedLabel = normalizeResumeCommentGroupLabel(label);
  const labelMatch = groups.find(
    (group) => normalizeResumeCommentGroupLabel(group.label) === normalizedLabel && !usedGroupIds.has(group.id)
  );
  if (labelMatch) {
    usedGroupIds.add(labelMatch.id);
    return labelMatch;
  }

  return null;
}

function normalizeResumeCommentGroupLabel(value: string) {
  return value.trim().toLowerCase();
}

function slugifyResumeCommentId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "metric";
}

function ResumeAssociatedApplications({ applications }: { applications: ApplicationDto[] }) {
  if (applications.length === 0) {
    return (
      <div className="resume-review-empty">
        <p>No associated applications.</p>
      </div>
    );
  }

  return (
    <ul className="resume-associated-applications-list" aria-label="Associated applications">
      {applications.map((application) => (
        <li className="resume-associated-application" key={application.id}>
          <div>
            <strong>{application.company}</strong>
            <span>{application.role}</span>
          </div>
          <div className="resume-associated-application__meta">
            <span>{getApplicationStatusLabel(application.status)}</span>
            <span>Updated {formatDate(application.updatedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResumeMetricsTable({ columns }: { columns: ResumeMetricColumn[] }) {
  if (columns.length === 0) {
    return (
      <div className="resume-review-empty">
        <p>No metrics yet.</p>
      </div>
    );
  }

  const rowCount = Math.max(1, ...columns.map((column) => column.comments.length));

  return (
    <div className="resume-metrics-table-scroll">
      <table className="resume-metrics-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                <span>{column.label}</span>
                <strong>{column.scoreLabel}</strong>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <tr key={`metric-comment-row-${rowIndex}`}>
              {columns.map((column) => {
                const comment = column.comments[rowIndex];

                return (
                  <td key={`${column.id}-${rowIndex}`}>
                    {comment ? (
                      <p>{comment.text}</p>
                    ) : rowIndex === 0 ? (
                      <span className="resume-metrics-empty-cell">No comments</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumeReviewSurface({
  children,
  comments,
  contentClassName,
  expandedCommentId,
  onCommentToggle
}: {
  children: (
    setHighlightRef: SetResumeReviewHighlightRef,
    setClickedHighlightRef: SetResumeReviewClickedHighlightRef
  ) => ReactNode;
  comments: ResumeReviewComment[];
  contentClassName: string;
  expandedCommentId: string | null;
  onCommentToggle: (commentId: string) => void;
}) {
  const documentRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const marginRef = useRef<HTMLElement | null>(null);
  const highlightRefs = useRef(new Map<string, Map<string, HTMLElement>>());
  const clickedHighlightRef = useRef<{ commentId: string; element: HTMLElement } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [highlightSelectionVersion, setHighlightSelectionVersion] = useState(0);
  const [layout, setLayout] = useState<ResumeReviewLayoutState>({
    measuredCommentId: null,
    minBlockSize: 0,
    positions: {}
  });
  const activeComment = comments.find((comment) => comment.id === expandedCommentId) ?? null;
  const activeCommentTop = activeComment ? layout.positions[activeComment.id] : undefined;
  const isActiveCommentMeasured =
    activeComment !== null && layout.measuredCommentId === activeComment.id && activeCommentTop !== undefined;

  function getActiveHighlightElement(commentId: string, contentElement: HTMLElement) {
    const clickedHighlight = clickedHighlightRef.current;

    if (
      clickedHighlight?.commentId === commentId &&
      clickedHighlight.element.isConnected &&
      contentElement.contains(clickedHighlight.element) &&
      clickedHighlight.element.getClientRects().length > 0
    ) {
      return clickedHighlight.element;
    }

    const storedHighlightElements = Array.from(highlightRefs.current.get(commentId)?.values() ?? []);
    const expandedHighlightElements = Array.from(
      contentElement.querySelectorAll<HTMLElement>(".resume-review-highlight")
    ).filter((element) => element.getAttribute("aria-controls") === `resume-review-comment-${commentId}`);
    const visibleHighlightElements = Array.from(new Set([...storedHighlightElements, ...expandedHighlightElements]))
      .filter((element) => element.isConnected && contentElement.contains(element) && element.getClientRects().length > 0)
      .sort((firstElement, secondElement) => {
        const firstRect = firstElement.getBoundingClientRect();
        const secondRect = secondElement.getBoundingClientRect();

        return firstRect.top - secondRect.top || firstRect.left - secondRect.left;
      });

    return visibleHighlightElements[0] ?? null;
  }

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function updateLayout() {
      const documentElement = documentRef.current;
      const contentElement = contentRef.current;
      const marginElement = marginRef.current;

      if (!documentElement || !contentElement || !marginElement) {
        return;
      }

      const marginTop = marginElement.getBoundingClientRect().top;
      const nextPositions: Record<string, number> = {};
      let commentEnd = 0;
      let nextMeasuredCommentId: string | null = null;

      if (activeComment) {
        const highlightElement = getActiveHighlightElement(activeComment.id, contentElement);
        const cardElement = cardRefs.current.get(activeComment.id);

        if (highlightElement) {
          const highlightTop = highlightElement
            ? Math.max(0, highlightElement.getBoundingClientRect().top - marginTop)
            : 0;
          const cardHeight = cardElement?.offsetHeight ?? 48;

          nextPositions[activeComment.id] = highlightTop;
          commentEnd = highlightTop + cardHeight;
          nextMeasuredCommentId = activeComment.id;
        }
      }

      const nextMinBlockSize = Math.max(contentElement.scrollHeight, commentEnd);

      setLayout((currentLayout) => {
        const currentPositionKeys = Object.keys(currentLayout.positions);
        const nextPositionKeys = Object.keys(nextPositions);
        const hasSamePositions =
          currentPositionKeys.length === nextPositionKeys.length &&
          nextPositionKeys.every((key) => currentLayout.positions[key] === nextPositions[key]);

        if (
          currentLayout.measuredCommentId === nextMeasuredCommentId &&
          currentLayout.minBlockSize === nextMinBlockSize &&
          hasSamePositions
        ) {
          return currentLayout;
        }

        return {
          measuredCommentId: nextMeasuredCommentId,
          minBlockSize: nextMinBlockSize,
          positions: nextPositions
        };
      });
    }

    updateLayout();

    const resizeObserver = new ResizeObserver(updateLayout);
    if (documentRef.current) {
      resizeObserver.observe(documentRef.current);
    }
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    for (const cardElement of cardRefs.current.values()) {
      resizeObserver.observe(cardElement);
    }

    window.addEventListener("resize", updateLayout);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [activeComment?.id, highlightSelectionVersion]);

  function setHighlightRef(commentId: string, refKey: string, element: HTMLElement | null) {
    let commentHighlightRefs = highlightRefs.current.get(commentId);

    if (element) {
      if (!commentHighlightRefs) {
        commentHighlightRefs = new Map<string, HTMLElement>();
        highlightRefs.current.set(commentId, commentHighlightRefs);
      }

      commentHighlightRefs.set(refKey, element);
      return;
    }

    commentHighlightRefs?.delete(refKey);

    if (commentHighlightRefs?.size === 0) {
      highlightRefs.current.delete(commentId);
    }
  }

  function setClickedHighlightRef(commentId: string, element: HTMLElement) {
    clickedHighlightRef.current = { commentId, element };
    setHighlightSelectionVersion((currentVersion) => currentVersion + 1);
  }

  function setCardRef(commentId: string, element: HTMLElement | null) {
    if (element) {
      cardRefs.current.set(commentId, element);
      return;
    }

    cardRefs.current.delete(commentId);
  }

  return (
    <div
      className="resume-review-document"
      ref={documentRef}
      style={{ "--resume-review-min-block-size": `${layout.minBlockSize}px` } as CSSProperties}
    >
      <div className={["resume-review-content", contentClassName].join(" ")} ref={contentRef}>
        {children(setHighlightRef, setClickedHighlightRef)}
      </div>

      <aside className="resume-review-margin" ref={marginRef} aria-label="Resume review comments">
        {activeComment ? (
          <article
            className={`resume-review-comment-card resume-review-comment-card--expanded${
              isActiveCommentMeasured ? "" : " resume-review-comment-card--measuring"
            }`}
            data-review-tone={activeComment.colorIndex}
            id={`resume-review-comment-${activeComment.id}`}
            ref={(element) => setCardRef(activeComment.id, element)}
            style={{ insetBlockStart: `${activeCommentTop ?? 0}px` }}
          >
            <button
              aria-expanded
              className="resume-review-comment-card__toggle"
              type="button"
              onClick={() => onCommentToggle(activeComment.id)}
            >
              <span className="resume-review-comment-card__marker" aria-hidden="true" />
              <span className="resume-review-comment-card__heading">
                <strong>{activeComment.ordinal}. {activeComment.groupLabel}</strong>
              </span>
              <ChevronDown className="resume-review-comment-card__chevron" size={16} aria-hidden="true" />
            </button>
            <p className="resume-review-comment-card__body">{activeComment.text}</p>
          </article>
        ) : comments.length === 0 ? (
          <div className="resume-review-empty">
            <p>No comments yet.</p>
            <span>Run a graded resume analysis.</span>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ResumeReviewDocument({
  comments,
  expandedCommentId,
  onCommentToggle,
  onHighlightClick,
  text
}: {
  comments: ResumeReviewComment[];
  expandedCommentId: string | null;
  onCommentToggle: (commentId: string) => void;
  onHighlightClick: (commentId: string) => void;
  text: string;
}) {
  const segments = useMemo(() => getResumeTextSegments(text, comments), [comments, text]);

  return (
    <ResumeReviewSurface
      comments={comments}
      contentClassName="resume-review-raw-content"
      expandedCommentId={expandedCommentId}
      onCommentToggle={onCommentToggle}
    >
      {(setHighlightRef, setClickedHighlightRef) => (
        <pre className="resume-review-text">
          {segments.map((segment, segmentIndex) => (
            <ResumeReviewTextSegment
              expandedCommentId={expandedCommentId}
              highlightKey={`raw-segment-${segmentIndex}`}
              key={`raw-segment-${segmentIndex}`}
              onHighlightClick={onHighlightClick}
              segment={segment}
              setClickedHighlightRef={setClickedHighlightRef}
              setHighlightRef={setHighlightRef}
            />
          ))}
        </pre>
      )}
    </ResumeReviewSurface>
  );
}

function ResumeFormattedReviewDocument({
  beforeContent,
  comments,
  document,
  expandedCommentId,
  onCommentToggle,
  onHighlightClick,
  text
}: {
  beforeContent?: ReactNode;
  comments: ResumeReviewComment[];
  document: ParsedResumeDocument;
  expandedCommentId: string | null;
  onCommentToggle: (commentId: string) => void;
  onHighlightClick: (commentId: string) => void;
  text: string;
}) {
  const locator = createResumeTextLocator(text);
  const anchoredCommentIds = new Set<string>();

  return (
    <ResumeReviewSurface
      comments={comments}
      contentClassName="resume-review-formatted-content"
      expandedCommentId={expandedCommentId}
      onCommentToggle={onCommentToggle}
    >
      {(setHighlightRef, setClickedHighlightRef) => {
        function renderText(value: string, key: string) {
          const range = locator.locate(value);
          const segments = getResumeTextSegmentsForRange(value, range, comments, anchoredCommentIds);

          return segments.map((segment, segmentIndex) => (
            <ResumeReviewTextSegment
              expandedCommentId={expandedCommentId}
              highlightKey={`${key}-${segmentIndex}`}
              key={`${key}-${segmentIndex}`}
              onHighlightClick={onHighlightClick}
              segment={segment}
              setClickedHighlightRef={setClickedHighlightRef}
              setHighlightRef={setHighlightRef}
            />
          ));
        }

        return (
          <>
            {beforeContent}
            {document.name ? <h1>{renderText(document.name, "name")}</h1> : null}
            {document.headline ? <p className="resume-review-formatted-headline">{renderText(document.headline, "headline")}</p> : null}
            {document.contact ? <p className="resume-review-formatted-contact">{renderText(document.contact, "contact")}</p> : null}

            {document.sections.map((section, sectionIndex) => (
              <section className="resume-review-formatted-section" key={`${section.title}-${sectionIndex}`}>
                <h2>{renderText(section.title, `section-${sectionIndex}`)}</h2>
                <hr />
                {section.blocks.map((block, blockIndex) => {
                  const blockKey = `section-${sectionIndex}-block-${blockIndex}`;

                  if (block.type === "entry") {
                    return (
                      <div className="resume-review-formatted-entry" key={blockKey}>
                        <h3>{renderText(block.title, `${blockKey}-title`)}</h3>
                        {block.subtitle || block.dateRange ? (
                          <h4>
                            {block.subtitle ? renderText(block.subtitle, `${blockKey}-subtitle`) : null}
                            {block.subtitle && block.dateRange ? <span> | </span> : null}
                            {block.dateRange ? renderText(block.dateRange, `${blockKey}-date`) : null}
                          </h4>
                        ) : null}
                        {block.bullets.length > 0 ? (
                          <ul>
                            {block.bullets.map((bullet, bulletIndex) => (
                              <li key={`${blockKey}-bullet-${bulletIndex}`}>
                                {renderText(bullet, `${blockKey}-bullet-${bulletIndex}`)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  }

                  if (block.type === "skill") {
                    return (
                      <p className="resume-review-formatted-skill" key={blockKey}>
                        <strong>{renderText(block.label, `${blockKey}-label`)}:</strong>{" "}
                        {renderText(block.value, `${blockKey}-value`)}
                      </p>
                    );
                  }

                  return <p key={blockKey}>{renderText(block.text, `${blockKey}-paragraph`)}</p>;
                })}
              </section>
            ))}
          </>
        );
      }}
    </ResumeReviewSurface>
  );
}

function ResumeReviewTextSegment({
  expandedCommentId,
  highlightKey,
  onHighlightClick,
  segment,
  setClickedHighlightRef,
  setHighlightRef
}: {
  expandedCommentId: string | null;
  highlightKey: string;
  onHighlightClick: (commentId: string) => void;
  segment: ResumeTextSegment;
  setClickedHighlightRef: SetResumeReviewClickedHighlightRef;
  setHighlightRef: SetResumeReviewHighlightRef;
}) {
  if (segment.comments.length === 0) {
    return <span>{segment.text}</span>;
  }

  const comment = segment.comments.find((candidate) => candidate.id === expandedCommentId) ?? segment.comments[0];
  const isExpanded = comment.id === expandedCommentId;
  const registeredCommentIds = new Set(segment.anchorCommentIds);

  if (isExpanded) {
    registeredCommentIds.add(comment.id);
  }

  return (
    <button
      aria-controls={isExpanded ? `resume-review-comment-${comment.id}` : undefined}
      aria-expanded={isExpanded}
      className={`resume-review-highlight${isExpanded ? " resume-review-highlight--expanded" : ""}`}
      data-review-tone={comment.colorIndex}
      ref={(element) => {
        for (const commentId of registeredCommentIds) {
          setHighlightRef(commentId, highlightKey, element);
        }
      }}
      title={comment.text}
      type="button"
      onClick={(event) => {
        setClickedHighlightRef(comment.id, event.currentTarget);
        onHighlightClick(comment.id);
      }}
    >
      {segment.text}
    </button>
  );
}

function getResumeTextSegments(text: string, comments: ResumeReviewComment[]): ResumeTextSegment[] {
  const normalizedComments = [...comments]
    .map((comment) => ({
      ...comment,
      start: clampResumeTextIndex(comment.start, text),
      end: clampResumeTextIndex(comment.end, text)
    }))
    .filter((comment) => comment.end > comment.start)
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);

  return getResumeTextSegmentsFromLocalComments(text, normalizedComments, new Set<string>());
}

function getResumeTextSegmentsForRange(
  text: string,
  range: ResumeTextRange | null,
  comments: ResumeReviewComment[],
  anchoredCommentIds: Set<string>
): ResumeTextSegment[] {
  if (!range) {
    return [{ anchorCommentIds: [], comments: [], text }];
  }

  const rangeLength = Math.max(1, range.end - range.start);
  const localizedComments = comments
    .filter((comment) => comment.start < range.end && comment.end > range.start)
    .map((comment) => {
      const overlapStart = Math.max(comment.start, range.start);
      const overlapEnd = Math.min(comment.end, range.end);
      const localStart = clampResumeTextIndex(
        Math.floor(((overlapStart - range.start) / rangeLength) * text.length),
        text
      );
      const localEnd = clampResumeTextIndex(
        Math.ceil(((overlapEnd - range.start) / rangeLength) * text.length),
        text
      );

      return {
        ...comment,
        start: localStart,
        end: Math.max(localEnd, Math.min(text.length, localStart + 1))
      };
    })
    .filter((comment) => comment.end > comment.start)
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);

  return getResumeTextSegmentsFromLocalComments(text, localizedComments, anchoredCommentIds);
}

function getResumeTextSegmentsFromLocalComments(
  text: string,
  normalizedComments: ResumeReviewComment[],
  anchoredCommentIds: Set<string>
): ResumeTextSegment[] {
  if (normalizedComments.length === 0) {
    return [{ anchorCommentIds: [], comments: [], text }];
  }

  const breakpoints = Array.from(
    new Set([0, text.length, ...normalizedComments.flatMap((comment) => [comment.start, comment.end])])
  ).sort((firstBreakpoint, secondBreakpoint) => firstBreakpoint - secondBreakpoint);
  const segments: ResumeTextSegment[] = [];

  for (let breakpointIndex = 0; breakpointIndex < breakpoints.length - 1; breakpointIndex += 1) {
    const start = breakpoints[breakpointIndex];
    const end = breakpoints[breakpointIndex + 1];

    if (end <= start) {
      continue;
    }

    const segmentComments = normalizedComments.filter((comment) => comment.start < end && comment.end > start);
    const anchorCommentIds = segmentComments
      .filter((comment) => !anchoredCommentIds.has(comment.id))
      .map((comment) => comment.id);

    for (const commentId of anchorCommentIds) {
      anchoredCommentIds.add(commentId);
    }

    segments.push({
      anchorCommentIds,
      comments: segmentComments,
      text: text.slice(start, end)
    });
  }

  return segments.length > 0 ? segments : [{ anchorCommentIds: [], comments: [], text }];
}

function createResumeTextLocator(text: string) {
  const index = createNormalizedTextIndex(text);
  let cursor = 0;

  return {
    locate(value: string): ResumeTextRange | null {
      const needle = createNormalizedTextIndex(value).normalizedText.trim();

      if (!needle) {
        return null;
      }

      let matchIndex = index.normalizedText.indexOf(needle, cursor);
      if (matchIndex < 0) {
        matchIndex = index.normalizedText.indexOf(needle);
      }

      if (matchIndex < 0) {
        return null;
      }

      const matchEnd = matchIndex + needle.length;
      const rawStart = index.rawIndices[matchIndex] ?? 0;
      const rawEnd = (index.rawIndices[matchEnd - 1] ?? rawStart) + 1;
      cursor = matchEnd;

      return {
        start: rawStart,
        end: rawEnd
      };
    }
  };
}

function createNormalizedTextIndex(text: string): ResumeNormalizedTextIndex {
  const normalizedCharacters: string[] = [];
  const rawIndices: number[] = [];
  let previousWasWhitespace = true;

  for (let index = 0; index < text.length; index += 1) {
    const character = normalizeResumeLocatorCharacter(text[index]);

    if (!character) {
      continue;
    }

    if (/\s/.test(character)) {
      if (previousWasWhitespace) {
        continue;
      }

      normalizedCharacters.push(" ");
      rawIndices.push(index);
      previousWasWhitespace = true;
      continue;
    }

    normalizedCharacters.push(character.toLowerCase());
    rawIndices.push(index);
    previousWasWhitespace = false;
  }

  if (normalizedCharacters.at(-1) === " ") {
    normalizedCharacters.pop();
    rawIndices.pop();
  }

  return {
    normalizedText: normalizedCharacters.join(""),
    rawIndices
  };
}

function normalizeResumeLocatorCharacter(character: string) {
  if (/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/.test(character)) {
    return "-";
  }

  if (character === "\u00a0") {
    return " ";
  }

  return character;
}

function clampResumeTextIndex(index: number, text: string) {
  return Math.max(0, Math.min(index, text.length));
}
