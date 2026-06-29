-- CreateTable
CREATE TABLE "ResumeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL DEFAULT 'local',
    "sourceName" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "grade" INTEGER,
    "tier" TEXT,
    "verdict" TEXT,
    "metrics" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ResumeRun_ownerKey_idx" ON "ResumeRun"("ownerKey");

-- CreateIndex
CREATE INDEX "ResumeRun_createdAt_idx" ON "ResumeRun"("createdAt");
