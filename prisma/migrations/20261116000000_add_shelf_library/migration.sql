-- Kitaplık (all-books): Seyir Defteri kitaplığının web kopyası.
CREATE TABLE "ShelfCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Genel hep vardır
INSERT INTO "ShelfCategory" ("id", "name", "position") VALUES (1, 'Genel', 0);

CREATE TABLE "ShelfBook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'ink',
    "kind" TEXT NOT NULL DEFAULT 'pdf',
    "binding" TEXT NOT NULL DEFAULT 'file',
    "paper" TEXT NOT NULL DEFAULT 'a4',
    "year" INTEGER,
    "weeklyPages" INTEGER NOT NULL DEFAULT 1,
    "monthGoals" INTEGER NOT NULL DEFAULT 1,
    "monthReview" INTEGER NOT NULL DEFAULT 1,
    "habits" TEXT NOT NULL DEFAULT 'none',
    "pageCount" INTEGER NOT NULL DEFAULT 10,
    "categoryId" INTEGER NOT NULL DEFAULT 1,
    "shelf" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ShelfBook_categoryId_shelf_position_idx" ON "ShelfBook"("categoryId", "shelf", "position");

CREATE TABLE "ShelfNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'page',
    "ref" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "highlights" TEXT NOT NULL DEFAULT '',
    "inks" TEXT NOT NULL DEFAULT '',
    "times" TEXT NOT NULL DEFAULT '',
    "time" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "ShelfNote_bookId_kind_ref_idx" ON "ShelfNote"("bookId", "kind", "ref");

CREATE TABLE "ShelfPageTitle" (
    "bookId" INTEGER NOT NULL,
    "ref" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    PRIMARY KEY ("bookId", "ref")
);
