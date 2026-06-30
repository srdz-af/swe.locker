export type ResumeRank = "S" | "A" | "B" | "C";

export type ResumeGradeMetric = {
  label: string;
  value: number;
};

export type ResumeGradeComment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

export type ResumeGradeCommentGroup = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeGradeComment[];
};

export type ResumeGradeResult = {
  rank: ResumeRank;
  verdict: string;
  metrics: ResumeGradeMetric[];
  comments: ResumeGradeCommentGroup[];
};

const resumeRanks: ResumeRank[] = ["S", "A", "B", "C"];
const resumeMetricLabels = ["Structure", "Impact", "Evidence", "Specificity", "Relevance"];

export function gradeResume(input: { sourceName: string; parsedText: string }): ResumeGradeResult {
  const rank = resumeRanks[randomInteger(0, resumeRanks.length - 1)];
  const verdict = "Temporary random grading result.";
  const metrics = resumeMetricLabels.map((label) => ({
    label,
    value: randomScore()
  }));

  return {
    rank,
    verdict,
    metrics,
    comments: createTemporaryResumeComments({
      metrics,
      parsedText: input.parsedText,
      rank,
      verdict
    })
  };
}

export function calculateResumeGrade(metrics: ResumeGradeMetric[]) {
  if (metrics.length === 0) {
    return null;
  }

  const total = metrics.reduce((sum, metric) => sum + metric.value, 0);
  return Math.round(total / metrics.length);
}

function randomScore() {
  return randomInteger(0, 100);
}

function randomInteger(minimum: number, maximum: number) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function createTemporaryResumeComments({
  metrics,
  parsedText,
  rank,
  verdict
}: {
  metrics: ResumeGradeMetric[];
  parsedText: string;
  rank: ResumeRank;
  verdict: string;
}): ResumeGradeCommentGroup[] {
  const ranges = getResumeTextRanges(parsedText);
  const rankComments = createTemporaryResumeCommentList({
    id: "rank",
    index: 0,
    label: "Signal",
    ranges,
    text: parsedText,
    valueLabel: rank,
    verdict
  });

  return [
    {
      id: "rank",
      label: "Signal",
      scoreLabel: `Signal ${rank}`,
      comments: rankComments
    },
    ...metrics.map((metric, metricIndex) => ({
      id: `metric-${slugifyResumeCommentId(metric.label)}-${metricIndex}`,
      label: metric.label,
      scoreLabel: `${metric.value}/100`,
      comments: createTemporaryResumeCommentList({
        id: `metric-${slugifyResumeCommentId(metric.label)}-${metricIndex}`,
        index: metricIndex + 1,
        label: metric.label,
        ranges,
        text: parsedText,
        valueLabel: `${metric.value}/100`,
        verdict
      })
    }))
  ].filter((group) => group.comments.length > 0);
}

function createTemporaryResumeCommentList({
  id,
  index,
  label,
  ranges,
  text,
  valueLabel,
  verdict
}: {
  id: string;
  index: number;
  label: string;
  ranges: Array<{ start: number; end: number }>;
  text: string;
  valueLabel: string;
  verdict: string;
}): ResumeGradeComment[] {
  const selectedRanges = pickResumeCommentRanges(ranges, index);

  return selectedRanges.map((range, commentIndex) => ({
    id: `${id}-comment-${commentIndex}`,
    start: range.start,
    end: range.end,
    text: getTemporaryResumeCommentText({
      commentIndex,
      label,
      preview: text.slice(range.start, range.end).trim(),
      valueLabel,
      verdict
    })
  }));
}

function getTemporaryResumeCommentText({
  commentIndex,
  label,
  preview,
  valueLabel,
  verdict
}: {
  commentIndex: number;
  label: string;
  preview: string;
  valueLabel: string;
  verdict: string;
}) {
  if (label === "Signal") {
    return commentIndex === 0
      ? verdict || `Signal ${valueLabel}: this excerpt contributes to the overall resume signal.`
      : `Signal ${valueLabel}: this section affects seniority, scope, and evidence quality.`;
  }

  if (commentIndex === 0) {
    return `${label} ${valueLabel}: this excerpt is one of the signals behind the score.`;
  }

  return `Improve ${label.toLowerCase()} by making this part more specific: "${truncateResumeCommentPreview(preview)}"`;
}

function getResumeTextRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const line of text.split("\n")) {
    const lineStart = cursor;
    const contentStartOffset = line.search(/\S/);

    if (contentStartOffset >= 0) {
      const endTrimmedLine = line.replace(/\s+$/g, "");
      ranges.push({
        start: lineStart + contentStartOffset,
        end: lineStart + endTrimmedLine.length
      });
    }

    cursor += line.length + 1;
  }

  if (ranges.length === 0 && text.length > 0) {
    return [{ start: 0, end: text.length }];
  }

  return ranges;
}

function pickResumeCommentRanges(ranges: Array<{ start: number; end: number }>, index: number) {
  if (ranges.length === 0) {
    return [];
  }

  const firstRange = ranges[index % ranges.length];
  const secondRange = ranges[(index * 2 + 1) % ranges.length];

  if (!secondRange || firstRange.start === secondRange.start) {
    return [firstRange];
  }

  return [firstRange, secondRange];
}

function truncateResumeCommentPreview(value: string) {
  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function slugifyResumeCommentId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "metric";
}
