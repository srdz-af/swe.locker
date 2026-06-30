-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL DEFAULT 'local',
    "jobPostingId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "jobPostingUrl" TEXT,
    "externalApplicationTrackingUrl" TEXT,
    "notes" TEXT,
    "interviewDates" TEXT NOT NULL DEFAULT '[]',
    "links" TEXT NOT NULL DEFAULT '[]',
    "submittedResumeRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_submittedResumeRunId_fkey" FOREIGN KEY ("submittedResumeRunId") REFERENCES "ResumeRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("archivedAt", "company", "createdAt", "externalApplicationTrackingUrl", "id", "interviewDates", "jobPostingId", "jobPostingUrl", "links", "notes", "ownerKey", "role", "status", "updatedAt") SELECT "archivedAt", "company", "createdAt", "externalApplicationTrackingUrl", "id", "interviewDates", "jobPostingId", "jobPostingUrl", "links", "notes", "ownerKey", "role", "status", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_ownerKey_idx" ON "Application"("ownerKey");
CREATE INDEX "Application_jobPostingId_idx" ON "Application"("jobPostingId");
CREATE INDEX "Application_submittedResumeRunId_idx" ON "Application"("submittedResumeRunId");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE INDEX "Application_archivedAt_idx" ON "Application"("archivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
