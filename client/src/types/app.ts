import type {
  ApplicationStatus,
  JobPostingDto,
  ResumeGraderMetricDto,
  ResumeRunDto,
  ResumeTier
} from "../../../shared/src/index";

export type ThemeMode = "light" | "dark";

export type PostingTagFilter = {
  id: string;
  label: string;
  matches: (posting: JobPostingDto) => boolean;
};

export type PostingFacetFilter = PostingTagFilter;

export type ManualApplicationFormState = {
  company: string;
  role: string;
  jobPostingUrl: string;
  externalApplicationTrackingUrl: string;
  status: ApplicationStatus;
};

export type { ResumeTier };

export type ResumeGraderMetric = ResumeGraderMetricDto;

export type ResumeGraderRun = ResumeRunDto;
