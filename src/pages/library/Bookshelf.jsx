import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { BookCover } from './BookCover.jsx'
import { BOOK_RATIO } from './coverStyle.js'
import { BOOKS_PER_SHELF } from './model.js'
import { bookColorOf, shelf as shelfColors } from './theme.js'

const SIDE = 24
const GAP = 18
// Rafın kalınlığı ve kitabın üstünde kalan boşluk
const PLANK = 16
const HEADROOM = 24
// Son rafın oluşturma butonunun üstünde kalması için alttaki boşluk
const BOTTOM_SPACE = 96
// Ekranda en az bu kadar raf sırası görünsün; ekran genişse kitaplar buna göre küçülür
const MIN_VISIBLE_SHELVES = 3
const MIN_VISIBLE_ROWS_WIDE = 2
// Duyarlı düzen: geniş ekranda raflar yan yana bölmelere dizilir (raf 0, 1, 2 ilk sırada...).
// Her bölme mobildeki tek raf gibi BOOKS_PER_SHELF defter alır; veri modeli değişmez.
const BAY_MIN = 380
const BAY_MAX = 520
const MAX_COLS = 4
const MAX_BOOK = 160
// Bölmeleri ayıran dikey ahşap panelin kalınlığı
const DIVIDER = 10
// Düzenlerken kitabı tutup sürüklemeye başlamak için bu kadar basılı tutulur
const HOLD_MS = 180
// Yer açan kitaplar ve bırakılan kitap yerine bu sürede kayar
const SHIFT_MS = 160
// Sürüklenen kitap görünen alanın üst ya da alt kenarına bu kadar yaklaşınca kitaplık kayar
const EDGE = 72
const MAX_SPEED = 12

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const bayLeft = (g, shelf) => g.originX + (shelf % g.cols) * g.bayWidth
const slotLeft = (g, shelf, index) => bayLeft(g, shelf) + g.side + index * g.step
// Kitap rafın üstünde durur
const slotTop = (g, shelf) => Math.floor(shelf / g.cols) * g.rowHeight + HEADROOM
const contentHeight = (g) => Math.max(g.viewHeight, g.rows * g.rowHeight + BOTTOM_SPACE)

function measure(width, height, shelfCount) {
  const cols = width >= BAY_MIN * 2 ? Math.min(MAX_COLS, Math.floor(width / BAY_MIN)) : 1
  const bayWidth = cols === 1 ? width : Math.min(width / cols, BAY_MAX)
  // Bir rafa BOOKS_PER_SHELF kitap yan yana sığar; ekran alçaksa en az birkaç raf sırası
  // görünsün diye kitaplar küçülür ve raflar bölmede ortalanır
  const byWidth = (bayWidth - SIDE * 2 - GAP * (BOOKS_PER_SHELF - 1)) / BOOKS_PER_SHELF
  const minRows = cols > 1 ? MIN_VISIBLE_ROWS_WIDE : MIN_VISIBLE_SHELVES
  const byHeight = ((height - BOTTOM_SPACE) / minRows - HEADROOM - PLANK) / BOOK_RATIO
  const bookWidth = Math.max(40, Math.min(byWidth, byHeight, MAX_BOOK))
  const bookHeight = bookWidth * BOOK_RATIO
  const row = BOOKS_PER_SHELF * bookWidth + (BOOKS_PER_SHELF - 1) * GAP
  // Son sıra da tam dolu çizilir: boş bölmeler de birer raftır, defter oraya da konabilir
  const padded = Math.max(cols, Math.ceil(shelfCount / cols) * cols)
  return {
    cols,
    bayWidth,
    originX: (width - cols * bayWidth) / 2,
    bookWidth,
    bookHeight,
    side: Math.max(SIDE, (bayWidth - row) / 2),
    step: bookWidth + GAP,
    rowHeight: HEADROOM + bookHeight + PLANK,
    shelfCount: padded,
    rows: padded / cols,
    viewWidth: width,
    viewHeight: height,
  }
}

// Sürükleme sürerken raftaki bir kitabın geçici yeri. Tutulan kitap kalktığı raftan çıkar, gireceği
// rafta ona yer açılır; raf taşarsa en sağdaki kitap sonraki rafın başına iner, o raf da taşarsa
// bir sonrakine...
function previewSlot(shelf, index, from, to, counts) {
  let slot = index
  if (shelf === from.shelf && index > from.index) slot--
  let pushed = false
  if (shelf === to.shelf) {
    pushed = slot >= to.index
  } else if (shelf > to.shelf) {
    pushed = true
    for (let s = to.shelf; s < shelf; s++) {
      const count = (counts[s] ?? 0) - (s === from.shelf ? 1 : 0)
      if (count < BOOKS_PER_SHELF) {
        pushed = false
        break
      }
    }
  }
  if (pushed) slot++
  if (slot >= BOOKS_PER_SHELF) return { shelf: shelf + 1, index: slot - BOOKS_PER_SHELF }
  return { shelf, index: slot }
}

// Bir kategorinin kitaplığı: raflar (geniş ekranda yan yana bölmelerde), her rafta yan yana
// BOOKS_PER_SHELF kitap; aşağı doğru uzar ve aşağı yukarı kaydırılır. Düzenlerken kitaplar
// basılı tutulup sürüklenir.
export function Bookshelf({ shelves: rawShelves, editing, onOpen, onSelect, onMove, onDragChange, children, ref }) {
  const wallRef = useRef(null)
  const scrollRef = useRef(null)
  const [size, setSize] = useState(null)
  // Sürükleme: tutulan kitap, kalktığı (from) ve bırakılırsa gireceği (to) yer, kitabın kalktığı
  // yere göre kayması; moving bırakılınca false olur ve kitap yerine kayar
  const [drag, setDrag] = useState(null)
  const live = useRef(null)
  const hold = useRef(null)

  useImperativeHandle(ref, () => ({
    scrollToTop: (animated) => scrollRef.current?.scrollTo({ top: 0, behavior: animated ? 'smooth' : 'auto' }),
  }))

  useLayoutEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const g = size && size.width > 0 && measure(size.width, size.height, rawShelves.length)
  const shelves = g
    ? Array.from({ length: g.shelfCount }, (_, i) => rawShelves[i] ?? [])
    : rawShelves
  const counts = shelves.map((books) => books.length)

  // Kitap parmakla birlikte yürür; ortası hangi bölmenin ve raf sırasının hizasındaysa o rafa, o
  // rafta hangi kitabın yerine geldiyse onun yerine girer. Raf doluysa en sağa konmaz, en
  // sağdakinin yerine girer.
  function track(d) {
    const scroll = scrollRef.current?.scrollTop ?? 0
    const left = slotLeft(g, d.from.shelf, d.from.index)
    const top = slotTop(g, d.from.shelf)
    const x = clamp(left + d.fx, 0, g.viewWidth - g.bookWidth)
    const y = clamp(top + d.fy + scroll - d.startScroll, 0, slotTop(g, g.shelfCount - 1))
    const row = clamp(Math.floor((y + g.bookHeight / 2) / g.rowHeight), 0, g.rows - 1)
    const col = clamp(Math.floor((x + g.bookWidth / 2 - g.originX) / g.bayWidth), 0, g.cols - 1)
    const shelf = row * g.cols + col
    const room = (counts[shelf] ?? 0) - (shelf === d.from.shelf ? 1 : 0)
    const index = clamp(
      Math.round((x - g.originX - col * g.bayWidth - g.side) / g.step),
      0,
      Math.min(room, BOOKS_PER_SHELF - 1),
    )
    const to = d.to.shelf === shelf && d.to.index === index ? d.to : { shelf, index }
    return { ...d, dx: x - left, dy: y - top, to }
  }

  function update(next) {
    live.current = next
    setDrag(next)
  }

  // Kitap görünen alanın üst ya da alt kenarına götürülünce kitaplık o yana kayar
  useEffect(() => {
    if (!drag?.moving) return
    let frame = 0
    let last = performance.now()
    const step = (now) => {
      const d = live.current
      const el = scrollRef.current
      if (!d?.moving || !el || !g) return
      const elapsed = now - last
      last = now
      const y = slotTop(g, d.from.shelf) + d.grabY + d.fy - d.startScroll
      let speed = 0
      if (y < EDGE) speed = -(1 - Math.max(0, y) / EDGE)
      else if (y > g.viewHeight - EDGE) speed = Math.min(1, (y - g.viewHeight + EDGE) / EDGE)
      if (speed !== 0) {
        const max = Math.max(0, g.rows * g.rowHeight + BOTTOM_SPACE - g.viewHeight)
        const nextTop = clamp(el.scrollTop + (speed * MAX_SPEED * elapsed) / 16, 0, max)
        if (nextTop !== el.scrollTop) {
          el.scrollTop = nextTop
          update(track(d))
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // yalnızca sürükleme başlayıp bitince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.moving])

  function release(canceled) {
    const d = live.current
    if (!d?.moving) return
    const to = canceled ? d.from : d.to
    // Bırakılan kitap yerine kayar; yeni düzen çizilince sürükleme durumu sıfırlanır
    update({
      ...d,
      moving: false,
      to,
      dx: slotLeft(g, to.shelf, to.index) - slotLeft(g, d.from.shelf, d.from.index),
      dy: slotTop(g, to.shelf) - slotTop(g, d.from.shelf),
    })
    setTimeout(() => {
      if (to.shelf !== d.from.shelf || to.index !== d.from.index) onMove(d.id, to)
      live.current = null
      setDrag(null)
      onDragChange?.(false)
    }, SHIFT_MS)
  }

  function pointerDown(e, book, shelf, index) {
    if (!editing || e.button !== 0 || live.current) return
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    hold.current = {
      start,
      timer: setTimeout(() => {
        hold.current = null
        try {
          target.setPointerCapture(start.pointerId)
        } catch {
          // işaretçi bu arada kalktıysa
        }
        const scroll = scrollRef.current?.scrollTop ?? 0
        update({
          id: book.id,
          from: { shelf, index },
          to: { shelf, index },
          start,
          fx: 0,
          fy: 0,
          dx: 0,
          dy: 0,
          grabY: start.y - rect.top,
          startScroll: scroll,
          moving: true,
        })
        onDragChange?.(true)
      }, HOLD_MS),
    }
  }

  function pointerMove(e) {
    const h = hold.current
    if (h) {
      // Basılı tutma dolmadan kayan parmak kitaplığı kaydırır
      if (Math.hypot(e.clientX - h.start.x, e.clientY - h.start.y) > 8) {
        clearTimeout(h.timer)
        hold.current = null
      }
      return
    }
    const d = live.current
    if (!d?.moving || e.pointerId !== d.start.pointerId) return
    update(track({ ...d, fx: e.clientX - d.start.x, fy: e.clientY - d.start.y }))
  }

  function pointerUp(e, canceled = false) {
    if (hold.current) {
      clearTimeout(hold.current.timer)
      hold.current = null
    }
    const d = live.current
    if (d?.moving && e.pointerId === d.start.pointerId) release(canceled)
  }

  // Düzenleme kapanınca yarım kalan basılı tutma unutulur
  useEffect(() => {
    if (editing) return
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }, [editing])

  const wide = g && g.cols > 1
  const plankInset = wide ? DIVIDER / 2 : 8

  return (
    <div ref={wallRef} style={styles.wall}>
      <div
        ref={scrollRef}
        className="lib-scroll-y"
        style={{ ...styles.scroll, overflowY: drag ? 'hidden' : 'auto' }}
      >
        {g && (
          <div style={{ position: 'relative', height: contentHeight(g) }}>
            {shelves.map((_, shelf) => (
              <div
                key={shelf}
                style={{
                  ...styles.plank,
                  left: bayLeft(g, shelf) + plankInset,
                  width: g.bayWidth - plankInset * 2,
                  top: (Math.floor(shelf / g.cols) + 1) * g.rowHeight - PLANK,
                }}
              />
            ))}
            {/* Geniş ekranda bölmeleri ayıran dikey ahşap paneller */}
            {wide &&
              Array.from({ length: g.cols + 1 }, (_, c) => (
                <div
                  key={`d${c}`}
                  style={{
                    ...styles.divider,
                    left: g.originX + c * g.bayWidth - DIVIDER / 2,
                    height: g.rows * g.rowHeight,
                  }}
                />
              ))}
            {shelves.map((books, shelf) =>
              books.map((book, index) => (
                <ShelfBook
                  key={book.id}
                  book={book}
                  shelf={shelf}
                  index={index}
                  shelves={shelves}
                  counts={counts}
                  g={g}
                  editing={editing}
                  drag={drag}
                  onOpen={onOpen}
                  onSelect={onSelect}
                  onMove={onMove}
                  onPointerDown={(e) => pointerDown(e, book, shelf, index)}
                  onPointerMove={pointerMove}
                  onPointerUp={(e) => pointerUp(e)}
                  onPointerCancel={(e) => pointerUp(e, true)}
                />
              )),
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function ShelfBook({
  book,
  shelf,
  index,
  shelves,
  counts,
  g,
  editing,
  drag,
  onOpen,
  onSelect,
  onMove,
  ...pointer
}) {
  const held = drag?.id === book.id
  const left = slotLeft(g, shelf, index)
  const top = slotTop(g, shelf)
  let transform = 'translate(0px, 0px)'
  let transition = 'none'
  if (held) {
    transform = `translate(${drag.dx}px, ${drag.dy}px)`
    transition = drag.moving ? 'none' : `transform ${SHIFT_MS}ms ease-out`
  } else if (drag) {
    // Öbür kitaplar tutulan kitaba yer açmak için yana ya da sonraki rafa kayar
    const slot = previewSlot(shelf, index, drag.from, drag.to, counts)
    transform = `translate(${slotLeft(g, slot.shelf, slot.index) - left}px, ${slotTop(g, slot.shelf) - top}px)`
    transition = `transform ${SHIFT_MS}ms ease-out`
  }

  // Klavyeyle düzenlerken kitap ok tuşlarıyla bir yana ya da üst/alt rafa taşınır
  function onKeyDown(e) {
    if (!editing) return
    const count = shelves[shelf].length
    const up = shelf - g.cols
    const down = shelf + g.cols
    let to = null
    if (e.key === 'ArrowLeft' && index > 0) to = { shelf, index: index - 1 }
    if (e.key === 'ArrowRight' && index < count - 1) to = { shelf, index: index + 1 }
    if (e.key === 'ArrowUp' && up >= 0) to = { shelf: up, index: Math.min(index, shelves[up].length) }
    if (e.key === 'ArrowDown' && down < shelves.length) {
      to = { shelf: down, index: Math.min(index, shelves[down].length) }
    }
    if (to) {
      e.preventDefault()
      onMove(book.id, to)
    }
  }

  const color = bookColorOf(book.color)
  return (
    <div
      {...(editing ? pointer : null)}
      tabIndex={editing ? 0 : undefined}
      role={editing ? 'button' : undefined}
      aria-label={editing ? `${book.title}, ${shelf + 1}. raf, ${index + 1}. sıra` : undefined}
      title={editing ? 'Basılı tutup sürükleyerek yerini değiştir (ok tuşlarıyla da taşınır)' : undefined}
      onKeyDown={onKeyDown}
      className={editing ? 'lib-shelf-book lib-shelf-book--editing' : 'lib-shelf-book'}
      style={{
        position: 'absolute',
        left,
        top,
        width: g.bookWidth,
        zIndex: held ? 10 : 2,
        transform,
        transition,
      }}
    >
      <div
        style={{
          transform: held && drag.moving ? 'scale(1.06)' : 'scale(1)',
          transition: `transform ${SHIFT_MS}ms ease-out`,
        }}
      >
        <BookCover
          title={book.title}
          width={g.bookWidth}
          color={color.cover}
          band={color.band}
          binding={book.binding}
          subtitle={book.year ? String(book.year) : undefined}
          hint="Defteri kaldığın sayfadan aç; basılı tutunca (ya da sağ tıkla) seçenekler"
          interactive={!editing}
          onPress={() => onOpen(book)}
          onLongPress={() => onSelect(book)}
        />
      </div>
    </div>
  )
}

const styles = {
  wall: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
  },
  scroll: {
    position: 'absolute',
    inset: 0,
    overflowX: 'hidden',
  },
  plank: {
    position: 'absolute',
    height: PLANK,
    boxSizing: 'border-box',
    borderTop: `4px solid ${shelfColors.woodTop}`,
    borderBottom: `3px solid ${shelfColors.woodEdge}`,
    borderRadius: 2,
    backgroundColor: shelfColors.wood,
    boxShadow: '0px 8px 10px rgba(0, 0, 0, 0.45)',
    zIndex: 1,
  },
  divider: {
    position: 'absolute',
    top: 0,
    width: DIVIDER,
    boxSizing: 'border-box',
    borderLeft: `2px solid ${shelfColors.woodTop}`,
    borderRight: `2px solid ${shelfColors.woodEdge}`,
    backgroundColor: shelfColors.wood,
    boxShadow: '4px 0 8px rgba(0, 0, 0, 0.35)',
    zIndex: 1,
  },
}
