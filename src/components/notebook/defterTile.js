// Duvardaki defter tile'ının içeriği (LibraryNotebookTile): yalnızca kitaplık defterine referans,
// { "notebook": "lib:<ShelfBook.id>" }. Eski (yerel) defter tile'ı { pages: [...] } taşır → null.
import { parseLibKey } from './libraryShelf'

export const defterTileContent = (key) => JSON.stringify({ notebook: key })

export function parseDefterTile(content) {
  try {
    const data = JSON.parse(content || '')
    return parseLibKey(data?.notebook)
  } catch {
    return null
  }
}
