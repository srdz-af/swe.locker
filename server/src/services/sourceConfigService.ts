import { config } from "../config.js";
import { SIMPLIFY_SOURCE_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";

export async function ensureSourceConfig() {
  return prisma.sourceConfig.upsert({
    where: {
      sourceKey: SIMPLIFY_SOURCE_KEY
    },
    create: {
      sourceKey: SIMPLIFY_SOURCE_KEY,
      displayName: config.sourceDisplayName,
      repositoryUrl: config.sourceRepositoryUrl,
      rawReadmeUrl: config.rawReadmeUrl,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours,
      enabled: true
    },
    update: {
      displayName: config.sourceDisplayName,
      repositoryUrl: config.sourceRepositoryUrl,
      rawReadmeUrl: config.rawReadmeUrl,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours,
      enabled: true
    }
  });
}
