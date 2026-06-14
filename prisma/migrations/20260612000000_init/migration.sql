-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contractor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idCard" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "job" TEXT,
    "zone" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "manDays" INTEGER NOT NULL,
    "accident" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_credential_key" ON "User"("credential");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
