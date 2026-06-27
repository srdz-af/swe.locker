-- AlterTable
ALTER TABLE "Application" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Application_archivedAt_idx" ON "Application"("archivedAt");
