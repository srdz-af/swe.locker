import { prisma } from "../db/prisma.js";
import { getSourceDefinitions } from "../sources/sourceDefinitions.js";

export async function ensureSourceConfig() {
  const [sourceConfig] = await ensureSourceConfigs();
  return sourceConfig;
}

export async function ensureSourceConfigs() {
  const definitions = getSourceDefinitions();
  const sourceConfigs = [];

  for (const definition of definitions) {
    sourceConfigs.push(
      await prisma.sourceConfig.upsert({
        where: {
          sourceKey: definition.sourceKey
        },
        create: {
          sourceKey: definition.sourceKey,
          displayName: definition.displayName,
          repositoryUrl: definition.repositoryUrl,
          repositoryCloneUrl: definition.repositoryCloneUrl,
          repositoryBranch: definition.repositoryBranch,
          repositoryFilePath: definition.repositoryFilePath,
          rawReadmeUrl: definition.rawReadmeUrl,
          season: definition.season,
          fetchIntervalHours: definition.fetchIntervalHours,
          enabled: true
        },
        update: {
          displayName: definition.displayName,
          repositoryUrl: definition.repositoryUrl,
          repositoryCloneUrl: definition.repositoryCloneUrl,
          repositoryBranch: definition.repositoryBranch,
          repositoryFilePath: definition.repositoryFilePath,
          rawReadmeUrl: definition.rawReadmeUrl,
          season: definition.season,
          fetchIntervalHours: definition.fetchIntervalHours,
          enabled: true
        }
      })
    );
  }

  return sourceConfigs;
}
