-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "aiModel" TEXT NOT NULL DEFAULT 'openai/gpt-oss-120b',
    "fallbackModel" TEXT,
    "transcriptionModel" TEXT NOT NULL DEFAULT 'whisper-large-v3-turbo',
    "autopilotMode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "businessName" TEXT NOT NULL DEFAULT 'ZAID KHAN',
    "persona" TEXT,
    "workingHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "workingDays" JSONB NOT NULL DEFAULT [1,2,3,4,5,6],
    "workingStart" TEXT NOT NULL DEFAULT '09:00',
    "workingEnd" TEXT NOT NULL DEFAULT '21:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "outOfHoursMessage" TEXT,
    "replyDelayMinSec" INTEGER NOT NULL DEFAULT 4,
    "replyDelayMaxSec" INTEGER NOT NULL DEFAULT 12,
    "dailyReplyLimit" INTEGER NOT NULL DEFAULT 200,
    "maxConsecutiveAi" INTEGER NOT NULL DEFAULT 3,
    "sendTypingPresence" BOOLEAN NOT NULL DEFAULT true,
    "confidenceThreshold" REAL NOT NULL DEFAULT 0.55,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 300,
    "skipTrivialMessages" BOOLEAN NOT NULL DEFAULT true,
    "cacheReuseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyRequestBudget" INTEGER NOT NULL DEFAULT 500,
    "dailyTokenBudget" INTEGER NOT NULL DEFAULT 200000,
    "budgetPolicy" TEXT NOT NULL DEFAULT 'PAUSE_AI',
    "outOfLimitAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "groqApiKeyEnc" TEXT,
    "groqApiKeyLast4" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "phoneNumber" TEXT,
    "pushName" TEXT,
    "credsDir" TEXT NOT NULL,
    "lastQrAt" DATETIME,
    "lastConnectedAt" DATETIME,
    "lastDisconnectCode" INTEGER,
    "lastDisconnectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "waJid" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "pushName" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "isWhitelisted" BOOLEAN NOT NULL DEFAULT false,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "excludeReason" TEXT,
    "autopilotEnabled" BOOLEAN,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "needsHumanReason" TEXT,
    "tags" JSONB,
    "inboundCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "lastMessagePreview" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "waMessageId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "draftText" TEXT,
    "transcript" TEXT,
    "mediaMime" TEXT,
    "mediaPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "skipReason" TEXT,
    "handoffReason" TEXT,
    "aiModel" TEXT,
    "confidence" REAL,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "waTimestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FAQ',
    "content" TEXT NOT NULL,
    "keywords" TEXT,
    "price" REAL,
    "currency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HandoffEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "contactId" TEXT NOT NULL,
    "messageId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoffEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'owner',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contactId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "inbound" INTEGER NOT NULL DEFAULT 0,
    "aiReplies" INTEGER NOT NULL DEFAULT 0,
    "humanReplies" INTEGER NOT NULL DEFAULT 0,
    "draftsCreated" INTEGER NOT NULL DEFAULT 0,
    "draftsApproved" INTEGER NOT NULL DEFAULT 0,
    "handoffs" INTEGER NOT NULL DEFAULT 0,
    "skips" INTEGER NOT NULL DEFAULT 0,
    "responseMsTotal" INTEGER NOT NULL DEFAULT 0,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "aiTokens" INTEGER NOT NULL DEFAULT 0,
    "transcriptionSec" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiRateLimitState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'current',
    "remainingRequests" INTEGER,
    "limitRequests" INTEGER,
    "resetRequestsAt" DATETIME,
    "remainingTokens" INTEGER,
    "limitTokens" INTEGER,
    "resetTokensAt" DATETIME,
    "retryAfterSec" INTEGER,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_waJid_key" ON "Contact"("waJid");

-- CreateIndex
CREATE INDEX "Contact_lastMessageAt_idx" ON "Contact"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_contactId_waTimestamp_idx" ON "Message"("contactId", "waTimestamp");

-- CreateIndex
CREATE INDEX "Message_status_createdAt_idx" ON "Message"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_active_category_idx" ON "KnowledgeEntry"("active", "category");

-- CreateIndex
CREATE INDEX "HandoffEvent_createdAt_idx" ON "HandoffEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_key" ON "DailyStat"("date");

-- CreateIndex
CREATE INDEX "AiUsage_date_idx" ON "AiUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_date_model_key" ON "AiUsage"("date", "model");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");
