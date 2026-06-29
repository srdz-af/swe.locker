-- AlterTable
ALTER TABLE "Application" ADD COLUMN "notes" TEXT;
ALTER TABLE "Application" ADD COLUMN "interviewDates" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Application" ADD COLUMN "links" TEXT NOT NULL DEFAULT '[]';
