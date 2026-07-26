-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SYNCING', 'SYNCED', 'FAILED', 'NEEDS_REVIEW', 'CANCELLED');

-- AlterTable: add new columns to Record
ALTER TABLE "Record" ADD COLUMN "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Record" ADD COLUMN "syncAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Record" ADD COLUMN "lastSyncError" TEXT;
ALTER TABLE "Record" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "Record" ADD COLUMN "syncedAt" TIMESTAMP(3);
ALTER TABLE "Record" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "Record" ADD COLUMN "claimedBy" TEXT;
ALTER TABLE "Record" ADD COLUMN "batchKey" TEXT;
ALTER TABLE "Record" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Record" ADD COLUMN "confirmedBy" TEXT;
ALTER TABLE "Record" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex on Record.syncStatus
CREATE INDEX "Record_syncStatus_idx" ON "Record"("syncStatus");

-- CreateTable: SyncLog
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "machine" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on SyncLog
CREATE INDEX "SyncLog_recordId_createdAt_idx" ON "SyncLog"("recordId", "createdAt");
CREATE INDEX "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");
