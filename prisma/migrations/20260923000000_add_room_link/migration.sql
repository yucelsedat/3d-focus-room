-- RoomLink: bağlantı kapısı / bağlantılı odalar ilişkisi.
-- SpecialDoor'dan farkı: parent-child hiyerarşisi kurmaz, bir oda birden çok odaya bağlanabilir.
CREATE TABLE "RoomLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" TEXT NOT NULL,
    "anchorId" INTEGER NOT NULL,
    "targetRoomId" TEXT NOT NULL,
    "layer" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RoomLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomLink_targetRoomId_fkey" FOREIGN KEY ("targetRoomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RoomLink_roomId_anchorId_layer_key" ON "RoomLink"("roomId", "anchorId", "layer");
