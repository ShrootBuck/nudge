-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunState" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'VERIFIED', 'INCORRECT', 'UNSOLVABLE');

-- CreateEnum
CREATE TYPE "ReportResolution" AS ENUM ('VERIFIED', 'INCORRECT', 'REGENERATED');

-- CreateTable
CREATE TABLE "SiteState" (
    "id" TEXT NOT NULL,
    "currentModel" TEXT NOT NULL,

    CONSTRAINT "SiteState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "contestId" INTEGER NOT NULL,
    "index" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" INTEGER,
    "tags" TEXT[],
    "runState" "RunState" NOT NULL DEFAULT 'IDLE',
    "generationAttempts" INTEGER NOT NULL DEFAULT 0,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "generationStartedAt" TIMESTAMP(3),
    "generationClaimId" TEXT,
    "lastGenerationError" TEXT,
    "generatedByDisplayName" TEXT,
    "generatedByModel" TEXT,
    "generationResponseId" TEXT,
    "generationFinishReason" TEXT,
    "generationNativeFinishReason" TEXT,
    "generationProviderName" TEXT,
    "generationTotalTokens" INTEGER,
    "generationTranscriptUrl" TEXT,
    "preparedContent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGenerationUsage" (
    "id" TEXT NOT NULL,
    "problemId" TEXT,
    "providerName" TEXT NOT NULL,
    "model" TEXT,
    "responseId" TEXT NOT NULL,
    "totalTokens" INTEGER,
    "grantDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hint" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,

    CONSTRAINT "Hint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Editorial" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Editorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solution" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Solution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reason" TEXT,
    "digestedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" "ReportResolution",
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Problem_generationClaimId_key" ON "Problem"("generationClaimId");

-- CreateIndex
CREATE INDEX "Problem_runState_generationAttempts_idx" ON "Problem"("runState", "generationAttempts");

-- CreateIndex
CREATE INDEX "Problem_runState_generationStartedAt_idx" ON "Problem"("runState", "generationStartedAt");

-- CreateIndex
CREATE INDEX "Problem_requestedCount_updatedAt_idx" ON "Problem"("requestedCount", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_contestId_index_key" ON "Problem"("contestId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "AiGenerationUsage_responseId_key" ON "AiGenerationUsage"("responseId");

-- CreateIndex
CREATE INDEX "AiGenerationUsage_grantDate_providerName_idx" ON "AiGenerationUsage"("grantDate", "providerName");

-- CreateIndex
CREATE INDEX "AiGenerationUsage_problemId_createdAt_idx" ON "AiGenerationUsage"("problemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hint_problemId_order_key" ON "Hint"("problemId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Editorial_problemId_key" ON "Editorial"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "Solution_problemId_key" ON "Solution"("problemId");

-- CreateIndex
CREATE INDEX "Report_digestedAt_createdAt_idx" ON "Report"("digestedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Report_problemId_resolvedAt_idx" ON "Report"("problemId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Report_resolvedAt_idx" ON "Report"("resolvedAt");

-- AddForeignKey
ALTER TABLE "AiGenerationUsage" ADD CONSTRAINT "AiGenerationUsage_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hint" ADD CONSTRAINT "Hint_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Editorial" ADD CONSTRAINT "Editorial_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solution" ADD CONSTRAINT "Solution_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
