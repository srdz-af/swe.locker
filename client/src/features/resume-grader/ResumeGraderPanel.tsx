import { memo, type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, FileUploaderButton, Loading, Modal, Tab, TabList, TabPanel, TabPanels, Tabs, Tile } from "@carbon/react";
import { Help, TrashCan } from "@carbon/icons-react";
import { HeatmapChart, RadarChart, ScaleTypes } from "@carbon/charts-react";
import type { ChartTabularData, HeatmapChartOptions, RadarChartOptions } from "@carbon/charts-react";
import type { ApplicationDto, ResumeGraderBulletGradeDto, ResumeGraderItemDto } from "../../../../shared/src/index";
import { TextModePanel, type TextMode } from "../../components/TextModePanel";
import { getResumeGradeColor, resumeAcceptedFileTypes } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatDate, getApplicationStatusLabel } from "../../utils/format";
import { parseResumeMarkdownModel } from "./resumeMarkdown";
import type { ParsedResumeDocument } from "./resumeMarkdown";

const resumeHeatmapGradeColors = Array.from({ length: 101 }, (_, grade) => getResumeGradeColor(grade));

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
  const [hoveredReviewBulletIndex, setHoveredReviewBulletIndex] = useState<number | null>(null);
  const [resumeTextViewMode, setResumeTextViewMode] = useState<TextMode>("preview");
  const [reviewScrollRequest, setReviewScrollRequest] = useState<ResumeReviewScrollRequest | null>(null);
  const [selectedReviewBulletIndex, setSelectedReviewBulletIndex] = useState<number | null>(null);
  const heatmapElementRef = useRef<HTMLDivElement | null>(null);
  const previousLatestRunIdRef = useRef<string | null>(latestRun?.id ?? null);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? latestRun,
    [latestRun, runs, selectedRunId]
  );
  const selectedRunBullets = useMemo(() => (selectedRun ? getResumeRunBullets(selectedRun) : []), [selectedRun]);
  const selectedGrade = selectedRun?.grade ?? null;
  const selectedTier = selectedRun?.tier ?? null;
  const selectedGradeColor = useMemo(() => getResumeGradeColor(selectedGrade), [selectedGrade]);
  const hasSelectedGrade = selectedGrade !== null && selectedTier !== null;
  const selectedRunComments = selectedRun?.verdict ?? "Raw text extracted. Grading is not implemented yet.";
  const resumeCommentMetadata = useMemo(
    () => (selectedRun ? getResumeCommentMetadata(selectedRun) : new Map<string, ResumeCommentMetadata>()),
    [selectedRun]
  );
  const resumeCommentGroups = useMemo(() => (selectedRun ? getResumeCommentGroups(selectedRun) : []), [selectedRun]);
  const resumeReviewComments = useMemo(
    () => getResumeReviewComments(resumeCommentGroups, resumeCommentMetadata),
    [resumeCommentGroups, resumeCommentMetadata]
  );
  const selectedRunBulletRanges = useMemo(
    () =>
      selectedRunBullets.map((bullet) => ({
        bulletIndex: bullet.bulletIndex,
        end: bullet.range.end,
        start: getResumeBulletDisplayStart(selectedRun?.parsedText ?? "", bullet.range.start)
      })),
    [selectedRun?.parsedText, selectedRunBullets]
  );
  const expandedResumeReviewComment = useMemo(
    () => (expandedCommentId ? resumeReviewComments.find((comment) => comment.id === expandedCommentId) ?? null : null),
    [expandedCommentId, resumeReviewComments]
  );
  const priorityResumeReviewComments = useMemo(
    () => getPriorityResumeReviewComments(resumeReviewComments),
    [resumeReviewComments]
  );
  const selectedBulletReviewComments = useMemo(
    () =>
      selectedReviewBulletIndex === null
        ? []
        : getResumeReviewCommentsForBullet(resumeReviewComments, selectedReviewBulletIndex),
    [resumeReviewComments, selectedReviewBulletIndex]
  );
  const hoveredBulletReviewComments = useMemo(
    () =>
      hoveredReviewBulletIndex === null
        ? []
        : getResumeReviewCommentsForBullet(resumeReviewComments, hoveredReviewBulletIndex).map((comment) => ({
            ...comment,
            isHoverPreview: true
          })),
    [hoveredReviewBulletIndex, resumeReviewComments]
  );
  const visibleResumeReviewCards = useMemo(() => {
    if (expandedResumeReviewComment) {
      return [expandedResumeReviewComment];
    }

    return selectedReviewBulletIndex === null ? priorityResumeReviewComments : selectedBulletReviewComments;
  }, [expandedResumeReviewComment, priorityResumeReviewComments, selectedBulletReviewComments, selectedReviewBulletIndex]);
  const visibleResumeReviewHighlights = useMemo(
    () => {
      const visibleComments = expandedResumeReviewComment
        ? [expandedResumeReviewComment]
        : selectedReviewBulletIndex === null
          ? priorityResumeReviewComments
          : selectedBulletReviewComments;

      return mergeResumeReviewComments(visibleComments, hoveredBulletReviewComments);
    },
    [
      expandedResumeReviewComment,
      hoveredBulletReviewComments,
      priorityResumeReviewComments,
      selectedBulletReviewComments,
      selectedReviewBulletIndex
    ]
  );
  const selectedRunApplications = useMemo(
    () => getAssociatedResumeApplications(applications, selectedRun?.id ?? null),
    [applications, selectedRun?.id]
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
    setHoveredReviewBulletIndex(null);
    setReviewScrollRequest(null);
    setResumeTextViewMode("preview");
    setSelectedReviewBulletIndex(null);
  }, [selectedRun?.id]);

  useEffect(() => {
    setExpandedCommentId((currentCommentId) => {
      if (currentCommentId && resumeReviewComments.some((comment) => comment.id === currentCommentId)) {
        return currentCommentId;
      }

      return null;
    });
  }, [resumeReviewComments]);

  function handleResumeCommentActivate(commentId: string) {
    setHoveredReviewBulletIndex(null);
    setSelectedReviewBulletIndex(null);
    setExpandedCommentId(commentId);
  }

  function handleResumeBulletClick(bulletIndex: number) {
    setExpandedCommentId(null);
    setHoveredReviewBulletIndex(null);
    setSelectedReviewBulletIndex(bulletIndex);
  }

  function handleResumeBulletHover(bulletIndex: number | null) {
    setHoveredReviewBulletIndex(bulletIndex);
  }

  const selectedRunHeatmapData = useMemo<ChartTabularData>(
    () =>
      selectedRun && selectedRunBullets.length > 0
        ? selectedRunBullets.flatMap((bullet) =>
            bullet.metrics.map((metric) => ({
              group: metric.label,
              bullet: String(bullet.bulletIndex),
              bulletIndex: bullet.bulletIndex,
              bulletGrade: bullet.grade,
              bulletText: getResumeRangeText(selectedRun.parsedText, bullet.range),
              metric: metric.label,
              value: metric.value
            }))
          )
        : [],
    [selectedRun, selectedRunBullets]
  );
  const heatmapChartKey = selectedRun
    ? `${selectedRun.id}-${selectedRunBullets.length}-${selectedRunHeatmapData.length}-${themeMode}`
    : "empty";

  useEffect(() => {
    const heatmapElement = heatmapElementRef.current;
    if (!heatmapElement) {
      return undefined;
    }

    const handleHeatmapClick = (event: MouseEvent) => {
      const bulletIndex = getResumeHeatmapBulletIndexFromTarget(event.target, heatmapElement);
      if (bulletIndex === null) {
        return;
      }

      setExpandedCommentId(null);
      setSelectedReviewBulletIndex(bulletIndex);
      setReviewScrollRequest((currentRequest) => ({
        bulletIndex,
        requestId: (currentRequest?.requestId ?? 0) + 1
      }));
      setResumeTextViewMode("preview");
      setIsCommentsModalOpen(true);
    };

    heatmapElement.addEventListener("click", handleHeatmapClick);

    return () => {
      heatmapElement.removeEventListener("click", handleHeatmapClick);
    };
  }, [selectedRunHeatmapData]);

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
  const heatmapOptions = useMemo<HeatmapChartOptions>(
    () => ({
      accessibility: {
        svgAriaLabel: "Resume bullet metric heatmap"
      },
      axes: {
        bottom: {
          mapsTo: "bullet",
          scaleType: ScaleTypes.LABELS,
          title: "Bullet"
        },
        left: {
          mapsTo: "metric",
          scaleType: ScaleTypes.LABELS,
          title: "Metric"
        }
      },
      color: {
        gradient: {
          colors: resumeHeatmapGradeColors
        }
      },
      data: {
        groupMapsTo: "group"
      },
      heatmap: {
        colorDomain: {
          min: 0,
          max: 100
        },
        colorLegend: {
          title: "Score"
        }
      },
      height: "100%",
      theme: themeMode === "dark" ? "g100" : "white",
      toolbar: {
        enabled: false
      },
      tooltip: {
        totalLabel: "Score",
        valueFormatter: (value, label) => (label === "Score" ? `${value}/100` : String(value))
      }
    }),
    [themeMode]
  );

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
                    setExpandedCommentId(null);
                    setResumeTextViewMode("preview");
                    setSelectedReviewBulletIndex(null);
                    setIsCommentsModalOpen(true);
                  }}
                >
                  Review
                </Button>
              </div>

              <div className="resume-heatmap-panel">
                <h3>Bullet heatmap</h3>
                {selectedRunHeatmapData.length > 0 ? (
                  <div className="resume-bullet-heatmap" ref={heatmapElementRef}>
                    <HeatmapChart key={heatmapChartKey} data={selectedRunHeatmapData} options={heatmapOptions} />
                  </div>
                ) : (
                  <div className="posting-empty">
                    <p>No bullet grades yet.</p>
                    <span>Run a new resume analysis.</span>
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
                            bulletRanges={selectedRunBulletRanges}
                            commentCards={visibleResumeReviewCards}
                            document={resumeMarkdownDocument}
                            expandedCommentId={expandedCommentId}
                            highlightComments={visibleResumeReviewHighlights}
                            onBulletClick={handleResumeBulletClick}
                            onBulletHover={handleResumeBulletHover}
                            onHighlightClick={handleResumeCommentActivate}
                            scrollRequest={reviewScrollRequest}
                            text={selectedRun.parsedText}
                          />
                        ) : null
                      }
                      previewLabel="Formatted"
                      rawBodyClassName="resume-review-body"
                      rawContent={
                        resumeTextViewMode === "raw" ? (
                          <ResumeReviewDocument
                            bulletRanges={selectedRunBulletRanges}
                            commentCards={visibleResumeReviewCards}
                            expandedCommentId={expandedCommentId}
                            highlightComments={visibleResumeReviewHighlights}
                            onBulletClick={handleResumeBulletClick}
                            onBulletHover={handleResumeBulletHover}
                            onHighlightClick={handleResumeCommentActivate}
                            scrollRequest={reviewScrollRequest}
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
  bulletIndex: number | null;
  colorIndex: number;
  groupId: string;
  groupLabel: string;
  isHoverPreview?: boolean;
  metricValue: number | null;
  ordinal: number;
};

type ResumeCommentGroup = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeTextComment[];
};

type ResumeTextSegment = {
  anchorCommentIds: string[];
  bulletIndex: number | null;
  comments: ResumeReviewComment[];
  text: string;
};

type ResumeTextRange = {
  start: number;
  end: number;
};

type ResumeReviewBulletRange = ResumeTextRange & {
  bulletIndex: number;
};

type ResumeRunBulletGrade = ResumeGraderBulletGradeDto & {
  item: ResumeGraderItemDto;
};

type ResumeReviewLayoutState = {
  minBlockSize: number;
  positions: Record<string, number>;
};

type ResumeReviewScrollRequest = {
  bulletIndex: number;
  requestId: number;
};

type ResumeCommentMetadata = {
  bulletIndex: number;
  metricValue: number;
};

type SetResumeReviewHighlightRef = (commentId: string, refKey: string, element: HTMLElement | null) => void;
type SetResumeReviewClickedHighlightRef = (commentId: string, element: HTMLElement) => void;

type ResumeNormalizedTextIndex = {
  normalizedText: string;
  rawIndices: number[];
};

const resumeReviewColorCount = 8;
const resumeReviewDefaultCommentCount = 5;

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

function getResumeCommentMetadata(run: ResumeGraderRun) {
  const metadata = new Map<string, ResumeCommentMetadata>();

  for (const bullet of getResumeRunBullets(run)) {
    for (const metric of bullet.metrics) {
      for (const comment of metric.comments) {
        metadata.set(comment.id, {
          bulletIndex: bullet.bulletIndex,
          metricValue: metric.value
        });
      }
    }
  }

  return metadata;
}

function getResumeRunBullets(run: ResumeGraderRun): ResumeRunBulletGrade[] {
  return run.resumeItems.flatMap((item) =>
    item.bullets.map((bullet) => ({
      ...bullet,
      item
    }))
  );
}

function getResumeRangeText(text: string, range: ResumeTextRange) {
  return text.slice(range.start, range.end).replace(/\s+/g, " ").trim();
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

function getResumeReviewComments(
  groups: ResumeCommentGroup[],
  metadataByCommentId: Map<string, ResumeCommentMetadata>
): ResumeReviewComment[] {
  let ordinal = 0;

  return groups
    .flatMap((group, groupIndex) =>
      group.comments.map((comment) => {
        ordinal += 1;
        const metadata = metadataByCommentId.get(comment.id) ?? null;

        return {
          ...comment,
          bulletIndex: metadata?.bulletIndex ?? null,
          colorIndex: groupIndex % resumeReviewColorCount,
          groupId: group.id,
          groupLabel: group.label,
          metricValue: metadata?.metricValue ?? null,
          ordinal
        };
      })
    )
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);
}

function getPriorityResumeReviewComments(comments: ResumeReviewComment[]) {
  const priorityComments = [...comments]
    .filter((comment) => comment.metricValue !== null)
    .sort(
      (firstComment, secondComment) =>
        (firstComment.metricValue ?? Number.POSITIVE_INFINITY) -
          (secondComment.metricValue ?? Number.POSITIVE_INFINITY) ||
        firstComment.start - secondComment.start ||
        firstComment.ordinal - secondComment.ordinal
    )
    .slice(0, resumeReviewDefaultCommentCount);

  return (priorityComments.length > 0 ? priorityComments : comments.slice(0, resumeReviewDefaultCommentCount)).sort(
    (firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.ordinal - secondComment.ordinal
  );
}

function getResumeReviewCommentsForBullet(comments: ResumeReviewComment[], bulletIndex: number) {
  return comments
    .filter((comment) => comment.bulletIndex === bulletIndex)
    .sort(
      (firstComment, secondComment) =>
        firstComment.start - secondComment.start ||
        firstComment.end - secondComment.end ||
        firstComment.ordinal - secondComment.ordinal
    );
}

function mergeResumeReviewComments(...commentGroups: ResumeReviewComment[][]) {
  const commentsById = new Map<string, ResumeReviewComment>();

  for (const comment of commentGroups.flat()) {
    commentsById.set(comment.id, comment);
  }

  return Array.from(commentsById.values()).sort(
    (firstComment, secondComment) =>
      firstComment.start - secondComment.start ||
      firstComment.end - secondComment.end ||
      firstComment.ordinal - secondComment.ordinal
  );
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

function getResumeHeatmapBulletIndexFromTarget(target: EventTarget | null, container: HTMLElement) {
  let element = target instanceof Element ? target : null;

  while (element && element !== container) {
    const bulletIndex = getResumeHeatmapBulletIndexFromDatum((element as Element & { __data__?: unknown }).__data__);
    if (bulletIndex !== null) {
      return bulletIndex;
    }

    element = element.parentElement;
  }

  return null;
}

function getResumeHeatmapBulletIndexFromDatum(value: unknown): number | null {
  if (typeof value === "string" || typeof value === "number") {
    const parsedValue = Number.parseInt(String(value), 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const datum = value as { bullet?: unknown; bulletIndex?: unknown; data?: unknown; datum?: unknown };
  if (typeof datum.bulletIndex === "number" && Number.isInteger(datum.bulletIndex) && datum.bulletIndex > 0) {
    return datum.bulletIndex;
  }

  if (typeof datum.bullet === "string" || typeof datum.bullet === "number") {
    const parsedBullet = Number.parseInt(String(datum.bullet), 10);
    if (Number.isInteger(parsedBullet) && parsedBullet > 0) {
      return parsedBullet;
    }
  }

  return getResumeHeatmapBulletIndexFromDatum(datum.datum) ?? getResumeHeatmapBulletIndexFromDatum(datum.data);
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

function ResumeReviewSurface({
  children,
  comments,
  contentClassName,
  expandedCommentId,
  scrollRequest
}: {
  children: (
    setHighlightRef: SetResumeReviewHighlightRef,
    setClickedHighlightRef: SetResumeReviewClickedHighlightRef
  ) => ReactNode;
  comments: ResumeReviewComment[];
  contentClassName: string;
  expandedCommentId: string | null;
  scrollRequest: ResumeReviewScrollRequest | null;
}) {
  const documentRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const marginRef = useRef<HTMLElement | null>(null);
  const highlightRefs = useRef(new Map<string, Map<string, HTMLElement>>());
  const clickedHighlightRef = useRef<{ commentId: string; element: HTMLElement } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [highlightSelectionVersion, setHighlightSelectionVersion] = useState(0);
  const [layout, setLayout] = useState<ResumeReviewLayoutState>({
    minBlockSize: 0,
    positions: {}
  });
  const activeComment = comments.find((comment) => comment.id === expandedCommentId) ?? null;

  function getCommentHighlightElement(commentId: string, contentElement: HTMLElement) {
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
      const commentGap = 8;

      for (const comment of comments) {
        const highlightElement = getCommentHighlightElement(comment.id, contentElement);
        const cardElement = cardRefs.current.get(comment.id);
        const highlightTop = highlightElement
          ? Math.max(0, highlightElement.getBoundingClientRect().top - marginTop)
          : commentEnd;
        const cardHeight = cardElement?.offsetHeight ?? 48;
        const commentTop = Math.max(highlightTop, commentEnd);

        nextPositions[comment.id] = commentTop;
        commentEnd = commentTop + cardHeight + commentGap;
      }

      const nextMinBlockSize = Math.max(contentElement.scrollHeight, commentEnd);

      setLayout((currentLayout) => {
        const currentPositionKeys = Object.keys(currentLayout.positions);
        const nextPositionKeys = Object.keys(nextPositions);
        const hasSamePositions =
          currentPositionKeys.length === nextPositionKeys.length &&
          nextPositionKeys.every((key) => currentLayout.positions[key] === nextPositions[key]);

        if (currentLayout.minBlockSize === nextMinBlockSize && hasSamePositions) {
          return currentLayout;
        }

        return {
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
  }, [comments, highlightSelectionVersion]);

  useLayoutEffect(() => {
    if (!scrollRequest || typeof window === "undefined") {
      return undefined;
    }

    const requestedBulletIndex = scrollRequest.bulletIndex;
    let frameId: number | null = null;
    let attempts = 0;

    function requestNextFrame(callback: () => void) {
      frameId = window.requestAnimationFrame(callback);
    }

    function scrollToRequestedBullet() {
      const documentElement = documentRef.current;
      if (!documentElement) {
        return;
      }

      const targetElement = documentElement.querySelector<HTMLElement>(
        `[data-resume-bullet-index="${requestedBulletIndex}"]`
      );
      const scrollElement = getResumeReviewScrollElement(documentElement);

      if (targetElement && scrollElement) {
        const scrollRect = scrollElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const nextScrollTop = scrollElement.scrollTop + targetRect.top - scrollRect.top - 24;

        scrollElement.scrollTo({
          top: Math.max(0, nextScrollTop),
          behavior: "auto"
        });
        return;
      }

      attempts += 1;
      if (attempts < 4) {
        requestNextFrame(scrollToRequestedBullet);
      }
    }

    requestNextFrame(() => requestNextFrame(scrollToRequestedBullet));

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [scrollRequest?.bulletIndex, scrollRequest?.requestId]);

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
        {comments.length > 0 ? (
          comments.map((comment) => {
            const commentTop = layout.positions[comment.id];
            const isExpanded = comment.id === activeComment?.id;

            return (
              <article
                className={`resume-review-comment-card${isExpanded ? " resume-review-comment-card--expanded" : ""}${
                  commentTop === undefined ? " resume-review-comment-card--measuring" : ""
                }`}
                data-review-tone={comment.colorIndex}
                id={`resume-review-comment-${comment.id}`}
                key={comment.id}
                ref={(element) => setCardRef(comment.id, element)}
                style={{ insetBlockStart: `${commentTop ?? 0}px` }}
              >
                <div className="resume-review-comment-card__header">
                  <span className="resume-review-comment-card__marker" aria-hidden="true" />
                  <span className="resume-review-comment-card__heading">
                    <strong>{comment.groupLabel}</strong>
                  </span>
                  {comment.metricValue !== null ? (
                    <span className="resume-review-comment-card__score">{comment.metricValue}</span>
                  ) : null}
                </div>
                <p className="resume-review-comment-card__body">{comment.text}</p>
              </article>
            );
          })
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

function getResumeReviewScrollElement(element: HTMLElement) {
  return element.closest<HTMLElement>(".text-mode-panel__body");
}

function ResumeReviewDocument({
  bulletRanges,
  commentCards,
  expandedCommentId,
  highlightComments,
  onBulletClick,
  onBulletHover,
  onHighlightClick,
  scrollRequest,
  text
}: {
  bulletRanges: ResumeReviewBulletRange[];
  commentCards: ResumeReviewComment[];
  expandedCommentId: string | null;
  highlightComments: ResumeReviewComment[];
  onBulletClick: (bulletIndex: number) => void;
  onBulletHover: (bulletIndex: number | null) => void;
  onHighlightClick: (commentId: string) => void;
  scrollRequest: ResumeReviewScrollRequest | null;
  text: string;
}) {
  const segments = useMemo(
    () => getResumeTextSegments(text, highlightComments, bulletRanges),
    [bulletRanges, highlightComments, text]
  );

  return (
    <ResumeReviewSurface
      comments={commentCards}
      contentClassName="resume-review-raw-content"
      expandedCommentId={expandedCommentId}
      scrollRequest={scrollRequest}
    >
      {(setHighlightRef, setClickedHighlightRef) => (
        <pre className="resume-review-text">
          {segments.map((segment, segmentIndex) => (
            <ResumeReviewTextSegment
              expandedCommentId={expandedCommentId}
              highlightKey={`raw-segment-${segmentIndex}`}
              key={`raw-segment-${segmentIndex}`}
              onBulletClick={onBulletClick}
              onBulletHover={onBulletHover}
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
  bulletRanges,
  commentCards,
  document,
  expandedCommentId,
  highlightComments,
  onBulletClick,
  onBulletHover,
  onHighlightClick,
  scrollRequest,
  text
}: {
  beforeContent?: ReactNode;
  bulletRanges: ResumeReviewBulletRange[];
  commentCards: ResumeReviewComment[];
  document: ParsedResumeDocument;
  expandedCommentId: string | null;
  highlightComments: ResumeReviewComment[];
  onBulletClick: (bulletIndex: number) => void;
  onBulletHover: (bulletIndex: number | null) => void;
  onHighlightClick: (commentId: string) => void;
  scrollRequest: ResumeReviewScrollRequest | null;
  text: string;
}) {
  const locator = createResumeTextLocator(text);
  const anchoredCommentIds = new Set<string>();

  return (
    <ResumeReviewSurface
      comments={commentCards}
      contentClassName="resume-review-formatted-content"
      expandedCommentId={expandedCommentId}
      scrollRequest={scrollRequest}
    >
      {(setHighlightRef, setClickedHighlightRef) => {
        function getRenderedText(value: string, key: string) {
          const range = locator.locate(value);
          const segments = getResumeTextSegmentsForRange(value, range, highlightComments, anchoredCommentIds);

          return {
            nodes: renderReviewTextSegments({
              expandedCommentId,
              keyPrefix: key,
              onBulletClick,
              onBulletHover,
              onHighlightClick,
              segments,
              setClickedHighlightRef,
              setHighlightRef
            }),
            range
          };
        }

        function renderText(value: string, key: string) {
          return getRenderedText(value, key).nodes;
        }

        function getRenderedBullet(value: string, key: string) {
          const range = locator.locate(value);
          const bulletIndex = getResumeBulletIndexForRange(range, bulletRanges);
          const segments = getResumeTextSegmentsForRange(value, range, highlightComments, anchoredCommentIds).map((segment) => ({
            ...segment,
            bulletIndex
          }));

          return {
            bulletIndex,
            nodes: renderReviewTextSegments({
              expandedCommentId,
              isBulletHoverManagedByParent: bulletIndex !== null,
              keyPrefix: key,
              onBulletClick,
              onBulletHover,
              onHighlightClick,
              segments,
              setClickedHighlightRef,
              setHighlightRef
            })
          };
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
                            {block.bullets.map((bullet, bulletIndex) => {
                              const renderedBullet = getRenderedBullet(bullet, `${blockKey}-bullet-${bulletIndex}`);

                              return (
                                <li
                                  className={
                                    renderedBullet.bulletIndex === null ? undefined : "resume-review-formatted-bullet"
                                  }
                                  data-resume-bullet-index={renderedBullet.bulletIndex ?? undefined}
                                  key={`${blockKey}-bullet-${bulletIndex}`}
                                  onClickCapture={(event) => {
                                    if (renderedBullet.bulletIndex !== null) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onBulletClick(renderedBullet.bulletIndex);
                                    }
                                  }}
                                  onMouseEnter={() => onBulletHover(renderedBullet.bulletIndex)}
                                  onMouseLeave={() => onBulletHover(null)}
                                >
                                  {renderedBullet.nodes}
                                </li>
                              );
                            })}
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

function renderReviewTextSegments({
  expandedCommentId,
  isBulletHoverManagedByParent = false,
  keyPrefix,
  onBulletClick,
  onBulletHover,
  onHighlightClick,
  segments,
  setClickedHighlightRef,
  setHighlightRef
}: {
  expandedCommentId: string | null;
  isBulletHoverManagedByParent?: boolean;
  keyPrefix: string;
  onBulletClick: (bulletIndex: number) => void;
  onBulletHover: (bulletIndex: number | null) => void;
  onHighlightClick: (commentId: string) => void;
  segments: ResumeTextSegment[];
  setClickedHighlightRef: SetResumeReviewClickedHighlightRef;
  setHighlightRef: SetResumeReviewHighlightRef;
}) {
  return segments.map((segment, segmentIndex) => (
    <ResumeReviewTextSegment
      expandedCommentId={expandedCommentId}
      highlightKey={`${keyPrefix}-${segmentIndex}`}
      isBulletHoverManagedByParent={isBulletHoverManagedByParent}
      key={`${keyPrefix}-${segmentIndex}`}
      onBulletClick={onBulletClick}
      onBulletHover={onBulletHover}
      onHighlightClick={onHighlightClick}
      segment={segment}
      setClickedHighlightRef={setClickedHighlightRef}
      setHighlightRef={setHighlightRef}
    />
  ));
}

function ResumeReviewTextSegment({
  expandedCommentId,
  highlightKey,
  isBulletHoverManagedByParent = false,
  onBulletClick,
  onBulletHover,
  onHighlightClick,
  segment,
  setClickedHighlightRef,
  setHighlightRef
}: {
  expandedCommentId: string | null;
  highlightKey: string;
  isBulletHoverManagedByParent?: boolean;
  onBulletClick: (bulletIndex: number) => void;
  onBulletHover: (bulletIndex: number | null) => void;
  onHighlightClick: (commentId: string) => void;
  segment: ResumeTextSegment;
  setClickedHighlightRef: SetResumeReviewClickedHighlightRef;
  setHighlightRef: SetResumeReviewHighlightRef;
}) {
  if (segment.comments.length === 0) {
    if (segment.bulletIndex === null) {
      return <span>{segment.text}</span>;
    }

    const bulletIndex = segment.bulletIndex;

    return (
      <span
        className="resume-review-bullet-text"
        data-resume-bullet-index={bulletIndex}
        role="button"
        tabIndex={0}
        onClick={() => onBulletClick(bulletIndex)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onBulletClick(bulletIndex);
          }
        }}
        onMouseEnter={isBulletHoverManagedByParent ? undefined : () => onBulletHover(bulletIndex)}
        onMouseLeave={isBulletHoverManagedByParent ? undefined : () => onBulletHover(null)}
      >
        {segment.text}
      </span>
    );
  }

  const comment =
    segment.comments.find((candidate) => candidate.id === expandedCommentId) ??
    segment.comments.find((candidate) => candidate.isHoverPreview) ??
    segment.comments[0];
  const isExpanded = comment.id === expandedCommentId;
  const registeredCommentIds = new Set([
    ...segment.anchorCommentIds,
    ...segment.comments.map((segmentComment) => segmentComment.id)
  ]);

  if (isExpanded) {
    registeredCommentIds.add(comment.id);
  }

  return (
    <span
      aria-controls={isExpanded ? `resume-review-comment-${comment.id}` : undefined}
      aria-expanded={isExpanded}
      className={`resume-review-highlight${isExpanded ? " resume-review-highlight--expanded" : ""}`}
      data-review-tone={comment.isHoverPreview ? "hover" : comment.colorIndex}
      data-resume-bullet-index={segment.bulletIndex ?? undefined}
      ref={(element) => {
        for (const commentId of registeredCommentIds) {
          setHighlightRef(commentId, highlightKey, element);
        }
      }}
      role="button"
      tabIndex={0}
      title={comment.text}
      onClickCapture={(event) => {
        if (segment.bulletIndex !== null) {
          event.preventDefault();
          event.stopPropagation();
          onBulletClick(segment.bulletIndex);
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        setClickedHighlightRef(comment.id, event.currentTarget);
        onHighlightClick(comment.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();

        if (segment.bulletIndex !== null) {
          onBulletClick(segment.bulletIndex);
          return;
        }

        setClickedHighlightRef(comment.id, event.currentTarget);
        onHighlightClick(comment.id);
      }}
      onMouseEnter={
        isBulletHoverManagedByParent || segment.bulletIndex === null
          ? undefined
          : () => onBulletHover(segment.bulletIndex)
      }
      onMouseLeave={
        isBulletHoverManagedByParent || segment.bulletIndex === null ? undefined : () => onBulletHover(null)
      }
    >
      {segment.text}
    </span>
  );
}

function getResumeTextSegments(
  text: string,
  comments: ResumeReviewComment[],
  bulletRanges: ResumeReviewBulletRange[] = []
): ResumeTextSegment[] {
  const normalizedComments = [...comments]
    .map((comment) => ({
      ...comment,
      start: clampResumeTextIndex(comment.start, text),
      end: clampResumeTextIndex(comment.end, text)
    }))
    .filter((comment) => comment.end > comment.start)
    .sort((firstComment, secondComment) => firstComment.start - secondComment.start || firstComment.end - secondComment.end);

  return getResumeTextSegmentsFromLocalComments(text, normalizedComments, new Set<string>(), bulletRanges);
}

function getResumeTextSegmentsForRange(
  text: string,
  range: ResumeTextRange | null,
  comments: ResumeReviewComment[],
  anchoredCommentIds: Set<string>
): ResumeTextSegment[] {
  if (!range) {
    return [{ anchorCommentIds: [], bulletIndex: null, comments: [], text }];
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
  anchoredCommentIds: Set<string>,
  bulletRanges: ResumeReviewBulletRange[] = []
): ResumeTextSegment[] {
  if (normalizedComments.length === 0 && bulletRanges.length === 0) {
    return [{ anchorCommentIds: [], bulletIndex: null, comments: [], text }];
  }

  const breakpoints = Array.from(
    new Set([
      0,
      text.length,
      ...normalizedComments.flatMap((comment) => [comment.start, comment.end]),
      ...bulletRanges.flatMap((bulletRange) => [bulletRange.start, bulletRange.end])
    ])
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
      bulletIndex: getResumeBulletIndexForRange({ start, end }, bulletRanges),
      comments: segmentComments,
      text: text.slice(start, end)
    });
  }

  return segments.length > 0 ? segments : [{ anchorCommentIds: [], bulletIndex: null, comments: [], text }];
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

function getResumeBulletIndexForRange(range: ResumeTextRange | null, bulletRanges: ResumeReviewBulletRange[]) {
  if (!range) {
    return null;
  }

  let bestMatch: ResumeReviewBulletRange | null = null;
  let bestOverlap = 0;

  for (const bulletRange of bulletRanges) {
    const overlap = Math.min(range.end, bulletRange.end) - Math.max(range.start, bulletRange.start);

    if (overlap > bestOverlap) {
      bestMatch = bulletRange;
      bestOverlap = overlap;
    }
  }

  return bestMatch && bestOverlap > 0 ? bestMatch.bulletIndex : null;
}

function getResumeBulletDisplayStart(text: string, bulletStart: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, bulletStart - 1)) + 1;
  const linePrefix = text.slice(lineStart, bulletStart);

  return /^[ \t]*[-*•‣▪◦‒–—−]\s*$/u.test(linePrefix) ? lineStart : bulletStart;
}

function clampResumeTextIndex(index: number, text: string) {
  return Math.max(0, Math.min(index, text.length));
}
