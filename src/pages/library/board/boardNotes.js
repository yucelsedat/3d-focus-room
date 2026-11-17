// Seyir defteri: lib/boardNotes.ts — pano notunun kartta görünen hâli ve notlarda arama.
import { parseContent } from '../notebook/noteContent.js'

// Bloklardaki yazılar alt alta; ekler ayrıca sayılır, dosyaların adları ve linklerin başlık/adresleri
// aramada bulunsun diye tutulur
export function boardNotePreview(contents) {
  let text = ''
  let images = 0
  const files = []
  const links = []
  for (const content of contents) {
    for (const segment of parseContent(content)) {
      if (segment.type === 'image') images++
      else if (segment.type === 'file') files.push(segment.label)
      else if (segment.type === 'link') links.push(segment.title, segment.url)
      else if (segment.text.trim() !== '') text += (text ? '\n' : '') + segment.text.trimEnd()
    }
  }
  return { text, images, files, links }
}

function normalize(value) {
  return value.toLocaleLowerCase('tr-TR')
}

// Aranan yazı notun başlığında, yazısında ya da eklenen dosyaların adında geçiyor mu; büyük/küçük
// harf Türkçe kurallarıyla (I/ı, İ/i) ayırt edilmez
export function matchesBoardNote(note, query) {
  const needle = normalize(query.trim())
  if (!needle) return true
  const { text, files, links } = boardNotePreview(note.contents)
  return [note.title, text, ...files, ...links].some((part) => normalize(part).includes(needle))
}
