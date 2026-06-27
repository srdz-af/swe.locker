-- CreateTable
CREATE TABLE "SourceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "rawReadmeUrl" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "fetchIntervalHours" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceConfigId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "normalizedCompanyName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "locations" TEXT NOT NULL,
    "locationText" TEXT NOT NULL,
    "applicationUrls" TEXT NOT NULL,
    "primaryApplicationUrl" TEXT,
    "simplifyUrl" TEXT,
    "ageText" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "rawRowContent" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "isNewToday" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "doesNotOfferSponsorship" BOOLEAN NOT NULL DEFAULT false,
    "requiresUsCitizenship" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isFaang" BOOLEAN NOT NULL DEFAULT false,
    "requiresAdvancedDegree" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobPosting_sourceConfigId_fkey" FOREIGN KEY ("sourceConfigId") REFERENCES "SourceConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FetchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceConfigId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "postingsFound" INTEGER NOT NULL DEFAULT 0,
    "newPostings" INTEGER NOT NULL DEFAULT 0,
    "updatedPostings" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "FetchRun_sourceConfigId_fkey" FOREIGN KEY ("sourceConfigId") REFERENCES "SourceConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowedCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL DEFAULT 'local',
    "companyName" TEXT NOT NULL,
    "normalizedCompanyName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL DEFAULT 'local',
    "jobPostingId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "jobPostingUrl" TEXT,
    "externalApplicationTrackingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL DEFAULT 'local',
    "applicationId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceConfig_sourceKey_key" ON "SourceConfig"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_normalizedKey_key" ON "JobPosting"("normalizedKey");

-- CreateIndex
CREATE INDEX "JobPosting_sourceConfigId_idx" ON "JobPosting"("sourceConfigId");

-- CreateIndex
CREATE INDEX "JobPosting_season_idx" ON "JobPosting"("season");

-- CreateIndex
CREATE INDEX "JobPosting_category_idx" ON "JobPosting"("category");

-- CreateIndex
CREATE INDEX "JobPosting_normalizedCompanyName_idx" ON "JobPosting"("normalizedCompanyName");

-- CreateIndex
CREATE INDEX "JobPosting_firstSeenAt_idx" ON "JobPosting"("firstSeenAt");

-- CreateIndex
CREATE INDEX "JobPosting_isActive_idx" ON "JobPosting"("isActive");

-- CreateIndex
CREATE INDEX "JobPosting_isNewToday_idx" ON "JobPosting"("isNewToday");

-- CreateIndex
CREATE INDEX "FetchRun_sourceConfigId_idx" ON "FetchRun"("sourceConfigId");

-- CreateIndex
CREATE INDEX "FetchRun_startedAt_idx" ON "FetchRun"("startedAt");

-- CreateIndex
CREATE INDEX "FetchRun_status_idx" ON "FetchRun"("status");

-- CreateIndex
CREATE INDEX "FollowedCompany_ownerKey_idx" ON "FollowedCompany"("ownerKey");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedCompany_ownerKey_normalizedCompanyName_key" ON "FollowedCompany"("ownerKey", "normalizedCompanyName");

-- CreateIndex
CREATE INDEX "Application_ownerKey_idx" ON "Application"("ownerKey");

-- CreateIndex
CREATE INDEX "Application_jobPostingId_idx" ON "Application"("jobPostingId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "ApplicationEvent_ownerKey_idx" ON "ApplicationEvent"("ownerKey");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_idx" ON "ApplicationEvent"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_eventDate_idx" ON "ApplicationEvent"("eventDate");
