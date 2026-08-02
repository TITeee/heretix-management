-- CreateTable
CREATE TABLE "AlertChatMessage" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertChatMessage_alertId_idx" ON "AlertChatMessage"("alertId");

-- AddForeignKey
ALTER TABLE "AlertChatMessage" ADD CONSTRAINT "AlertChatMessage_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
