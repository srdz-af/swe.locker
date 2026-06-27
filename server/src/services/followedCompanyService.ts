import { LOCAL_OWNER_KEY, normalizeCompanyName } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { toFollowedCompanyDto } from "./mappers.js";

export async function listFollowedCompanies() {
  const followedCompanies = await prisma.followedCompany.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY
    },
    orderBy: {
      companyName: "asc"
    }
  });

  return followedCompanies.map(toFollowedCompanyDto);
}

export async function followCompany(companyName: string) {
  const trimmedCompanyName = companyName.trim();
  const normalizedCompanyName = normalizeCompanyName(trimmedCompanyName);

  if (!trimmedCompanyName || !normalizedCompanyName) {
    throw new Error("Company name is required.");
  }

  const followedCompany = await prisma.followedCompany.upsert({
    where: {
      ownerKey_normalizedCompanyName: {
        ownerKey: LOCAL_OWNER_KEY,
        normalizedCompanyName
      }
    },
    create: {
      ownerKey: LOCAL_OWNER_KEY,
      companyName: trimmedCompanyName,
      normalizedCompanyName
    },
    update: {
      companyName: trimmedCompanyName
    }
  });

  return toFollowedCompanyDto(followedCompany);
}

export async function unfollowCompany(normalizedCompanyName: string) {
  const normalized = normalizeCompanyName(normalizedCompanyName);

  await prisma.followedCompany.deleteMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      normalizedCompanyName: normalized
    }
  });
}
