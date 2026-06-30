import type { Application, ApplicationEvent, FetchRun, FollowedCompany, JobPosting, ResumeRun, SourceConfig } from "../generated/prisma/client.js";
import { calculateResumeGrade } from "../grading/resumeGrader.js";

type ApplicationWithEvents = Application & {
  events?: ApplicationEvent[];
};

type ParsedResumeTextRange = {
  start: number;
  end: number;
};

type ParsedResumeComment = ParsedResumeTextRange & {
  id: string;
  text: string;
};

type ParsedResumeBulletMetric = {
  label: string;
  value: number;
  comments: ParsedResumeComment[];
};

type ParsedResumeBulletGrade = {
  id: string;
  label: string;
  grade: number;
  range: ParsedResumeTextRange;
  bulletIndex: number;
  metrics: ParsedResumeBulletMetric[];
};

type ParsedResumeItem = {
  id: string;
  title: ParsedResumeTextRange | null;
  description: ParsedResumeTextRange | null;
  date: ParsedResumeTextRange | null;
  bullets: ParsedResumeBulletGrade[];
};

export function toSourceConfigDto(source: SourceConfig) {
  return {
    id: source.id,
    displayName: source.displayName,
    repositoryUrl: source.repositoryUrl,
    rawReadmeUrl: source.rawReadmeUrl,
    season: source.season,
    fetchIntervalHours: source.fetchIntervalHours,
    enabled: source.enabled,
    updatedAt: source.updatedAt.toISOString()
  };
}

export function toFetchRunDto(fetchRun: FetchRun) {
  return {
    id: fetchRun.id,
    startedAt: fetchRun.startedAt.toISOString(),
    completedAt: fetchRun.completedAt?.toISOString() ?? null,
    status: fetchRun.status,
    postingsFound: fetchRun.postingsFound,
    newPostings: fetchRun.newPostings,
    updatedPostings: fetchRun.updatedPostings,
    errorMessage: fetchRun.errorMessage
  };
}

export function toFollowedCompanyDto(followedCompany: FollowedCompany) {
  return {
    id: followedCompany.id,
    companyName: followedCompany.companyName,
    normalizedCompanyName: followedCompany.normalizedCompanyName,
    createdAt: followedCompany.createdAt.toISOString()
  };
}

export function toApplicationDto(application: ApplicationWithEvents) {
  return {
    id: application.id,
    jobPostingId: application.jobPostingId,
    company: application.company,
    role: application.role,
    jobPostingUrl: application.jobPostingUrl,
    externalApplicationTrackingUrl: application.externalApplicationTrackingUrl,
    notes: application.notes,
    interviewDates: parseApplicationInterviewDates(application.interviewDates),
    links: parseApplicationLinks(application.links),
    submittedResumeRunId: application.submittedResumeRunId,
    status: application.status,
    archivedAt: application.archivedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    events: [...(application.events ?? [])]
      .sort((left, right) => left.eventDate.getTime() - right.eventDate.getTime() || left.createdAt.getTime() - right.createdAt.getTime())
      .map(toApplicationEventDto)
  };
}

function toApplicationEventDto(event: ApplicationEvent) {
  return {
    id: event.id,
    eventType: event.eventType,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    eventDate: event.eventDate.toISOString(),
    createdAt: event.createdAt.toISOString()
  };
}

export function toResumeRunDto(run: ResumeRun) {
  const metrics = parseResumeMetrics(run.metrics);
  const resumeItems = parseResumeItems((run as ResumeRun & { bulletGrades?: unknown }).bulletGrades);
  const bulletGrades = flattenResumeItemBulletGrades(resumeItems);

  return {
    id: run.id,
    sourceName: run.sourceName,
    parsedText: run.parsedText,
    grade: calculateResumeGradeFromBulletGrades(bulletGrades) ?? run.grade ?? calculateResumeGrade(metrics),
    tier: run.tier,
    verdict: run.verdict,
    metrics,
    comments: parseResumeComments((run as ResumeRun & { comments?: unknown }).comments),
    resumeItems,
    createdAt: run.createdAt.toISOString()
  };
}

export function toJobPostingDto(
  posting: JobPosting,
  options: {
    followedCompanyNames: Set<string>;
    trackedApplicationIdsByPostingId: Map<string, string>;
  }
) {
  const locations = parseStringArray(posting.locations);
  const applicationUrls = parseStringArray(posting.applicationUrls);

  return {
    id: posting.id,
    sourceConfigId: posting.sourceConfigId,
    season: posting.season,
    category: posting.category,
    company: posting.company,
    normalizedCompanyName: posting.normalizedCompanyName,
    role: posting.role,
    locations,
    applicationUrls,
    primaryApplicationUrl: posting.primaryApplicationUrl,
    simplifyUrl: posting.simplifyUrl,
    ageText: posting.ageText,
    firstSeenAt: posting.firstSeenAt.toISOString(),
    lastSeenAt: posting.lastSeenAt.toISOString(),
    isNewToday: isNewSinceYesterday(posting.firstSeenAt),
    isActive: posting.isActive,
    isFollowed: options.followedCompanyNames.has(posting.normalizedCompanyName),
    isTracked: options.trackedApplicationIdsByPostingId.has(posting.id),
    trackedApplicationId: options.trackedApplicationIdsByPostingId.get(posting.id) ?? null,
    doesNotOfferSponsorship: posting.doesNotOfferSponsorship,
    requiresUsCitizenship: posting.requiresUsCitizenship,
    isClosed: posting.isClosed,
    isFaang: posting.isFaang,
    requiresAdvancedDegree: posting.requiresAdvancedDegree
  };
}

export function isNewSinceYesterday(firstSeenAt: Date) {
  return firstSeenAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseResumeMetrics(value: unknown) {
  const parsedValue = parseJson(value);

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((metric) => {
      if (!metric || typeof metric !== "object") {
        return null;
      }

      const candidate = metric as { label?: unknown; value?: unknown };
      if (typeof candidate.label !== "string" || typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) {
        return null;
      }

      return {
        label: candidate.label,
        value: candidate.value
      };
    })
    .filter((metric): metric is { label: string; value: number } => Boolean(metric));
}

function parseResumeComments(value: unknown) {
  const parsedValue = parseJson(value);

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((commentGroup) => {
      if (!commentGroup || typeof commentGroup !== "object") {
        return null;
      }

      const candidateGroup = commentGroup as {
        id?: unknown;
        label?: unknown;
        scoreLabel?: unknown;
        comments?: unknown;
      };
      if (
        typeof candidateGroup.id !== "string" ||
        typeof candidateGroup.label !== "string" ||
        typeof candidateGroup.scoreLabel !== "string" ||
        !Array.isArray(candidateGroup.comments)
      ) {
        return null;
      }

      const comments = candidateGroup.comments
        .map((comment) => {
          if (!comment || typeof comment !== "object") {
            return null;
          }

          const candidateComment = comment as { id?: unknown; start?: unknown; end?: unknown; text?: unknown };
          if (
            typeof candidateComment.id !== "string" ||
            typeof candidateComment.start !== "number" ||
            typeof candidateComment.end !== "number" ||
            typeof candidateComment.text !== "string" ||
            !Number.isInteger(candidateComment.start) ||
            !Number.isInteger(candidateComment.end)
          ) {
            return null;
          }

          return {
            id: candidateComment.id,
            start: candidateComment.start,
            end: candidateComment.end,
            text: candidateComment.text
          };
        })
        .filter((comment): comment is { id: string; start: number; end: number; text: string } => Boolean(comment));

      return {
        id: candidateGroup.id,
        label: candidateGroup.label,
        scoreLabel: candidateGroup.scoreLabel,
        comments
      };
    })
    .filter(
      (commentGroup): commentGroup is { id: string; label: string; scoreLabel: string; comments: Array<{ id: string; start: number; end: number; text: string }> } =>
        Boolean(commentGroup)
    );
}

function parseApplicationLinks(value: unknown) {
  const parsedValue = parseJson(value);

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((link) => {
      if (!link || typeof link !== "object") {
        return null;
      }

      const candidate = link as { label?: unknown; url?: unknown };
      if (typeof candidate.url !== "string") {
        return null;
      }

      return {
        label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : null,
        url: candidate.url
      };
    })
    .filter((link): link is { label: string | null; url: string } => Boolean(link));
}

function parseApplicationInterviewDates(value: unknown) {
  const parsedValue = parseJson(value);

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((interviewDate, index) => {
      if (typeof interviewDate === "string") {
        return {
          label: `Interview ${index + 1}`,
          date: interviewDate
        };
      }

      if (!interviewDate || typeof interviewDate !== "object") {
        return null;
      }

      const candidate = interviewDate as { label?: unknown; date?: unknown };
      if (typeof candidate.date !== "string") {
        return null;
      }

      return {
        label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : `Interview ${index + 1}`,
        date: candidate.date
      };
    })
    .filter((interviewDate): interviewDate is { label: string; date: string } => Boolean(interviewDate));
}

function parseResumeItems(value: unknown): ParsedResumeItem[] {
  const parsedValue = parseJson(value);

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  if (parsedValue.some(isResumeItemLike)) {
    return parsedValue
      .map((item, itemIndex) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidateItem = item as {
          id?: unknown;
          title?: unknown;
          description?: unknown;
          date?: unknown;
          bullets?: unknown;
        };

        if (typeof candidateItem.id !== "string" || !Array.isArray(candidateItem.bullets)) {
          return null;
        }

        const bullets = candidateItem.bullets
          .map((bullet) => parseResumeBulletGrade(bullet))
          .filter((bullet): bullet is ParsedResumeBulletGrade => Boolean(bullet));

        return {
          id: candidateItem.id || `resume-item-${itemIndex + 1}`,
          title: parseResumeTextRange(candidateItem.title),
          description: parseResumeTextRange(candidateItem.description),
          date: parseResumeTextRange(candidateItem.date),
          bullets
        };
      })
      .filter((item): item is ParsedResumeItem => item !== null && item.bullets.length > 0);
  }

  return convertLegacyResumeBulletGrades(parsedValue);
}

function isResumeItemLike(value: unknown) {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { bullets?: unknown }).bullets));
}

function convertLegacyResumeBulletGrades(value: unknown[]): ParsedResumeItem[] {
  const items: ParsedResumeItem[] = [];
  const itemsByKey = new Map<string, ParsedResumeItem>();

  for (const bulletGrade of value) {
    const bullet = parseLegacyResumeBulletGrade(bulletGrade);
    if (!bullet) {
      continue;
    }

    const legacyCandidate = bulletGrade as { entryTitle?: unknown; sectionTitle?: unknown };
    const itemKey =
      typeof legacyCandidate.entryTitle === "string" && legacyCandidate.entryTitle.trim()
        ? legacyCandidate.entryTitle.trim()
        : typeof legacyCandidate.sectionTitle === "string" && legacyCandidate.sectionTitle.trim()
          ? legacyCandidate.sectionTitle.trim()
          : `legacy-item-${items.length + 1}`;
    let item = itemsByKey.get(itemKey);

    if (!item) {
      item = {
        id: `legacy-resume-item-${items.length + 1}`,
        title: null,
        description: null,
        date: null,
        bullets: []
      };
      itemsByKey.set(itemKey, item);
      items.push(item);
    }

    item.bullets.push(bullet);
  }

  return items;
}

function parseResumeBulletGrade(value: unknown): ParsedResumeBulletGrade | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidateBullet = value as {
    id?: unknown;
    label?: unknown;
    grade?: unknown;
    range?: unknown;
    bulletIndex?: unknown;
    metrics?: unknown;
  };

  if (
    typeof candidateBullet.id !== "string" ||
    typeof candidateBullet.label !== "string" ||
    typeof candidateBullet.bulletIndex !== "number" ||
    !Number.isInteger(candidateBullet.bulletIndex) ||
    !Array.isArray(candidateBullet.metrics)
  ) {
    return null;
  }

  const range = parseResumeTextRange(candidateBullet.range);
  if (!range) {
    return null;
  }

  const metrics = parseResumeBulletMetrics(candidateBullet.metrics);
  const computedGrade = calculateResumeGrade(metrics);
  const grade =
    typeof candidateBullet.grade === "number" &&
    Number.isInteger(candidateBullet.grade) &&
    candidateBullet.grade >= 0 &&
    candidateBullet.grade <= 100
      ? candidateBullet.grade
      : computedGrade;

  if (grade === null) {
    return null;
  }

  return {
    id: candidateBullet.id,
    label: candidateBullet.label,
    grade,
    range,
    bulletIndex: candidateBullet.bulletIndex,
    metrics
  };
}

function parseLegacyResumeBulletGrade(value: unknown): ParsedResumeBulletGrade | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidateBullet = value as {
    id?: unknown;
    label?: unknown;
    grade?: unknown;
    start?: unknown;
    end?: unknown;
    bulletIndex?: unknown;
    metrics?: unknown;
  };

  if (
    typeof candidateBullet.id !== "string" ||
    typeof candidateBullet.label !== "string" ||
    typeof candidateBullet.start !== "number" ||
    typeof candidateBullet.end !== "number" ||
    typeof candidateBullet.bulletIndex !== "number" ||
    !Number.isInteger(candidateBullet.start) ||
    !Number.isInteger(candidateBullet.end) ||
    !Number.isInteger(candidateBullet.bulletIndex) ||
    !Array.isArray(candidateBullet.metrics)
  ) {
    return null;
  }

  const metrics = parseResumeBulletMetrics(candidateBullet.metrics);
  const computedGrade = calculateResumeGrade(metrics);
  const grade =
    typeof candidateBullet.grade === "number" &&
    Number.isInteger(candidateBullet.grade) &&
    candidateBullet.grade >= 0 &&
    candidateBullet.grade <= 100
      ? candidateBullet.grade
      : computedGrade;

  if (grade === null) {
    return null;
  }

  return {
    id: candidateBullet.id,
    label: candidateBullet.label,
    grade,
    range: {
      start: candidateBullet.start,
      end: candidateBullet.end
    },
    bulletIndex: candidateBullet.bulletIndex,
    metrics
  };
}

function parseResumeBulletMetrics(value: unknown): ParsedResumeBulletMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((metric) => {
      if (!metric || typeof metric !== "object") {
        return null;
      }

      const candidateMetric = metric as { label?: unknown; value?: unknown; comments?: unknown };
      if (
        typeof candidateMetric.label !== "string" ||
        typeof candidateMetric.value !== "number" ||
        !Number.isFinite(candidateMetric.value) ||
        !Array.isArray(candidateMetric.comments)
      ) {
        return null;
      }

      const comments = candidateMetric.comments
        .map((comment) => {
          if (!comment || typeof comment !== "object") {
            return null;
          }

          const candidateComment = comment as { id?: unknown; start?: unknown; end?: unknown; text?: unknown };
          if (
            typeof candidateComment.id !== "string" ||
            typeof candidateComment.start !== "number" ||
            typeof candidateComment.end !== "number" ||
            typeof candidateComment.text !== "string" ||
            !Number.isInteger(candidateComment.start) ||
            !Number.isInteger(candidateComment.end)
          ) {
            return null;
          }

          return {
            id: candidateComment.id,
            start: candidateComment.start,
            end: candidateComment.end,
            text: candidateComment.text
          };
        })
        .filter((comment): comment is ParsedResumeComment => Boolean(comment));

      return {
        label: candidateMetric.label,
        value: candidateMetric.value,
        comments
      };
    })
    .filter((metric): metric is ParsedResumeBulletMetric => Boolean(metric));
}

function parseResumeTextRange(value: unknown): ParsedResumeTextRange | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const range = value as { start?: unknown; end?: unknown };
  if (
    typeof range.start !== "number" ||
    typeof range.end !== "number" ||
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end)
  ) {
    return null;
  }

  return {
    start: range.start,
    end: range.end
  };
}

function flattenResumeItemBulletGrades(resumeItems: ParsedResumeItem[]) {
  return resumeItems.flatMap((item) => item.bullets);
}

function calculateResumeGradeFromBulletGrades(bulletGrades: Array<{ grade: number }>) {
  if (bulletGrades.length === 0) {
    return null;
  }

  const total = bulletGrades.reduce((sum, bulletGrade) => sum + bulletGrade.grade, 0);
  return Math.round(total / bulletGrades.length);
}

function parseJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
