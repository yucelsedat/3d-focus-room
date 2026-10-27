-- Kitaplık: odaya bağlı olmayan defterler + oda defterine ad/kapak.
ALTER TABLE "RoomNotebook" ADD COLUMN "name" TEXT;
ALTER TABLE "RoomNotebook" ADD COLUMN "coverUrl" TEXT;

CREATE TABLE "Notebook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "coverUrl" TEXT,
    "content" TEXT NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
