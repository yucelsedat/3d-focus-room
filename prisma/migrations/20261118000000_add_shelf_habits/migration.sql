-- Kitaplık: ajandanın alışkanlık takibi satırları.
CREATE TABLE "ShelfHabit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "done" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ShelfHabit_bookId_period_idx" ON "ShelfHabit"("bookId", "period");
