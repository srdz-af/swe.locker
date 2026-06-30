import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button, FileUploaderButton, Loading, Modal, Tab, TabList, Tabs, Tile } from "@carbon/react";
import { Help, TrashCan } from "@carbon/icons-react";
import { LineChart, RadarChart, ScaleTypes } from "@carbon/charts-react";
import type { ChartTabularData, LineChartOptions, RadarChartOptions } from "@carbon/charts-react";
import { TextModePanel, type TextMode } from "../../components/TextModePanel";
import { getResumeGradeColor, resumeAcceptedFileTypes } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatDate } from "../../utils/format";
import {
  compareResumeRunsByCreatedAtAsc,
  getResumeRunIdFromChartDatum,
  getResumeRunIdFromChartTarget
} from "./resumeRuns";
import { parseResumeMarkdownModel, renderResumeMarkdown } from "./resumeMarkdown";

export const ResumeGraderPanel = memo(function ResumeGraderPanel({
  isUploadPending,
  onDeleteRun,
  onUpload,
  runs,
  themeMode
}: {
  isUploadPending: boolean;
  onDeleteRun: (run: ResumeGraderRun) => Promise<void>;
  onUpload: (file: File) => void;
  runs: ResumeGraderRun[];
  themeMode: ThemeMode;
}) {
  const latestRun = runs[0] ?? null;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => latestRun?.id ?? null);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [selectedCommentGroupIndex, setSelectedCommentGroupIndex] = useState(0);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
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
  const safeSelectedCommentGroupIndex =
    selectedCommentGroupIndex < resumeCommentGroups.length ? selectedCommentGroupIndex : 0;
  const selectedCommentGroup = resumeCommentGroups[safeSelectedCommentGroupIndex] ?? null;
  const resumeMarkdownDocument = useMemo(
    () => (selectedRun ? parseResumeMarkdownModel(selectedRun.parsedText) : null),
    [selectedRun?.parsedText]
  );
  const resumeFormattedMarkdown = useMemo(
    () => (resumeMarkdownDocument ? renderResumeMarkdown(resumeMarkdownDocument) : ""),
    [resumeMarkdownDocument]
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
    setSelectedCommentGroupIndex(0);
    setActiveCommentId(null);
    setResumeTextViewMode("preview");
  }, [selectedRun?.id]);

  useEffect(() => {
    const nextGroup = resumeCommentGroups[safeSelectedCommentGroupIndex] ?? null;
    setActiveCommentId((currentCommentId) => {
      if (currentCommentId && nextGroup?.comments.some((comment) => comment.id === currentCommentId)) {
        return currentCommentId;
      }

      return nextGroup?.comments[0]?.id ?? null;
    });
  }, [resumeCommentGroups, safeSelectedCommentGroupIndex]);

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
                <Button kind="ghost" size="sm" type="button" onClick={() => setIsCommentsModalOpen(true)}>
                  View comments
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

      <Modal
        className="resume-comments-modal"
        modalHeading="Comments"
        open={isCommentsModalOpen}
        passiveModal
        size="lg"
        onRequestClose={() => setIsCommentsModalOpen(false)}
      >
        {selectedRun ? (
          <div className="resume-comments-layout">
            <TextModePanel
              ariaLabel="Original resume"
              actionsClassName="resume-comments-panel-actions"
              afterHeader={
                <div className="resume-comments-tabs">
                  <Tabs
                    selectedIndex={safeSelectedCommentGroupIndex}
                    onChange={({ selectedIndex }) => {
                      setSelectedCommentGroupIndex(selectedIndex);
                      setActiveCommentId(resumeCommentGroups[selectedIndex]?.comments[0]?.id ?? null);
                    }}
                  >
                    <TabList aria-label="Resume comment categories" size="sm">
                      {resumeCommentGroups.map((group) => (
                        <Tab key={group.id}>{group.label}</Tab>
                      ))}
                    </TabList>
                  </Tabs>
                </div>
              }
              className={`resume-comments-original-panel${
                resumeCommentGroups.length > 0 ? " resume-comments-original-panel--with-tabs" : ""
              }`}
              footer={<span className="resume-comments-character-count">{selectedRun.parsedText.length} chars</span>}
              headerClassName="resume-comments-panel-header"
              id={`resume-text-${selectedRun.id}`}
              mode={resumeTextViewMode}
              onModeChange={setResumeTextViewMode}
              previewBefore={
                hasResumeReadabilityWarning ? (
                  <div className="resume-ats-warning">
                    <strong>ATS readability warning</strong>
                    <span>Could not confidently recover resume structure from the extracted text.</span>
                  </div>
                ) : null
              }
              previewBodyClassName="resume-formatted-text"
              previewLabel="Formatted"
              previewMarkdown={resumeFormattedMarkdown}
              rawBodyClassName="resume-original-text-body"
              rawContent={
                <ResumeOriginalText
                  activeCommentId={activeCommentId}
                  comments={selectedCommentGroup?.comments ?? []}
                  text={selectedRun.parsedText}
                />
              }
              rawLabel="Raw"
              scrollKey={`${selectedRun.id}-${safeSelectedCommentGroupIndex}`}
              title={selectedRun.sourceName}
              tabsAriaLabel="Resume text view"
              tabsClassName="resume-text-view-tabs"
              tabsHelp={
                <span
                  className="resume-text-view-help"
                  tabIndex={0}
                  aria-label="Only extracted raw text is stored. You can see if ATS readability problems could arise if something looks wrong on the formatted text, and exactly why on the raw"
                >
                  <Help size={16} />
                  <span className="resume-text-view-help-tooltip" role="tooltip">
                    Only extracted raw text is stored. You can see if ATS readability problems could arise if something
                    looks wrong on the formatted text, and exactly why on the raw.
                  </span>
                </span>
              }
            />

            <section className="resume-comments-detail-panel" aria-label="Resume grader comments">
              {selectedCommentGroup ? (
                <div className="resume-comments-tab-panel">
                  <div className="resume-comments-tab-summary">
                    <strong>{selectedCommentGroup.scoreLabel}</strong>
                    <span>
                      {selectedCommentGroup.comments.length}{" "}
                      {selectedCommentGroup.comments.length === 1 ? "comment" : "comments"}
                    </span>
                  </div>
                  {selectedCommentGroup.comments.length > 0 ? (
                    <div className="resume-comment-list">
                      {selectedCommentGroup.comments.map((comment) => (
                        <button
                          className={`resume-comment-card${
                            comment.id === activeCommentId ? " resume-comment-card--active" : ""
                          }`}
                          key={comment.id}
                          type="button"
                          onClick={() => {
                            setActiveCommentId(comment.id);
                            setResumeTextViewMode("raw");
                          }}
                          onFocus={() => setActiveCommentId(comment.id)}
                          onMouseEnter={() => setActiveCommentId(comment.id)}
                        >
                          <span className="resume-comment-card__text">{comment.text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="posting-empty resume-comments-empty-tab">
                      <p>No comments yet.</p>
                      <span>This category has no generated comments.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="posting-empty">
                  <p>No comments yet.</p>
                  <span>Run a graded resume analysis.</span>
                </div>
              )}
            </section>
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

type ResumeCommentGroup = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeTextComment[];
};

type ResumeTextSegment = {
  comment: ResumeTextComment | null;
  text: string;
};

function hasResumeMarkdownReadabilityWarning(warnings: string[]) {
  return warnings.some((warning) =>
    ["garbled_text", "low_structure_confidence", "missing_sections", "many_short_lines"].includes(warning)
  );
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

function ResumeOriginalText({
  activeCommentId,
  comments,
  text
}: {
  activeCommentId: string | null;
  comments: ResumeTextComment[];
  text: string;
}) {
  const segments = useMemo(() => getResumeTextSegments(text, comments), [comments, text]);

  return (
    <pre className="resume-original-text">
      {segments.map((segment, segmentIndex) =>
        segment.comment ? (
          <mark
            className={`resume-original-highlight${
              segment.comment.id === activeCommentId ? " resume-original-highlight--active" : ""
            }`}
            key={`${segment.comment.id}-${segmentIndex}`}
            title={segment.comment.text}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`text-${segmentIndex}`}>{segment.text}</span>
        )
      )}
    </pre>
  );
}

function getResumeTextSegments(text: string, comments: ResumeTextComment[]): ResumeTextSegment[] {
  const segments: ResumeTextSegment[] = [];
  const sortedComments = [...comments]
    .map((comment) => ({
      ...comment,
      start: clampResumeTextIndex(comment.start, text),
      end: clampResumeTextIndex(comment.end, text)
    }))
    .filter((comment) => comment.end > comment.start)
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);
  let cursor = 0;

  for (const comment of sortedComments) {
    if (comment.start < cursor) {
      continue;
    }

    if (comment.start > cursor) {
      segments.push({
        comment: null,
        text: text.slice(cursor, comment.start)
      });
    }

    segments.push({
      comment,
      text: text.slice(comment.start, comment.end)
    });
    cursor = comment.end;
  }

  if (cursor < text.length) {
    segments.push({
      comment: null,
      text: text.slice(cursor)
    });
  }

  return segments.length > 0 ? segments : [{ comment: null, text }];
}

function clampResumeTextIndex(index: number, text: string) {
  return Math.max(0, Math.min(index, text.length));
}
