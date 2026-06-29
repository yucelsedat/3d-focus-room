-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL DEFAULT 'room',
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT,
    CONSTRAINT "Room_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- lastActiveAt mevcut odalarda createdAt ile başlar; ilk sıralama oluşturulma sırasını korur
INSERT INTO "new_Room" ("coverImage", "createdAt", "id", "name", "parentId", "roomType", "updatedAt", "lastActiveAt") SELECT "coverImage", "createdAt", "id", "name", "parentId", "roomType", "updatedAt", "createdAt" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
