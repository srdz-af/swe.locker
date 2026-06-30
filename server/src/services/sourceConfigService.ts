import { config } from "../config.js";
import { SIMPLIFY_INACTIVE_SOURCE_KEY, SIMPLIFY_OFF_SEASON_SOURCE_KEY, SIMPLIFY_SOURCE_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";

type SourceConfigDefinition = {
  sourceKey: string;
  displayName: string;
  repositoryUrl: string;
  rawReadmeUrl: string;
  season: string;
  fetchIntervalHours: number;
};

const simplifyJobsRepositoryUrl = "https://github.com/SimplifyJobs/Summer2026-Internships";
const simplifyJobsRawBaseUrl = "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev";
const additionalSourceConfigs: SourceConfigDefinition[] = [
  {
    sourceKey: SIMPLIFY_OFF_SEASON_SOURCE_KEY,
    displayName: "SimplifyJobs Summer 2026 Internships Off-Season",
    repositoryUrl: `${simplifyJobsRepositoryUrl}/blob/dev/README-Off-Season.md`,
    rawReadmeUrl: `${simplifyJobsRawBaseUrl}/README-Off-Season.md`,
    season: config.seasonLabel,
    fetchIntervalHours: config.fetchIntervalHours
  },
  {
    sourceKey: SIMPLIFY_INACTIVE_SOURCE_KEY,
    displayName: "SimplifyJobs Summer 2026 Internships Inactive",
    repositoryUrl: `${simplifyJobsRepositoryUrl}/blob/dev/README-Inactive.md`,
    rawReadmeUrl: `${simplifyJobsRawBaseUrl}/README-Inactive.md`,
    season: config.seasonLabel,
    fetchIntervalHours: config.fetchIntervalHours
  }
];

export async function ensureSourceConfig() {
  const [sourceConfig] = await ensureSourceConfigs();
  return sourceConfig;
}

export async function ensureSourceConfigs() {
  const definitions = getSourceConfigDefinitions();
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
          rawReadmeUrl: definition.rawReadmeUrl,
          season: definition.season,
          fetchIntervalHours: definition.fetchIntervalHours,
          enabled: true
        },
        update: {
          displayName: definition.displayName,
          repositoryUrl: definition.repositoryUrl,
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

function getSourceConfigDefinitions(): SourceConfigDefinition[] {
  return [
    {
      sourceKey: SIMPLIFY_SOURCE_KEY,
      displayName: config.sourceDisplayName,
      repositoryUrl: config.sourceRepositoryUrl,
      rawReadmeUrl: config.rawReadmeUrl,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours
    },
    ...additionalSourceConfigs
  ];
}
