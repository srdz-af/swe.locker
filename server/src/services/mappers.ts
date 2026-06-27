import type { Application, ApplicationEvent, FetchRun, FollowedCompany, JobPosting, SourceConfig } from "../generated/prisma/client.js";

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
