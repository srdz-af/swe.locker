-- DropIndex
DROP INDEX "JobPosting_normalizedKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_sourceConfigId_normalizedKey_key" ON "JobPosting"("sourceConfigId", "normalizedKey");
