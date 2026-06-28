export type HealthResponse = {
  ok: boolean;
  service: string;
  timestamp: string;
};

export type ApplicationStatus = "APPLIED" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";
export type ApplicationEventType = "CREATED" | "STATUS_CHANGED";

export type SourceConfigDto = {
  id: string;
  displayName: string;
  repositoryUrl: string;
  rawReadmeUrl: string;
  season: string;
  fetchIntervalHours: number;
  enabled: boolean;
  updatedAt: string;
};

export type JobPostingDto = {
  id: string;
  season: string;
  category: string;
  company: string;
  normalizedCompanyName: string;
  role: string;
  locations: string[];
  applicationUrls: string[];
  primaryApplicationUrl: string | null;
  simplifyUrl: string | null;
  ageText: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isNewToday: boolean;
  isActive: boolean;
  isFollowed: boolean;
  isTracked: boolean;
  trackedApplicationId: string | null;
  doesNotOfferSponsorship: boolean;
  requiresUsCitizenship: boolean;
  isClosed: boolean;
  isFaang: boolean;
  requiresAdvancedDegree: boolean;
};

export type FollowedCompanyDto = {
  id: string;
  companyName: string;
  normalizedCompanyName: string;
  createdAt: string;
};

export type ApplicationDto = {
  id: string;
  jobPostingId: string | null;
  company: string;
  role: string;
  jobPostingUrl: string | null;
  externalApplicationTrackingUrl: string | null;
  status: ApplicationStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: ApplicationEventDto[];
};

export type ApplicationEventDto = {
  id: string;
  eventType: ApplicationEventType;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  eventDate: string;
  createdAt: string;
};

export type ApplicationActivityDayDto = {
  date: string;
  count: number;
};

export type OfficeImageDto = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  width: number | null;
  height: number | null;
};

export type OfficeImageSearchDto = {
  query: string;
  searchUrl: string;
  images: OfficeImageDto[];
};

export type CreateApplicationRequest = {
  jobPostingId: string;
  externalApplicationTrackingUrl?: string | null;
};

export type CreateManualApplicationRequest = {
  company: string;
  role: string;
  jobPostingUrl?: string | null;
  externalApplicationTrackingUrl?: string | null;
  status?: ApplicationStatus;
};

export type UpdateApplicationStatusRequest = {
  status: ApplicationStatus;
};
