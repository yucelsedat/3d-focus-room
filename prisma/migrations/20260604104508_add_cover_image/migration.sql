/*
  Warnings:

  - You are about to drop the `RoomRelation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RoomTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "Tag_name_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RoomRelation";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RoomTag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Tag";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SpecialDoor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" TEXT NOT NULL,
    "anchorId" INTEGER NOT NULL,
    "targetRoomId" TEXT NOT NULL,
    "isOuter" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SpecialDoor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpecialDoor_targetRoomId_fkey" FOREIGN KEY ("targetRoomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Door" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" TEXT NOT NULL,
    "doorId" INTEGER NOT NULL,
    "isOuter" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Door_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Door" ("doorId", "id", "roomId") SELECT "doorId", "id", "roomId" FROM "Door";
DROP TABLE "Door";
ALTER TABLE "new_Door" RENAME TO "Door";
CREATE UNIQUE INDEX "Door_roomId_doorId_isOuter_key" ON "Door"("roomId", "doorId", "isOuter");
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL DEFAULT 'room',
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "Room_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Room" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SpecialDoor_roomId_anchorId_isOuter_key" ON "SpecialDoor"("roomId", "anchorId", "isOuter");
