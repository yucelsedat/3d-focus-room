-- Kitaplık: pano notları.
CREATE TABLE "ShelfBoardNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL DEFAULT '',
    "paper" TEXT NOT NULL DEFAULT 'oxford',
    "tilt" REAL NOT NULL DEFAULT 0,
    "pin" TEXT NOT NULL DEFAULT 'red',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
