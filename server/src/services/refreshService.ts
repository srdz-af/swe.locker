import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import type { FetchRun, SourceConfig } from "../generated/prisma/client.js";
import { parseSimplifyJobsReadme, type ParsedPosting } from "../parser/simplifyJobsParser.js";
import { loadSourceRepositoryFiles, type SourceRepositorySnapshot } from "../sources/gitSourceCache.js";
import { getSourceDefinition, type SourceDefinition } from "../sources/sourceDefinitions.js";
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

type SourceConfigWithDefinition = {
  sourceConfig: SourceConfig;
  sourceDefinition: SourceDefinition;
};

type SourceRepositoryGroup = {
  repositoryCloneUrl: string;
  repositoryBranch: string;
  sources: SourceConfigWithDefinition[];
};

type PostingSyncResult = {
  newPostings: number;
  updatedPostings: number;
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
  const sourceEntries: SourceConfigWithDefinition[] = [];
  const results: SourceRefreshResult[] = [];
  const errors: string[] = [];

  for (const sourceConfig of sourceConfigs) {
    const sourceDefinition = getSourceDefinition(sourceConfig.sourceKey);
    if (!sourceDefinition) {
      errors.push(`Missing source definition for ${sourceConfig.sourceKey}.`);
      continue;
    }

    sourceEntries.push({
      sourceConfig,
      sourceDefinition
    });
  }

  for (const group of groupSourcesByRepository(sourceEntries)) {
    try {
      results.push(...(await refreshRepositoryGroup(group)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Refresh failed for ${group.repositoryCloneUrl}.`);
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

function groupSourcesByRepository(sourceEntries: SourceConfigWithDefinition[]) {
  const groups = new Map<string, SourceRepositoryGroup>();

  for (const source of sourceEntries) {
    const key = `${source.sourceDefinition.repositoryCloneUrl}\u0000${source.sourceDefinition.repositoryBranch}`;
    const group =
      groups.get(key) ??
      {
        repositoryCloneUrl: source.sourceDefinition.repositoryCloneUrl,
        repositoryBranch: source.sourceDefinition.repositoryBranch,
        sources: []
      };

    group.sources.push(source);
    groups.set(key, group);
  }

  return [...groups.values()];
}

async function refreshRepositoryGroup(group: SourceRepositoryGroup): Promise<SourceRefreshResult[]> {
  const fetchRuns = new Map<string, FetchRun>();
  const results: SourceRefreshResult[] = [];
  const errors: string[] = [];

  for (const { sourceConfig } of group.sources) {
    fetchRuns.set(
      sourceConfig.id,
      await prisma.fetchRun.create({
        data: {
          sourceConfigId: sourceConfig.id,
          status: "RUNNING"
        }
      })
    );
  }

  let repositorySnapshot: SourceRepositorySnapshot;

  try {
    repositorySnapshot = await loadSourceRepositoryFiles({
      repositoryCloneUrl: group.repositoryCloneUrl,
      repositoryBranch: group.repositoryBranch,
      filePaths: [...new Set(group.sources.map(({ sourceDefinition }) => sourceDefinition.repositoryFilePath))]
    });
  } catch (error) {
    await Promise.all(
      [...fetchRuns.values()].map((fetchRun) => markFetchRunFailed(fetchRun, error))
    );
    throw error;
  }

  for (const source of group.sources) {
    const fetchRun = fetchRuns.get(source.sourceConfig.id);
    if (!fetchRun) {
      errors.push(`Missing fetch run for ${source.sourceConfig.displayName}.`);
      continue;
    }

    try {
      results.push(await refreshSourceFromRepositoryFile(source, fetchRun, repositorySnapshot));
    } catch (error) {
      await markFetchRunFailed(fetchRun, error);
      errors.push(error instanceof Error ? error.message : `Refresh failed for ${source.sourceConfig.displayName}.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  return results;
}

async function refreshSourceFromRepositoryFile(
  source: SourceConfigWithDefinition,
  fetchRun: FetchRun,
  repositorySnapshot: SourceRepositorySnapshot
): Promise<SourceRefreshResult> {
  const file = repositorySnapshot.files.get(source.sourceDefinition.repositoryFilePath);
  if (!file) {
    throw new Error(`Missing ${source.sourceDefinition.repositoryFilePath} in ${repositorySnapshot.repositoryPath}.`);
  }

  const now = new Date();
  const checkedSourceConfig = await updateSourceRepositoryState(source.sourceConfig, repositorySnapshot, now);

  if (!(await shouldParseSourceFile(checkedSourceConfig, file.blobSha))) {
    const completedFetchRun = await prisma.fetchRun.update({
      where: {
        id: fetchRun.id
      },
      data: {
        completedAt: new Date(),
        status: "SUCCESS",
        postingsFound: 0,
        newPostings: 0,
        updatedPostings: 0
      }
    });

    return {
      sourceConfig: toSourceConfigDto(checkedSourceConfig),
      fetchRun: toFetchRunDto(completedFetchRun)
    };
  }

  const parsedPostings = parseSourcePostings(file.content, source.sourceDefinition, checkedSourceConfig.season).filter(
    (posting) => source.sourceDefinition.includeClosedPostings || !posting.isClosed
  );
  const { newPostings, updatedPostings } = await syncParsedPostings(checkedSourceConfig, parsedPostings, now);
  const parsedSourceConfig = await prisma.sourceConfig.update({
    where: {
      id: checkedSourceConfig.id
    },
    data: {
      lastContentSha: file.blobSha,
      lastParsedAt: now
    }
  });
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
    sourceConfig: toSourceConfigDto(parsedSourceConfig),
    fetchRun: toFetchRunDto(completedFetchRun)
  };
}

async function updateSourceRepositoryState(
  sourceConfig: SourceConfig,
  repositorySnapshot: SourceRepositorySnapshot,
  now: Date
) {
  return prisma.sourceConfig.update({
    where: {
      id: sourceConfig.id
    },
    data: {
      lastRemoteCommitSha: repositorySnapshot.remoteCommitSha,
      lastCheckedAt: now,
      ...(repositorySnapshot.fetched ? { lastFetchedAt: now } : {})
    }
  });
}

async function shouldParseSourceFile(sourceConfig: SourceConfig, blobSha: string) {
  if (sourceConfig.lastContentSha !== blobSha) {
    return true;
  }

  const [postingCount, successfulFetchCount] = await Promise.all([
    prisma.jobPosting.count({
      where: {
        sourceConfigId: sourceConfig.id
      }
    }),
    prisma.fetchRun.count({
      where: {
        sourceConfigId: sourceConfig.id,
        status: "SUCCESS"
      }
    })
  ]);

  return postingCount === 0 || successfulFetchCount === 0;
}

async function syncParsedPostings(
  sourceConfig: SourceConfig,
  parsedPostings: ParsedPosting[],
  now: Date
): Promise<PostingSyncResult> {
  const seenKeys = new Set<string>();
  let newPostings = 0;
  let updatedPostings = 0;

  for (const posting of parsedPostings) {
    seenKeys.add(posting.normalizedKey);
    const existingPosting = await prisma.jobPosting.findUnique({
      where: {
        sourceConfigId_normalizedKey: {
          sourceConfigId: sourceConfig.id,
          normalizedKey: posting.normalizedKey
        }
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

  return {
    newPostings,
    updatedPostings
  };
}

async function markFetchRunFailed(fetchRun: FetchRun, error: unknown) {
  return prisma.fetchRun.update({
    where: {
      id: fetchRun.id
    },
    data: {
      completedAt: new Date(),
      status: "FAILURE",
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error"
    }
  });
}

function parseSourcePostings(markdown: string, sourceDefinition: SourceDefinition, season: string) {
  switch (sourceDefinition.parser) {
    case "simplify-readme":
      return parseSimplifyJobsReadme(markdown, season, {
        tableSchema: sourceDefinition.tableSchema
      });
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
