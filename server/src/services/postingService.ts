import type { Prisma } from "../generated/prisma/client.js";
import { LOCAL_OWNER_KEY, normalizeLocation, normalizeSearchText } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { emptyApplicationStatusCounts, isNewSinceYesterday, toFetchRunDto, toJobPostingDto } from "./mappers.js";

export type PostingFilters = {
  search?: string;
  category?: string;
  location?: string;
  newOnly?: boolean;
  followedOnly?: boolean;
  activeOnly?: boolean;
};

export async function listPostings(filters: PostingFilters) {
  const followedCompanies = await prisma.followedCompany.findMany({
    where: { ownerKey: LOCAL_OWNER_KEY }
  });
  const followedCompanyNames = new Set(followedCompanies.map((company) => company.normalizedCompanyName));
  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      jobPostingId: {
        not: null
      }
    },
    select: {
      id: true,
      jobPostingId: true
    }
  });
  const trackedApplicationIdsByPostingId = new Map(
    applications
      .filter((application) => isString(application.jobPostingId))
      .map((application) => [application.jobPostingId as string, application.id])
  );

  const where: Prisma.JobPostingWhereInput = {};
  if (filters.activeOnly ?? true) {
    where.isActive = true;
  }
  if (filters.category) {
    where.category = filters.category;
  }

  const postings = await prisma.jobPosting.findMany({
    where,
    orderBy: [{ firstSeenAt: "desc" }, { company: "asc" }, { role: "asc" }]
  });

  return postings
    .filter((posting) => {
      if (filters.newOnly && !isNewSinceYesterday(posting.firstSeenAt)) {
        return false;
      }
      if (filters.followedOnly && !followedCompanyNames.has(posting.normalizedCompanyName)) {
        return false;
      }
      if (filters.location) {
        const target = normalizeLocation(filters.location);
        if (!posting.locationText.toLowerCase().includes(target)) {
          return false;
        }
      }
      if (filters.search) {
        const target = normalizeSearchText(filters.search);
        const searchable = normalizeSearchText(`${posting.company} ${posting.role} ${posting.category} ${posting.locationText}`);
        if (!searchable.includes(target)) {
          return false;
        }
      }
      return true;
    })
    .map((posting) =>
      toJobPostingDto(posting, {
        followedCompanyNames,
        trackedApplicationIdsByPostingId
      })
    );
}

export async function getDashboardStats() {
  const [postings, followedCompanies, applications, lastFetchRun] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { isActive: true },
      select: {
        firstSeenAt: true,
        normalizedCompanyName: true
      }
    }),
    prisma.followedCompany.findMany({
      where: { ownerKey: LOCAL_OWNER_KEY },
      select: { normalizedCompanyName: true }
    }),
    prisma.application.findMany({
      where: { ownerKey: LOCAL_OWNER_KEY },
      select: { status: true }
    }),
    prisma.fetchRun.findFirst({
      orderBy: {
        startedAt: "desc"
      }
    })
  ]);

  const followedCompanyNames = new Set(followedCompanies.map((company) => company.normalizedCompanyName));
  const applicationsByStatus = emptyApplicationStatusCounts();
  for (const application of applications) {
    applicationsByStatus[application.status] += 1;
  }

  return {
    totalPostings: postings.length,
    newPostingsToday: postings.filter((posting) => isNewSinceYesterday(posting.firstSeenAt)).length,
    followedCompanyPostings: postings.filter((posting) => followedCompanyNames.has(posting.normalizedCompanyName)).length,
    trackedApplications: applications.length,
    applicationsByStatus,
    lastFetchRun: lastFetchRun ? toFetchRunDto(lastFetchRun) : null
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
