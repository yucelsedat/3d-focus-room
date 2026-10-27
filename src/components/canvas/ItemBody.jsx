// ── Düzenleme yüzeyinde bir öğenin içeriği ───────────────────────────────────
// Canvas tile edit modu ve Timeline aynı gövdeyi render eder. Konumlandırma,
// seçim çerçevesi ve sürükleme çağıranın işi; burada yalnızca öğenin kendisi var.
import { ImageItem, LinkCard, InstaCard, MusicCard, PdfCard, YoutubeCard, RoomChip, NoteCard, NotebookCard } from './cards'
import { TextItemBox, TextItemEditor } from './TextItem'

// width: gösterim genişliği (timeline not kartını zaman aralığına sığdırınca)
export function ItemBody({ item, width, editing, onOpenImages, onOpenLink, onTextHeight, onTextCommit, onTextMarkdown }) {
  switch (item.type) {
    case 'room':    return <RoomChip item={item} />
    case 'link':    return <LinkCard item={item} />
    case 'insta':   return <InstaCard item={item} />
    case 'youtube': return <YoutubeCard item={item} />
    case 'music':   return <MusicCard item={item} />
    case 'pdf':     return <PdfCard item={item} />
    case 'image':   return <ImageItem item={item} />
    case 'note':    return <NoteCard item={item} width={width} onOpenImages={onOpenImages} onOpenLink={onOpenLink} />
    case 'notebook': return <NotebookCard item={item} width={width} />
    case 'text':
      // içeriğe göre uzat, A4 yüksekliğinde durdur → fazlası textarea içinde scroll
      return editing
        ? <TextItemEditor item={item} onHeight={onTextHeight} onCommit={onTextCommit} onMarkdown={onTextMarkdown} />
        : <TextItemBox item={item} defaultBg="rgba(0,0,0,0.38)" />
    default: return null
  }
}
