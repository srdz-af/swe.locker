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

export type ResumeTextRange = {
  start: number;
  end: number;
};

export type ResumeGradeBulletMetric = {
  label: string;
  value: number;
  comments: ResumeGradeComment[];
};

export type ResumeGradeBullet = {
  id: string;
  label: string;
  grade: number;
  range: ResumeTextRange;
  bulletIndex: number;
  metrics: ResumeGradeBulletMetric[];
};

export type ResumeGradeItem = {
  id: string;
  title: ResumeTextRange | null;
  description: ResumeTextRange | null;
  date: ResumeTextRange | null;
  bullets: ResumeGradeBullet[];
};

export type ResumeGradeResult = {
  rank: ResumeRank;
  verdict: string;
  metrics: ResumeGradeMetric[];
  comments: ResumeGradeCommentGroup[];
  resumeItems: ResumeGradeItem[];
};

type ResumeTextLine = {
  text: string;
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
};

type ResumeBulletCandidate = {
  label: string;
  range: ResumeTextRange;
  bulletIndex: number;
};

type ResumeItemCandidate = {
  id: string;
  title: ResumeTextRange | null;
  description: ResumeTextRange | null;
  date: ResumeTextRange | null;
  bullets: ResumeBulletCandidate[];
};

type ResumeEntryHeaderRanges = {
  title: ResumeTextRange | null;
  description: ResumeTextRange | null;
  date: ResumeTextRange | null;
};

const resumeMetricLabels = ["Structure", "Impact", "Evidence", "Specificity", "Relevance"];
const resumeRanks: ResumeRank[] = ["S", "A", "B", "C"];
const bulletPattern = /^[-*•‣▪◦‒–—−]\s*/u;
const resumeMonthPattern =
  "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)";
const resumeMonthYearPattern = `${resumeMonthPattern}\\.?\\s+\\d{4}`;
const resumeDateSeparatorPattern = "(?:-|\\u2010|\\u2011|\\u2012|\\u2013|\\u2014|\\u2015|\\u2212|to|through|until)";
const resumeEntryDateRangePattern = new RegExp(
  `\\b${resumeMonthYearPattern}\\s*${resumeDateSeparatorPattern}\\s*(?:Present|Current|Now|${resumeMonthYearPattern}|(?:19|20)\\d{2})\\b`,
  "i"
);
const resumeEntryDatePattern =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4}\b/i;
const resumeEntryYearRangePattern = /\b(?:19|20)\d{2}\s*(?:-|\u2010|\u2011|\u2012|\u2013|\u2014|\u2015|\u2212|to|through|until)\s*(?:Present|Current|Now|(?:19|20)\d{2})\b/i;
const sectionTitlePattern =
  /^(?:achievements?|activities|awards?|certifications?|education|experience|experiences|honou?rs?|leadership|projects?|publications?|skills?|summary|technologies|volunteering)(?:\s*(?:&|\/|and)\s*(?:achievements?|activities|awards?|certifications?|education|experience|experiences|honou?rs?|leadership|projects?|publications?|skills?|summary|technologies|volunteering))*$/i;

export function gradeResume(input: { sourceName: string; parsedText: string }): ResumeGradeResult {
  const resumeItems = createTemporaryResumeItems(input.parsedText);
  const bulletGrades = flattenResumeItemBullets(resumeItems);
  const metrics = calculateResumeMetricRollups(bulletGrades);
  const grade = calculateResumeGradeFromBullets(bulletGrades);
  const rank = resumeRanks[randomInteger(0, resumeRanks.length - 1)];
  const verdict =
    grade === null
      ? "No explicit resume bullets found to grade."
      : `Temporary random bullet grading result. Overall score ${grade}/100.`;

  return {
    rank,
    verdict,
    metrics,
    comments: createTemporaryResumeComments({
      bulletGrades,
      metrics,
      rank,
      verdict
    }),
    resumeItems
  };
}

export function calculateResumeGrade(metrics: ResumeGradeMetric[]) {
  if (metrics.length === 0) {
    return null;
  }

  const total = metrics.reduce((sum, metric) => sum + metric.value, 0);
  return Math.round(total / metrics.length);
}

function createTemporaryResumeItems(parsedText: string): ResumeGradeItem[] {
  return extractResumeItems(parsedText).map((item) => ({
    ...item,
    bullets: item.bullets.map((bullet) => {
      const metrics = resumeMetricLabels.map((label, metricIndex) => {
        const value = randomScore();

        return {
          label,
          value,
          comments: [
            {
              id: `bullet-${bullet.bulletIndex}-${slugifyResumeCommentId(label)}-comment-0`,
              start: bullet.range.start,
              end: bullet.range.end,
              text: getTemporaryBulletMetricComment({
                bulletText: getResumeRangePreview(parsedText, bullet.range),
                label,
                value,
                metricIndex
              })
            }
          ]
        };
      });

      return {
        ...bullet,
        id: `bullet-${bullet.bulletIndex}`,
        grade: calculateResumeGrade(metrics) ?? 0,
        metrics
      };
    })
  }));
}

function calculateResumeMetricRollups(bulletGrades: ResumeGradeBullet[]): ResumeGradeMetric[] {
  return resumeMetricLabels.flatMap((label) => {
    const metricValues = bulletGrades
      .map((bullet) => bullet.metrics.find((metric) => metric.label === label)?.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (metricValues.length === 0) {
      return [];
    }

    const total = metricValues.reduce((sum, value) => sum + value, 0);
    return [{
      label,
      value: Math.round(total / metricValues.length)
    }];
  });
}

function calculateResumeGradeFromBullets(bulletGrades: ResumeGradeBullet[]) {
  if (bulletGrades.length === 0) {
    return null;
  }

  const total = bulletGrades.reduce((sum, bullet) => sum + bullet.grade, 0);
  return Math.round(total / bulletGrades.length);
}

function flattenResumeItemBullets(resumeItems: ResumeGradeItem[]) {
  return resumeItems.flatMap((item) => item.bullets);
}

function extractResumeItems(text: string): ResumeItemCandidate[] {
  const lines = getResumeTextLines(text);
  const items: ResumeItemCandidate[] = [];
  let currentItem: ResumeItemCandidate | null = null;
  let currentBullet: ResumeBulletCandidate | null = null;
  let nextItemIndex = 1;
  let nextBulletIndex = 1;

  function createItem(ranges: ResumeEntryHeaderRanges): ResumeItemCandidate {
    const item: ResumeItemCandidate = {
      id: `resume-item-${nextItemIndex}`,
      title: ranges.title,
      description: ranges.description,
      date: ranges.date,
      bullets: []
    };

    nextItemIndex += 1;
    items.push(item);
    return item;
  }

  function ensureCurrentItem() {
    if (!currentItem) {
      currentItem = createItem({
        title: null,
        description: null,
        date: null
      });
    }

    return currentItem;
  }

  function flushCurrentBullet() {
    if (!currentBullet) {
      return;
    }

    if (currentBullet.range.end > currentBullet.range.start) {
      ensureCurrentItem().bullets.push(currentBullet);
    }

    currentBullet = null;
  }

  function startBullet(line: ResumeTextLine, bulletMatch: RegExpMatchArray) {
    flushCurrentBullet();

    const bulletStart = line.contentStart + bulletMatch[0].length;
    const bulletIndex = nextBulletIndex;
    nextBulletIndex += 1;
    currentBullet = {
      label: `B${bulletIndex}`,
      range: {
        start: bulletStart,
        end: line.contentEnd
      },
      bulletIndex
    };
  }

  function extendCurrentBullet(end: number) {
    if (currentBullet) {
      currentBullet.range.end = end;
    }
  }

  function absorbItemLine(line: ResumeTextLine) {
    const ranges = getResumeEntryHeaderRanges(line, text);
    const lineRange = getResumeLineContentRange(line);

    if (!lineRange) {
      return;
    }

    if (!currentItem || currentItem.bullets.length > 0) {
      currentItem = createItem({
        title: ranges.title ?? lineRange,
        description: ranges.description,
        date: ranges.date
      });
      return;
    }

    if (!currentItem.title) {
      currentItem.title = ranges.title ?? lineRange;
      currentItem.description = ranges.description;
      currentItem.date = ranges.date;
      return;
    }

    if (ranges.date && !currentItem.date) {
      currentItem.date = ranges.date;
    }

    const descriptionRange =
      ranges.description ??
      (ranges.title && !areResumeTextRangesEqual(ranges.title, currentItem.title) ? ranges.title : null) ??
      lineRange;

    if (!currentItem.description) {
      currentItem.description = descriptionRange;
      return;
    }

    currentItem.description = {
      start: Math.min(currentItem.description.start, descriptionRange.start),
      end: Math.max(currentItem.description.end, descriptionRange.end)
    };
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.contentStart < 0) {
      flushCurrentBullet();
      continue;
    }

    const visibleText = text.slice(line.contentStart, line.contentEnd);
    const bulletMatch = visibleText.match(bulletPattern);

    if (bulletMatch) {
      startBullet(line, bulletMatch);
      continue;
    }

    const trimmedLine = visibleText.trim();
    const sectionTitle = getLikelyResumeSectionTitle(trimmedLine);
    const nextVisibleLine = getNextResumeVisibleLine(lines, lineIndex + 1, text);

    if (currentBullet && (sectionTitle || isLikelyResumeEntryBoundary(trimmedLine, nextVisibleLine))) {
      flushCurrentBullet();
    }

    if (sectionTitle) {
      currentItem = null;
      continue;
    }

    if (currentBullet) {
      extendCurrentBullet(line.contentEnd);
      continue;
    }

    absorbItemLine(line);
  }

  flushCurrentBullet();

  return items.filter((item) => item.bullets.length > 0);
}

function createTemporaryResumeComments({
  bulletGrades,
  metrics,
  rank,
  verdict
}: {
  bulletGrades: ResumeGradeBullet[];
  metrics: ResumeGradeMetric[];
  rank: ResumeRank;
  verdict: string;
}): ResumeGradeCommentGroup[] {
  if (bulletGrades.length === 0) {
    return [];
  }

  const rankComments = [
    {
      id: "rank-comment-0",
      start: bulletGrades[0].range.start,
      end: bulletGrades[0].range.end,
      text: verdict || `Signal ${rank}: this bullet contributes to the overall resume signal.`
    }
  ];

  return [
    {
      id: "rank",
      label: "Signal",
      scoreLabel: `Signal ${rank}`,
      comments: rankComments
    },
    ...metrics.map((metric, metricIndex) => {
      const bulletMetricComments = bulletGrades.flatMap(
        (bullet) => bullet.metrics.find((bulletMetric) => bulletMetric.label === metric.label)?.comments ?? []
      );

      return {
        id: `metric-${slugifyResumeCommentId(metric.label)}-${metricIndex}`,
        label: metric.label,
        scoreLabel: `${metric.value}/100`,
        comments: bulletMetricComments
      };
    })
  ].filter((group) => group.comments.length > 0);
}

function getTemporaryBulletMetricComment({
  bulletText,
  label,
  metricIndex,
  value
}: {
  bulletText: string;
  label: string;
  metricIndex: number;
  value: number;
}) {
  const preview = truncateResumeCommentPreview(bulletText);
  const action = metricIndex % 2 === 0 ? "Review" : "Improve";

  return `${label} ${value}/100: ${action.toLowerCase()} this bullet's ${label.toLowerCase()} signal: "${preview}"`;
}

function getResumeTextLines(text: string) {
  const lines: ResumeTextLine[] = [];
  let cursor = 0;

  for (const line of text.split("\n")) {
    const lineStart = cursor;
    const contentStartOffset = line.search(/\S/);
    const endTrimmedLine = line.replace(/\s+$/g, "");

    lines.push({
      text: line,
      start: lineStart,
      end: lineStart + line.length,
      contentStart: contentStartOffset >= 0 ? lineStart + contentStartOffset : -1,
      contentEnd: lineStart + endTrimmedLine.length
    });

    cursor += line.length + 1;
  }

  return lines;
}

function getResumeEntryHeaderRanges(line: ResumeTextLine, text: string): ResumeEntryHeaderRanges {
  const visibleText = text.slice(line.contentStart, line.contentEnd);
  const dateMatch = findResumeEntryDateMatch(visibleText);
  const dateMatchStart = dateMatch?.index ?? -1;
  const dateRange = dateMatch && dateMatchStart >= 0
    ? toResumeTextRange(line.contentStart, trimLocalTextRange(visibleText, dateMatchStart, dateMatchStart + dateMatch[0].length))
    : null;
  const bodyEnd = dateRange ? dateMatchStart : visibleText.length;
  const bodyLocalRange = trimResumeEntryBodyRange(visibleText, 0, bodyEnd);

  if (!bodyLocalRange) {
    return {
      title: null,
      description: null,
      date: dateRange
    };
  }

  const bodyText = visibleText.slice(bodyLocalRange.start, bodyLocalRange.end);
  const pipeMatch = bodyText.match(/\s+\|\s+/);
  if (!pipeMatch || pipeMatch.index === undefined) {
    return {
      title: toResumeTextRange(line.contentStart, bodyLocalRange),
      description: null,
      date: dateRange
    };
  }

  const titleLocalRange = trimLocalTextRange(visibleText, bodyLocalRange.start, bodyLocalRange.start + pipeMatch.index);
  const descriptionLocalRange = trimLocalTextRange(
    visibleText,
    bodyLocalRange.start + pipeMatch.index + pipeMatch[0].length,
    bodyLocalRange.end
  );

  return {
    title: titleLocalRange ? toResumeTextRange(line.contentStart, titleLocalRange) : null,
    description: descriptionLocalRange ? toResumeTextRange(line.contentStart, descriptionLocalRange) : null,
    date: dateRange
  };
}

function findResumeEntryDateMatch(value: string) {
  return value.match(resumeEntryDateRangePattern) ?? value.match(resumeEntryYearRangePattern) ?? value.match(resumeEntryDatePattern);
}

function getResumeLineContentRange(line: ResumeTextLine): ResumeTextRange | null {
  if (line.contentStart < 0 || line.contentEnd <= line.contentStart) {
    return null;
  }

  return {
    start: line.contentStart,
    end: line.contentEnd
  };
}

function getNextResumeVisibleLine(lines: ResumeTextLine[], startIndex: number, text: string) {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.contentStart >= 0) {
      return text.slice(line.contentStart, line.contentEnd).trim();
    }
  }

  return null;
}

function getLikelyResumeSectionTitle(value: string) {
  const normalizedValue = normalizeResumeSectionTitleCandidate(value);
  if (normalizedValue.length < 3 || normalizedValue.length > 70 || /[.!?]$/.test(normalizedValue)) {
    return null;
  }

  return sectionTitlePattern.test(normalizedValue) ? normalizedValue : null;
}

function normalizeResumeSectionTitleCandidate(value: string) {
  return value.replace(/\b([A-Z])\s+(?=[A-Z]{2,}\b)/g, "$1").replace(/\s+/g, " ").trim();
}

function isLikelyResumeEntryTitle(value: string) {
  if (value.length < 3 || value.length > 180 || /[.!?]$/.test(value)) {
    return false;
  }

  return resumeEntryDateRangePattern.test(value) || resumeEntryDatePattern.test(value) || resumeEntryYearRangePattern.test(value) || (value.includes(" | ") && /^[A-Z0-9]/.test(value));
}

function isLikelyResumeEntryBoundary(value: string, nextVisibleLine: string | null) {
  return isLikelyResumeEntryTitle(value) || (isLikelyStandaloneResumeEntryTitle(value) && Boolean(nextVisibleLine && isLikelyResumeEntryTitle(nextVisibleLine)));
}

function isLikelyStandaloneResumeEntryTitle(value: string) {
  if (value.length < 3 || value.length > 100 || !/^[A-Z0-9]/.test(value) || /[:;!?]$/.test(value)) {
    return false;
  }

  const wordCount = value.split(/\s+/).filter(Boolean).length;
  return wordCount <= 10 && !/[•‣▪◦]/u.test(value);
}

function trimResumeEntryBodyRange(value: string, start: number, end: number) {
  let range = trimLocalTextRange(value, start, end);

  while (range && range.end > range.start && /[|,;/:-]|\u2010|\u2011|\u2012|\u2013|\u2014|\u2015|\u2212/u.test(value[range.end - 1])) {
    range = trimLocalTextRange(value, range.start, range.end - 1);
  }

  return range;
}

function trimLocalTextRange(value: string, start: number, end: number) {
  let rangeStart = Math.max(0, start);
  let rangeEnd = Math.min(value.length, end);

  while (rangeStart < rangeEnd && /\s/.test(value[rangeStart])) {
    rangeStart += 1;
  }

  while (rangeEnd > rangeStart && /\s/.test(value[rangeEnd - 1])) {
    rangeEnd -= 1;
  }

  return rangeEnd > rangeStart
    ? {
        start: rangeStart,
        end: rangeEnd
      }
    : null;
}

function toResumeTextRange(baseOffset: number, localRange: { start: number; end: number } | null): ResumeTextRange | null {
  return localRange
    ? {
        start: baseOffset + localRange.start,
        end: baseOffset + localRange.end
      }
    : null;
}

function areResumeTextRangesEqual(left: ResumeTextRange, right: ResumeTextRange) {
  return left.start === right.start && left.end === right.end;
}

function randomScore() {
  return randomInteger(0, 100);
}

function randomInteger(minimum: number, maximum: number) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function truncateResumeCommentPreview(value: string) {
  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function getResumeRangePreview(text: string, range: ResumeTextRange) {
  return text.slice(range.start, range.end).replace(/\s+/g, " ").trim();
}

function slugifyResumeCommentId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "metric";
}
