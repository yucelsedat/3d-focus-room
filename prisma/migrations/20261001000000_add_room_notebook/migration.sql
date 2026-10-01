-- Oda Defteri: kök oda başına tek JSON doküman. FK yok — kök silinince satırlar
-- reconcileNotebooks() ile hayatta kalan kök odalara dağıtılır.
CREATE TABLE "RoomNotebook" (
    "rootRoomId" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
