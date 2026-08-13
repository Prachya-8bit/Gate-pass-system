-- เพิ่มตารางคำขอนำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน + ตัวแยกชนิดใน SyncLog
--
-- migration นี้เป็น additive ล้วน ไม่มี ALTER/DROP อะไรของเดิม ตาราง Record และ
-- คอลัมน์เดิมไม่ถูกแตะ จึงทำให้ flow ลงทะเบียนคนงานพังไม่ได้ในทางโครงสร้าง
--
-- SyncLog.kind ใช้ DEFAULT 'record' เพราะทุกแถวก่อน migration นี้เป็นของ Record
-- และบน PostgreSQL 11+ การ ADD COLUMN NOT NULL DEFAULT เป็น metadata-only
-- ไม่ rewrite ตาราง จึงเร็วแม้ SyncLog จะโตแล้ว

-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'record';

-- CreateTable
CREATE TABLE "VehicleRequest" (
    "id" TEXT NOT NULL,
    "plant" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "plateProvince" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "contactTel" TEXT,
    "startDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncAttempt" INTEGER NOT NULL DEFAULT 0,
    "lastSyncError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "batchKey" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleRequest_syncStatus_idx" ON "VehicleRequest"("syncStatus");

-- AddForeignKey
ALTER TABLE "VehicleRequest" ADD CONSTRAINT "VehicleRequest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
