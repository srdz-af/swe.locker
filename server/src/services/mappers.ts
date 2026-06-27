import type { Application, FetchRun, FollowedCompany, JobPosting, SourceConfig } from "../generated/prisma/client.js";

const APPLICATION_STATUSES = ["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

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

export function toApplicationDto(application: Application) {
  return {
    id: application.id,
    jobPostingId: application.jobPostingId,
    company: application.company,
    role: application.role,
    jobPostingUrl: application.jobPostingUrl,
    externalApplicationTrackingUrl: application.externalApplicationTrackingUrl,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString()
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

export function emptyApplicationStatusCounts(): Record<ApplicationStatus, number> {
  return Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
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
