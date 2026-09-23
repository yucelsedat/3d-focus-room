-- Sync-kopya: aynı syncGroupId'yi taşıyan canvas tile'ları ortak içerik (items/bg) kullanır.
ALTER TABLE "Media" ADD COLUMN "syncGroupId" TEXT;

CREATE INDEX "Media_syncGroupId_idx" ON "Media"("syncGroupId");
