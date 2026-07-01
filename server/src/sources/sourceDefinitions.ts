import { z } from "zod";
import { config } from "../config.js";
import {
  SIMPLIFY_INACTIVE_SOURCE_KEY,
  SIMPLIFY_OFF_SEASON_SOURCE_KEY,
  SIMPLIFY_SOURCE_KEY
} from "../domain/normalize.js";

const sourceTableSchema = z.object({
  company: z.array(z.string().trim().min(1)).min(1),
  role: z.array(z.string().trim().min(1)).min(1),
  location: z.array(z.string().trim().min(1)).min(1),
  application: z.array(z.string().trim().min(1)).min(1),
  age: z.array(z.string().trim().min(1)).min(1)
}).strict();

const sourceDefinitionSchema = z.object({
  sourceKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  repositoryUrl: z.string().url(),
  repositoryCloneUrl: z.string().url(),
  repositoryBranch: z.string().trim().min(1),
  repositoryFilePath: z.string().trim().min(1),
  rawReadmeUrl: z.string().url(),
  season: z.string().trim().min(1),
  fetchIntervalHours: z.number().int().positive(),
  parser: z.enum(["simplify-readme"]),
  includeClosedPostings: z.boolean(),
  tableSchema: sourceTableSchema
}).strict();

export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type SourceTableSchema = z.infer<typeof sourceTableSchema>;

const simplifyJobsRepositoryUrl = "https://github.com/SimplifyJobs/Summer2026-Internships";
const simplifyJobsRepositoryCloneUrl = `${simplifyJobsRepositoryUrl}.git`;
const simplifyJobsRepositoryBranch = "dev";
const simplifyJobsRawBaseUrl = "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev";
const simplifyJobsTableSchema: SourceTableSchema = {
  company: ["company"],
  role: ["role"],
  location: ["location"],
  application: ["application"],
  age: ["age"]
};

export function getSourceDefinitions() {
  return sourceDefinitionSchema.array().parse([
    {
      sourceKey: SIMPLIFY_SOURCE_KEY,
      displayName: config.sourceDisplayName,
      repositoryUrl: config.sourceRepositoryUrl,
      repositoryCloneUrl: simplifyJobsRepositoryCloneUrl,
      repositoryBranch: simplifyJobsRepositoryBranch,
      repositoryFilePath: "README.md",
      rawReadmeUrl: config.rawReadmeUrl,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours,
      parser: "simplify-readme",
      includeClosedPostings: false,
      tableSchema: simplifyJobsTableSchema
    },
    {
      sourceKey: SIMPLIFY_OFF_SEASON_SOURCE_KEY,
      displayName: "SimplifyJobs Summer 2026 Internships Off-Season",
      repositoryUrl: `${simplifyJobsRepositoryUrl}/blob/dev/README-Off-Season.md`,
      repositoryCloneUrl: simplifyJobsRepositoryCloneUrl,
      repositoryBranch: simplifyJobsRepositoryBranch,
      repositoryFilePath: "README-Off-Season.md",
      rawReadmeUrl: `${simplifyJobsRawBaseUrl}/README-Off-Season.md`,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours,
      parser: "simplify-readme",
      includeClosedPostings: false,
      tableSchema: simplifyJobsTableSchema
    },
    {
      sourceKey: SIMPLIFY_INACTIVE_SOURCE_KEY,
      displayName: "SimplifyJobs Summer 2026 Internships Inactive",
      repositoryUrl: `${simplifyJobsRepositoryUrl}/blob/dev/README-Inactive.md`,
      repositoryCloneUrl: simplifyJobsRepositoryCloneUrl,
      repositoryBranch: simplifyJobsRepositoryBranch,
      repositoryFilePath: "README-Inactive.md",
      rawReadmeUrl: `${simplifyJobsRawBaseUrl}/README-Inactive.md`,
      season: config.seasonLabel,
      fetchIntervalHours: config.fetchIntervalHours,
      parser: "simplify-readme",
      includeClosedPostings: true,
      tableSchema: simplifyJobsTableSchema
    }
  ]);
}

export function getSourceDefinition(sourceKey: string) {
  return getSourceDefinitions().find((sourceDefinition) => sourceDefinition.sourceKey === sourceKey) ?? null;
}
