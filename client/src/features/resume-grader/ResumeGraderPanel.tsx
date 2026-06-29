import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button, FileUploaderButton, Loading, Tile } from "@carbon/react";
import { Help, TrashCan } from "@carbon/icons-react";
import { LineChart, RadarChart, ScaleTypes } from "@carbon/charts-react";
import type { ChartTabularData, LineChartOptions, RadarChartOptions } from "@carbon/charts-react";
import { resumeAcceptedFileTypes } from "../../constants";
import type { ResumeGraderRun, ThemeMode } from "../../types/app";
import { formatDate } from "../../utils/format";
import {
  compareResumeRunsByCreatedAtAsc,
  getResumeRunIdFromChartDatum,
  getResumeRunIdFromChartTarget
} from "./resumeRuns";

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
