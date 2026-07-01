-- AlterTable
ALTER TABLE "SourceConfig" ADD COLUMN "repositoryCloneUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceConfig" ADD COLUMN "repositoryBranch" TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE "SourceConfig" ADD COLUMN "repositoryFilePath" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceConfig" ADD COLUMN "lastRemoteCommitSha" TEXT;
ALTER TABLE "SourceConfig" ADD COLUMN "lastContentSha" TEXT;
ALTER TABLE "SourceConfig" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "SourceConfig" ADD COLUMN "lastFetchedAt" DATETIME;
ALTER TABLE "SourceConfig" ADD COLUMN "lastParsedAt" DATETIME;

-- CreateIndex
CREATE INDEX "SourceConfig_repositoryCloneUrl_repositoryBranch_idx" ON "SourceConfig"("repositoryCloneUrl", "repositoryBranch");
