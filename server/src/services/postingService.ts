import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { toJobPostingDto } from "./mappers.js";

export async function listPostings() {
  const followedCompanies = await prisma.followedCompany.findMany({
    where: { ownerKey: LOCAL_OWNER_KEY }
  });
  const followedCompanyNames = new Set(followedCompanies.map((company) => company.normalizedCompanyName));
  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      archivedAt: null,
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

  const postings = await prisma.jobPosting.findMany({
    where: {
      isActive: true
    },
    orderBy: [{ isClosed: "asc" }, { firstSeenAt: "desc" }, { company: "asc" }, { role: "asc" }]
  });

  return postings.map((posting) =>
    toJobPostingDto(posting, {
      followedCompanyNames,
      trackedApplicationIdsByPostingId
    })
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
