import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  CreateResumeRunRequest,
  CreateApplicationRequest,
  CreateManualApplicationRequest,
  FollowedCompanyDto,
  JobPostingDto,
  RestoreApplicationSnapshotRequest,
  RestoreResumeRunSnapshotRequest,
  ResumeRunDto,
  SourceConfigDto,
  UpdateApplicationDetailsRequest,
  UpdateApplicationStatusRequest
} from "../../shared/src/index";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export { apiBaseUrl };

export async function getSourceConfig() {
  return request<SourceConfigDto>("/source-config");
}

export async function getSourceConfigs() {
  return request<SourceConfigDto[]>("/source-configs");
}

export async function getPostings() {
  return request<JobPostingDto[]>("/postings");
}

export async function followCompany(companyName: string) {
  return request<FollowedCompanyDto>("/followed-companies", {
    method: "POST",
    body: JSON.stringify({ companyName })
  });
}

export async function unfollowCompany(normalizedCompanyName: string) {
  await request<void>(`/followed-companies/${encodeURIComponent(normalizedCompanyName)}`, {
    method: "DELETE"
  });
}

export async function listApplications(options: { includeArchived?: boolean } = {}) {
  const query = options.includeArchived ? "?includeArchived=true" : "";
  return request<ApplicationDto[]>(`/applications${query}`);
}

export async function getApplicationActivity(year?: number) {
  const query = year ? `?year=${encodeURIComponent(String(year))}` : "";
  return request<ApplicationActivityDayDto[]>(`/applications/activity${query}`);
}

export async function createApplication(jobPostingId: string, externalApplicationTrackingUrl?: string | null) {
  const body: CreateApplicationRequest = {
    jobPostingId,
    externalApplicationTrackingUrl: normalizeExternalApplicationTrackingUrl(externalApplicationTrackingUrl)
  };

  return request<ApplicationDto>("/applications", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function createManualApplication(input: CreateManualApplicationRequest) {
  const body: CreateManualApplicationRequest = {
    company: input.company.trim(),
    role: input.role.trim(),
    jobPostingUrl: normalizeExternalApplicationTrackingUrl(input.jobPostingUrl),
    externalApplicationTrackingUrl: normalizeExternalApplicationTrackingUrl(input.externalApplicationTrackingUrl),
    status: input.status
  };

  return request<ApplicationDto>("/applications", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function normalizeExternalApplicationTrackingUrl(value?: string | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const body: UpdateApplicationStatusRequest = { status };

  return request<ApplicationDto>(`/applications/${encodeURIComponent(applicationId)}/status`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function updateApplicationDetails(applicationId: string, input: UpdateApplicationDetailsRequest) {
  return request<ApplicationDto>(`/applications/${encodeURIComponent(applicationId)}/details`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteApplication(applicationId: string) {
  await request<void>(`/applications/${encodeURIComponent(applicationId)}`, {
    method: "DELETE"
  });
}

export async function purgeArchivedApplications() {
  return request<{ deletedCount: number }>("/applications/archived", {
    method: "DELETE"
  });
}

export async function archiveApplication(applicationId: string) {
  return request<ApplicationDto>(`/applications/${encodeURIComponent(applicationId)}/archive`, {
    method: "PATCH"
  });
}

export async function unarchiveApplication(applicationId: string) {
  return request<ApplicationDto>(`/applications/${encodeURIComponent(applicationId)}/unarchive`, {
    method: "PATCH"
  });
}

export async function restoreApplicationSnapshot(input: RestoreApplicationSnapshotRequest) {
  return request<ApplicationDto>("/applications/restore", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listResumeRuns() {
  return request<ResumeRunDto[]>("/resume-runs");
}

export async function createResumeRun(input: CreateResumeRunRequest) {
  return request<ResumeRunDto>("/resume-runs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteResumeRun(resumeRunId: string) {
  await request<void>(`/resume-runs/${encodeURIComponent(resumeRunId)}`, {
    method: "DELETE"
  });
}

export async function restoreResumeRunSnapshot(input: RestoreResumeRunSnapshotRequest) {
  return request<ResumeRunDto>("/resume-runs/restore", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `API request failed with HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
