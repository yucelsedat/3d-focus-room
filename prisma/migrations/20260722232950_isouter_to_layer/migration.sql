-- Door.isOuter (Boolean) -> Door.layer (Int): 0=iç duvar, 1=1. bahçe duvarı, 2=2. bahçe duvarı
-- SQLite'ta Boolean zaten 0/1 integer olarak saklanır, bu yüzden mevcut veriler bozulmadan taşınır.
ALTER TABLE "Door" RENAME COLUMN "isOuter" TO "layer";
DROP INDEX "Door_roomId_doorId_isOuter_key";
CREATE UNIQUE INDEX "Door_roomId_doorId_layer_key" ON "Door"("roomId", "doorId", "layer");

-- SpecialDoor.isOuter (Boolean) -> SpecialDoor.layer (Int): aynı katman anlamı
ALTER TABLE "SpecialDoor" RENAME COLUMN "isOuter" TO "layer";
DROP INDEX "SpecialDoor_roomId_anchorId_isOuter_key";
CREATE UNIQUE INDEX "SpecialDoor_roomId_anchorId_layer_key" ON "SpecialDoor"("roomId", "anchorId", "layer");
