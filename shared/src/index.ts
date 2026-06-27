export type HealthResponse = {
  ok: boolean;
  service: string;
  timestamp: string;
};

export type ApplicationStatus = "APPLIED" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";

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
  createdAt: string;
  updatedAt: string;
};
