export type HealthResponse = {
  ok: boolean;
  service: string;
  timestamp: string;
};

export type ApplicationStatus = "APPLIED" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";
export type ApplicationEventType = "CREATED" | "STATUS_CHANGED";
export type ResumeTier = "S" | "A" | "B" | "C";

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
  sourceConfigId: string;
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
  notes: string | null;
  interviewDates: ApplicationInterviewDateDto[];
  links: ApplicationLinkDto[];
  submittedResumeRunId: string | null;
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

export type ApplicationLinkDto = {
  label: string | null;
  url: string;
};

export type ApplicationInterviewDateDto = {
  label: string | null;
  date: string;
};

export type ResumeGraderMetricDto = {
  label: string;
  value: number;
};

export type ResumeGraderCommentDto = {
  id: string;
  start: number;
  end: number;
  text: string;
};

export type ResumeGraderCommentGroupDto = {
  id: string;
  label: string;
  scoreLabel: string;
  comments: ResumeGraderCommentDto[];
};

export type ResumeGraderBulletMetricDto = {
  label: string;
  value: number;
  comments: ResumeGraderCommentDto[];
};

export type ResumeTextRangeDto = {
  start: number;
  end: number;
};

export type ResumeGraderBulletGradeDto = {
  id: string;
  label: string;
  grade: number;
  range: ResumeTextRangeDto;
  bulletIndex: number;
  metrics: ResumeGraderBulletMetricDto[];
};

export type ResumeGraderItemDto = {
  id: string;
  title: ResumeTextRangeDto | null;
  description: ResumeTextRangeDto | null;
  date: ResumeTextRangeDto | null;
  bullets: ResumeGraderBulletGradeDto[];
};

export type ResumeRunDto = {
  id: string;
  sourceName: string;
  parsedText: string;
  grade: number | null;
  tier: ResumeTier | null;
  verdict: string | null;
  metrics: ResumeGraderMetricDto[];
  comments: ResumeGraderCommentGroupDto[];
  resumeItems: ResumeGraderItemDto[];
  createdAt: string;
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

export type UpdateApplicationDetailsRequest = {
  notes?: string | null;
  interviewDates?: ApplicationInterviewDateDto[];
  links?: ApplicationLinkDto[];
  submittedResumeRunId?: string | null;
};

export type CreateResumeRunRequest = {
  id?: string;
  sourceName: string;
  parsedText: string;
  createdAt?: string;
};
