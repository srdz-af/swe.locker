import type {
  ApplicationActivityDayDto,
  ApplicationDto,
  ApplicationStatus,
  CreateApplicationRequest,
  FollowedCompanyDto,
  JobPostingDto,
  SourceConfigDto,
  UpdateApplicationStatusRequest
} from "../../shared/src/index";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export { apiBaseUrl };

export async function getSourceConfig() {
  return request<SourceConfigDto>("/source-config");
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

export async function listApplications() {
  return request<ApplicationDto[]>("/applications");
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

export async function deleteApplication(applicationId: string) {
  await request<void>(`/applications/${encodeURIComponent(applicationId)}`, {
    method: "DELETE"
  });
}

export async function archiveApplication(applicationId: string) {
  return request<ApplicationDto>(`/applications/${encodeURIComponent(applicationId)}/archive`, {
    method: "PATCH"
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
