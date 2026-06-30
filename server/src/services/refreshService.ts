import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import type { SourceConfig } from "../generated/prisma/client.js";
import { parseSimplifyJobsReadme } from "../parser/simplifyJobsParser.js";
import { toFetchRunDto, toSourceConfigDto } from "./mappers.js";
import { ensureSourceConfigs } from "./sourceConfigService.js";

type SourceRefreshResult = {
  sourceConfig: ReturnType<typeof toSourceConfigDto>;
  fetchRun: ReturnType<typeof toFetchRunDto>;
};

type RefreshResult = {
  sourceConfigs: Array<ReturnType<typeof toSourceConfigDto>>;
  fetchRuns: Array<ReturnType<typeof toFetchRunDto>>;
};

let refreshInFlight: Promise<RefreshResult> | null = null;

export async function refreshSource() {
  if (refreshInFlight) {
    throw new HttpError(409, "Refresh already in progress.");
  }

  refreshInFlight = runRefresh();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function refreshSourceIfEmpty() {
  const sourceConfigs = await ensureSourceConfigs();
  const sourceStates = await Promise.all(
    sourceConfigs.map(async (sourceConfig) => ({
      postingCount: await prisma.jobPosting.count({
        where: {
          sourceConfigId: sourceConfig.id
        }
      }),
      successfulFetchCount: await prisma.fetchRun.count({
        where: {
          sourceConfigId: sourceConfig.id,
          status: "SUCCESS"
        }
      })
    }))
  );

  if (sourceStates.some((sourceState) => sourceState.postingCount === 0 && sourceState.successfulFetchCount === 0)) {
    await refreshSource();
  }
}

async function runRefresh(): Promise<RefreshResult> {
  const sourceConfigs = (await ensureSourceConfigs()).filter((sourceConfig) => sourceConfig.enabled);
  const results: SourceRefreshResult[] = [];
  const errors: string[] = [];

  for (const sourceConfig of sourceConfigs) {
    try {
      results.push(await refreshSingleSource(sourceConfig));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Refresh failed for ${sourceConfig.displayName}.`);
    }
  }

  if (errors.length > 0) {
    throw new HttpError(500, errors.join(" "));
  }

  return {
    sourceConfigs: results.map((result) => result.sourceConfig),
    fetchRuns: results.map((result) => result.fetchRun)
  };
}

async function refreshSingleSource(sourceConfig: SourceConfig): Promise<SourceRefreshResult> {
  const fetchRun = await prisma.fetchRun.create({
    data: {
      sourceConfigId: sourceConfig.id,
      status: "RUNNING"
    }
  });

  try {
    const response = await fetch(sourceConfig.rawReadmeUrl, {
      headers: {
        "User-Agent": "swe.locker local internship tracker"
      }
    });

    if (!response.ok) {
      throw new Error(`README fetch failed with HTTP ${response.status}`);
    }

    const markdown = await response.text();
    const parsedPostings = parseSimplifyJobsReadme(markdown, sourceConfig.season);
    const seenKeys = new Set<string>();
    let newPostings = 0;
    let updatedPostings = 0;
    const now = new Date();

    for (const posting of parsedPostings) {
      seenKeys.add(posting.normalizedKey);
      const existingPosting = await prisma.jobPosting.findUnique({
        where: {
          normalizedKey: posting.normalizedKey
        }
      });

      if (existingPosting) {
        updatedPostings += 1;
        await prisma.jobPosting.update({
          where: {
            id: existingPosting.id
          },
          data: {
            sourceConfigId: sourceConfig.id,
            season: posting.season,
            category: posting.category,
            company: posting.company,
            normalizedCompanyName: posting.normalizedCompanyName,
            role: posting.role,
            locations: JSON.stringify(posting.locations),
            locationText: posting.locations.join(" | "),
            applicationUrls: JSON.stringify(posting.applicationUrls),
            primaryApplicationUrl: posting.primaryApplicationUrl,
            simplifyUrl: posting.simplifyUrl,
            ageText: posting.ageText,
            rawRowContent: posting.rawRowContent,
            lastSeenAt: now,
            isNewToday: isNewSince(existingPosting.firstSeenAt, now),
            isActive: true,
            doesNotOfferSponsorship: posting.doesNotOfferSponsorship,
            requiresUsCitizenship: posting.requiresUsCitizenship,
            isClosed: posting.isClosed,
            isFaang: posting.isFaang,
            requiresAdvancedDegree: posting.requiresAdvancedDegree
          }
        });
      } else {
        newPostings += 1;
        await prisma.jobPosting.create({
          data: {
            sourceConfigId: sourceConfig.id,
            season: posting.season,
            category: posting.category,
            company: posting.company,
            normalizedCompanyName: posting.normalizedCompanyName,
            role: posting.role,
            locations: JSON.stringify(posting.locations),
            locationText: posting.locations.join(" | "),
            applicationUrls: JSON.stringify(posting.applicationUrls),
            primaryApplicationUrl: posting.primaryApplicationUrl,
            simplifyUrl: posting.simplifyUrl,
            ageText: posting.ageText,
            normalizedKey: posting.normalizedKey,
            rawRowContent: posting.rawRowContent,
            firstSeenAt: now,
            lastSeenAt: now,
            isNewToday: true,
            isActive: true,
            doesNotOfferSponsorship: posting.doesNotOfferSponsorship,
            requiresUsCitizenship: posting.requiresUsCitizenship,
            isClosed: posting.isClosed,
            isFaang: posting.isFaang,
            requiresAdvancedDegree: posting.requiresAdvancedDegree
          }
        });
      }
    }

    await markMissingPostingsInactive(sourceConfig.id, seenKeys);

    const completedFetchRun = await prisma.fetchRun.update({
      where: {
        id: fetchRun.id
      },
      data: {
        completedAt: new Date(),
        status: "SUCCESS",
        postingsFound: parsedPostings.length,
        newPostings,
        updatedPostings
      }
    });

    return {
      sourceConfig: toSourceConfigDto(sourceConfig),
      fetchRun: toFetchRunDto(completedFetchRun)
    };
  } catch (error) {
    const completedFetchRun = await prisma.fetchRun.update({
      where: {
        id: fetchRun.id
      },
      data: {
        completedAt: new Date(),
        status: "FAILURE",
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error"
      }
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, toFetchRunDto(completedFetchRun).errorMessage ?? "Refresh failed.");
  }
}

async function markMissingPostingsInactive(sourceConfigId: string, seenKeys: Set<string>) {
  const activePostings = await prisma.jobPosting.findMany({
    where: {
      sourceConfigId,
      isActive: true
    },
    select: {
      id: true,
      normalizedKey: true
    }
  });

  const missingIds = activePostings.filter((posting) => !seenKeys.has(posting.normalizedKey)).map((posting) => posting.id);

  if (missingIds.length > 0) {
    await prisma.jobPosting.updateMany({
      where: {
        id: {
          in: missingIds
        }
      },
      data: {
        isActive: false,
        isNewToday: false
      }
    });
  }
}

function isNewSince(firstSeenAt: Date, now: Date) {
  return firstSeenAt.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
}
