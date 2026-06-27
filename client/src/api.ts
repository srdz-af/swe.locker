import type {
  ApplicationDto,
  DashboardStatsDto,
  FetchRunDto,
  FollowedCompanyDto,
  JobPostingDto,
  RefreshResultDto,
  SourceConfigDto
} from "../../shared/src/index";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export type PostingFilters = {
  search?: string;
  category?: string;
  location?: string;
  newOnly?: boolean;
  followedOnly?: boolean;
};

export { apiBaseUrl };

export async function getSourceConfig() {
  return request<SourceConfigDto>("/source-config");
}

export async function getPostings(filters: PostingFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== false) {
      params.set(key, String(value));
    }
  }

  return request<JobPostingDto[]>(`/postings${params.size ? `?${params}` : ""}`);
}

export async function getDashboardStats() {
  return request<DashboardStatsDto>("/dashboard-stats");
}

export async function refreshSource() {
  return request<RefreshResultDto>("/refresh", {
    method: "POST"
  });
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

export async function createApplication(jobPostingId: string) {
  return request<ApplicationDto>("/applications", {
    method: "POST",
    body: JSON.stringify({ jobPostingId })
  });
}

export async function deleteApplication(applicationId: string) {
  await request<void>(`/applications/${encodeURIComponent(applicationId)}`, {
    method: "DELETE"
  });
}

export async function getFetchRuns() {
  return request<FetchRunDto[]>("/fetch-runs");
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
