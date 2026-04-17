-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Media" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "posZ" REAL NOT NULL,
    "rotX" REAL NOT NULL,
    "rotY" REAL NOT NULL,
    "rotZ" REAL NOT NULL,
    "rotOrder" TEXT NOT NULL DEFAULT 'XYZ',
    CONSTRAINT "Media_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Door" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" TEXT NOT NULL,
    "doorId" INTEGER NOT NULL,
    CONSTRAINT "Door_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Floor" (
    "roomId" TEXT NOT NULL PRIMARY KEY,
    "texture" TEXT NOT NULL DEFAULT 'zemin.png',
    CONSTRAINT "Floor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Door_roomId_doorId_key" ON "Door"("roomId", "doorId");
