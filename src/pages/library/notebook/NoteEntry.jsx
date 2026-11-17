// Seyir defteri: components/notebook/NoteEntry.tsx (PDF / belge modu). Sayfadaki bir blok: solda
// kenar boşluğunda tutamaç çizgisi, sağında yazı bölümleri, resimler ve dosya ekleri. Resimler
// bloğun içinde yüzer: yanında yer kalırsa yazı yanından akar, kalmazsa altına itilir.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { docPage, fonts, HAND_TAIL, notebook, notebookFills } from '../theme.js'
import { openAttachment } from './attachments.js'
import { DOC_RENDERED_PAD, DOC_ROW_LEFT, DOC_ROW_RIGHT, leadingHeadingCenter } from './docLayout.js'
import { DocText } from './DocText.jsx'
import { flowAround, imageRect, intersects, layoutBlockImages } from './imageLayout.js'
import { marksIn, parseMarks } from './marks.js'
import { parseContent, removeAttachment, serializeContent } from './noteContent.js'
import { NoteFile, NoteImage } from './NoteImage.jsx'

const LH = notebook.lineHeight

// Bloğun tutamacı: kenar boşluğunda soluk, elle çekilmiş kısa bir çizgi. Blok büyük bir başlıkla
// başlıyorsa çizgi o başlığın satırına ortalansın diye offset kadar aşağı iner.
function BlockGrip({ offset = 0 }) {
  return (
    <div style={{ ...styles.grip, ...(offset > 0 ? { marginTop: offset } : null) }}>
      <span style={styles.dash} aria-hidden="true">
        {'—' + HAND_TAIL}
      </span>
    </div>
  )
}

const NO_LAYOUT = { width: 0, anchors: {}, boxes: {} }

// focusRequest: { noteId, segment, cursor?, end? }
export function NoteEntry({
  note,
  focusRequest,
  onChangeContent,
  onActive,
  onBlur,
  readOnly = false,
  onSelect,
  onSplit,
  onMergeBack,
  onPasteMarkdown,
  rawMarkdown,
  rowRef,
  // Blok seçimi ya da çizim açıkken blok tıklama almaz; seçiliyse üstüne hafif bir mavi düşer
  inert = false,
  selected = false,
  // Tutamaçtan sürüklenen blok kâğıttan kaldırılmış gibi parmakla yürür
  lifted = false,
  dragOffset = 0,
  dragTransition = 'none',
  gripProps,
  // Düzenlenen resim (dosya adı), resmi düzenlemeye açma / tam ekran açma, eki silme sorusu
  editingImage = null,
  onEditImage,
  onOpenImage,
  onConfirmRemove,
  onPasteImage,
}) {
  const segments = parseContent(note.content)
  const highlights = parseMarks(note.highlights)
  const inks = parseMarks(note.inks)
  const starts = []
  segments.reduce((offset, segment) => {
    starts.push(offset)
    return offset + serializeContent([segment]).length
  }, 0)
  const inputs = useRef(new Map())
  const cursors = useRef(new Map())
  const [focusedSegment, setFocusedSegment] = useState(null)
  const hasAttachments = segments.length > 1
  const hasImages = segments.some((s) => s.type === 'image')
  const ownRef = useRef(null)
  const parts = useRef(new Map())
  // Bölümlerin bloktaki yerleri (resim yüzünden itilmeden önceki hâliyle), resimlerin içerikteki
  // yerleri ve yazı genişliği
  const [layout, setLayout] = useState(NO_LAYOUT)
  const textWidth = layout.width

  const images = hasImages
    ? layoutBlockImages(
        segments.flatMap((s, i) => (s.type === 'image' ? [{ index: i, image: s, anchorTop: layout.anchors[s.name] }] : [])),
        textWidth,
      )
    : []
  const imagesBottom = Math.max(0, ...images.map((f) => f.bottom))

  function flowOf(key) {
    const box = layout.boxes[key]
    return box && images.length > 0 ? flowAround(images, box.top, box.height, textWidth) : { push: 0, indent: undefined }
  }

  // Resimli blokta bölümlerin ve resim işaretlerinin yeri ölçülür; değiştiyse yerleşim yenilenir
  useLayoutEffect(() => {
    if (!hasImages) return
    const row = ownRef.current
    if (!row) return
    const width = Math.max(0, row.clientWidth - DOC_ROW_LEFT - DOC_ROW_RIGHT)
    const anchors = {}
    const boxes = {}
    for (const [key, el] of parts.current) {
      const push = Number(el.dataset.push) || 0
      if (key.startsWith('a:')) anchors[key.slice(2)] = el.offsetTop
      else boxes[key] = { top: el.offsetTop - push, height: el.offsetHeight }
    }
    const next = { width, anchors, boxes, height: row.offsetHeight }
    // Yerleşim DOM'dan ölçülür; aynı ölçüye gelince durur
    if (JSON.stringify(next) !== JSON.stringify(layout)) setLayout(next)
  }, [hasImages, layout, note.content, focusedSegment, editingImage, readOnly])

  // Genişlik değişince yeniden ölçülür
  useEffect(() => {
    if (!hasImages) return
    const row = ownRef.current
    const ro = new ResizeObserver(() =>
      setLayout((prev) => ({ ...prev, width: Math.max(0, row.clientWidth - DOC_ROW_LEFT - DOC_ROW_RIGHT) })),
    )
    ro.observe(row)
    return () => ro.disconnect()
  }, [hasImages])

  function part(key) {
    return (el) => {
      if (el) parts.current.set(key, el)
      else parts.current.delete(key)
    }
  }

  // Blok bir başlıkla başlıyorsa tutamacın çizgisi o başlığın satırına ortalanır
  const first = segments[0]
  const firstText = first?.type === 'text' ? first.text : ''
  const headingCenter = firstText ? leadingHeadingCenter(firstText) : null
  const gripOffset =
    headingCenter !== null && (!rawMarkdown || focusedSegment !== 0)
      ? Math.max(0, Math.round(flowOf('t-0').push + DOC_RENDERED_PAD + headingCenter - docPage.lineHeight / 2))
      : 0

  // Yeni blok açılınca, bölününce ya da birleşince istenen yazı bölümüne odaklan
  useEffect(() => {
    if (focusRequest?.noteId !== note.id) return
    const input = inputs.current.get(focusRequest.segment)
    if (!input) return
    input.focus()
    if (focusRequest.cursor !== undefined) {
      input.setSelection(focusRequest.cursor, focusRequest.end ?? focusRequest.cursor)
    }
  }, [focusRequest, note.id])

  function commit(next) {
    onChangeContent(serializeContent(next))
  }

  function changeText(index, text) {
    commit(segments.map((s, i) => (i === index ? { type: 'text', text } : s)))
  }

  function confirmRemove(index) {
    const segment = segments[index]
    if (segment.type === 'text') return
    onConfirmRemove?.(segment, () => commit(removeAttachment(segments, index)))
  }

  function changeImages(changes) {
    commit(segments.map((s, i) => changes.get(i) ?? s))
  }

  // Resim boş yere bırakılırsa oraya yerleşir; başka bir resmin üstüne bırakılırsa ikisi yer
  // değiştirir; başka bir resme yalnızca değiyorsa yerine geri döner
  function dropImage(moved, x, row) {
    const rect = imageRect(moved.image, row, x, textWidth)
    const hits = images.filter((f) => f.index !== moved.index && intersects(f, rect))
    if (hits.length === 0) {
      changeImages(new Map([[moved.index, { ...moved.image, x, row }]]))
      return
    }
    const cx = (rect.x0 + rect.x1) / 2
    const cy = (rect.top + rect.bottom) / 2
    const target = hits.find((f) => cx >= f.x0 && cx <= f.x1 && cy >= f.top && cy <= f.bottom)
    if (!target) return
    changeImages(
      new Map([
        [moved.index, { ...moved.image, x: target.image.x, row: target.row }],
        [target.index, { ...target.image, x: moved.image.x, row: moved.row }],
      ]),
    )
  }

  // Resim bloğun dışına çıkamaz: en üst satırla bloğun en alt satırı arasında kayar
  function rowsOf(f) {
    const height = layout.height ?? 0
    const lines = Math.floor((Math.max(height, f.bottom) + 1) / LH)
    return { current: f.row, min: 0, max: Math.max(f.row, lines - f.image.lines) }
  }

  // İki ek arasında kalan boş yazı bölümü, ardındaki resim elle yerleştirildiyse yer kaplamaz
  function collapsedAt(i) {
    const segment = segments[i]
    const next = segments[i + 1]
    return i > 0 && segment.type === 'text' && segment.text === '' && next?.type === 'image' && next.row !== undefined && focusedSegment !== i
  }

  function flowStyle(flow) {
    return { marginTop: flow.push, marginLeft: flow.indent?.left ?? 0, marginRight: flow.indent?.right ?? 0 }
  }

  return (
    <div
      ref={(el) => {
        ownRef.current = el
        if (typeof rowRef === 'function') rowRef(el)
      }}
      style={{
        ...styles.row,
        minHeight: imagesBottom || undefined,
        ...(focusedSegment !== null ? styles.raised : null),
        ...(lifted ? styles.lifted : null),
        pointerEvents: inert ? 'none' : undefined,
        transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
        transition: dragTransition,
      }}
    >
      {selected && <div style={styles.selected} />}
      {/* Çizgi bloğun tutamacıdır: basılı tutup yukarı aşağı sürükleyince blok yer değiştirir */}
      <div
        {...(readOnly ? null : gripProps)}
        role={readOnly ? undefined : 'button'}
        tabIndex={readOnly ? undefined : 0}
        aria-label={readOnly ? undefined : 'Blok — basılı tutup sürükle ya da Alt+ok tuşlarıyla taşı'}
        title={readOnly ? undefined : 'Basılı tutup yukarı aşağı sürükle'}
        className={readOnly ? undefined : 'nb-grip'}
        style={styles.handle}
      >
        <BlockGrip offset={gripOffset} />
      </div>
      {segments.map((segment, i) => {
        if (segment.type === 'text') {
          const key = `t-${i}`
          const collapsed = hasAttachments && collapsedAt(i)
          const flow = collapsed ? { push: 0, indent: undefined } : flowOf(key)
          return (
            <div
              key={key}
              ref={hasImages ? part(key) : undefined}
              data-push={flow.push}
              style={{ ...flowStyle(flow), ...(collapsed ? styles.collapsed : null) }}
            >
              <DocText
                ref={(el) => {
                  if (el) inputs.current.set(i, el)
                  else inputs.current.delete(i)
                }}
                value={segment.text}
                readOnly={readOnly}
                placeholder={segments.length === 1 && !readOnly ? 'Yaz…' : undefined}
                onChangeText={(text) => changeText(i, text)}
                onSelectionChange={(cursor) => {
                  cursors.current.set(i, cursor)
                  onActive(i, cursor)
                }}
                onFocus={() => {
                  setFocusedSegment(i)
                  onActive(i, cursors.current.get(i) ?? segment.text.length)
                  if (editingImage) onEditImage?.(null)
                }}
                onBlur={() => {
                  setFocusedSegment((prev) => (prev === i ? null : prev))
                  onBlur()
                }}
                onEnter={(at, prefix) => onSplit(i, at, prefix)}
                onBackspaceAtStart={i === 0 ? onMergeBack : undefined}
                onSelect={(start, end) => onSelect?.(starts[i] + start, starts[i] + end)}
                highlights={marksIn(highlights, starts[i], starts[i] + segment.text.length)}
                inks={marksIn(inks, starts[i], starts[i] + segment.text.length)}
                onPasteMarkdown={onPasteMarkdown}
                onPasteImage={onPasteImage ? (file) => onPasteImage(i, file) : undefined}
              />
            </div>
          )
        }
        if (segment.type === 'image') {
          // Resmin içerikteki yerinde yalnızca yerini bildiren boş bir işaret kalır; resmin kendisi
          // bloğun üstüne çizilir
          return <div key={`i-${segment.name}`} ref={part(`a:${segment.name}`)} />
        }
        const key = `f-${segment.name}`
        const flow = flowOf(key)
        return (
          <div key={key} ref={hasImages ? part(key) : undefined} data-push={flow.push} style={flowStyle(flow)}>
            <NoteFile file={segment} onPress={() => openAttachment(segment.name)} onLongPress={readOnly ? undefined : () => confirmRemove(i)} />
          </div>
        )
      })}

      {images.map((f) => (
        <div key={`p-${f.image.name}`} style={{ ...styles.image, top: f.top, left: DOC_ROW_LEFT, width: textWidth }}>
          <NoteImage
            image={f.image}
            maxWidth={textWidth}
            readOnly={readOnly}
            editing={editingImage === f.image.name}
            onPress={() => onEditImage?.(editingImage === f.image.name ? null : f.image.name)}
            onLongPress={() => confirmRemove(f.index)}
            onChange={(next) => changeImages(new Map([[f.index, next]]))}
            rows={rowsOf(f)}
            onMove={(x, row) => dropImage(f, x, row)}
            onOpen={() => onOpenImage?.(f.image.name)}
          />
        </div>
      ))}
    </div>
  )
}

const styles = {
  row: {
    position: 'relative',
    paddingLeft: DOC_ROW_LEFT,
    paddingRight: DOC_ROW_RIGHT,
  },
  raised: {
    zIndex: 10,
  },
  // Sürüklenen blok kâğıttan kaldırılmış gibi: altındaki blokları örter, gölgesi düşer
  lifted: {
    zIndex: 20,
    backgroundColor: docPage.sheet,
    boxShadow: '0 3px 6px rgba(59, 47, 26, 0.22)',
  },
  // Seçili blok: yazının altında, bloğu baştan sona saran hafif mavi
  selected: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    left: 4,
    right: 6,
    borderRadius: 8,
    border: `1px solid ${notebookFills.selectionEdge}`,
    backgroundColor: notebookFills.selectionTint,
    pointerEvents: 'none',
  },
  handle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DOC_ROW_LEFT,
    zIndex: 1,
    touchAction: 'none',
  },
  grip: {
    width: docPage.gutter,
    height: docPage.lineHeight,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Normal defterin blok çizgisiyle aynı
  dash: {
    ...fonts.hand,
    fontSize: 22,
    lineHeight: `${docPage.lineHeight}px`,
    color: 'rgba(56, 56, 61, 0.4)',
    userSelect: 'none',
  },
  collapsed: {
    height: 0,
    overflow: 'hidden',
  },
  // Resim bloğun yazılarının üstünde durur
  image: {
    position: 'absolute',
    zIndex: 15,
    // Yalnızca fotoğrafın kendisi tıklanır; yanındaki yazı ve ekler tıklamayı alır
    pointerEvents: 'none',
  },
}
