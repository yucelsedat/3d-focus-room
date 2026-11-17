-- Kitaplık: sayfa ayraçları ve sayfa çizimleri.
CREATE TABLE "ShelfFavorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ShelfFavorite_bookId_kind_pageId_key" ON "ShelfFavorite"("bookId", "kind", "pageId");

CREATE TABLE "ShelfDrawing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "strokes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ShelfDrawing_bookId_kind_pageId_key" ON "ShelfDrawing"("bookId", "kind", "pageId");
