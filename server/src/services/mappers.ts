import type { Application, ApplicationEvent, FetchRun, FollowedCompany, JobPosting, ResumeRun, SourceConfig } from "../generated/prisma/client.js";

type ApplicationWithEvents = Application & {
  events?: ApplicationEvent[];
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

  return {
    id: run.id,
    sourceName: run.sourceName,
    parsedText: run.parsedText,
    grade: run.grade,
    tier: run.tier,
    verdict: run.verdict,
    metrics,
    comments: parseResumeComments((run as ResumeRun & { comments?: unknown }).comments),
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
