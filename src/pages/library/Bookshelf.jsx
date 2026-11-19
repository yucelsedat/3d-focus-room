import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { BookCover } from './BookCover.jsx'
import { BOOK_RATIO } from './coverStyle.js'
import { BOOKS_PER_SHELF } from './model.js'
import { bookColorOf } from './theme.js'

const SIDE = 24
const SIDE_NARROW = 10
const GAP = 18
const GAP_NARROW = 10
// Rafın kalınlığı ve kitabın üstünde kalan boşluk (üstte LED şeridi yanar)
const PLANK = 16
const HEADROOM = 30
// Son rafın oluşturma butonunun üstünde kalması için alttaki boşluk; yan yana duran dolaplarda
// (single) yok: dolap ekranın altına kadar iner, + düğmesi üstünde yüzer
const BOTTOM_SPACE = 96
// Dolabın gövdesi: yan tahtalar, üstteki taç, alttaki kaide ve dolabın üstündeki boşluk.
// Dar ekranda yan tahtalar ve kenar payı incelir ki kitaplar küçülmesin.
const FRAME = 16
const FRAME_NARROW = 9
const MARGIN = 28
const MARGIN_NARROW = 4
const CROWN = 20
const PLINTH = 22
const PAD_TOP = 18
// Tek sütunlu dolap (yan yana duran kategori dolaplarından biri): üstünde üst çubuğa yer kalır
const SINGLE_MAX = 520
const PAD_TOP_SINGLE = 64
// Yan yana duran dolapların arasındaki pay (dolabın iki yanında)
const MARGIN_ROOM = 22
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
// Raf sırasının üstü (g.top dolabın ilk sırasının başladığı yerdir); kitap rafın üstünde durur
const rowTop = (g, row) => g.top + row * g.rowHeight
const slotTop = (g, shelf) => rowTop(g, Math.floor(shelf / g.cols)) + HEADROOM
const contentHeight = (g) => Math.max(g.viewHeight, g.top + g.rows * g.rowHeight + PLINTH + g.bottomSpace)

function measure(width, height, shelfCount, single) {
  const roomy = width >= 600
  const frame = roomy ? FRAME : FRAME_NARROW
  // Telefonda tek dolap ekranı kaplar; pay ancak yan yana dolaplar sığınca bırakılır
  const margin = roomy ? MARGIN : single && width >= 420 ? MARGIN_ROOM : MARGIN_NARROW
  const inner = width - 2 * (frame + margin)
  const cols = !single && inner >= BAY_MIN * 2 ? Math.min(MAX_COLS, Math.floor(inner / BAY_MIN)) : 1
  const bayWidth = cols === 1 ? Math.min(inner, single ? SINGLE_MAX : inner) : Math.min(inner / cols, BAY_MAX)
  const padTop = single ? PAD_TOP_SINGLE : PAD_TOP
  const bottomSpace = single ? 0 : BOTTOM_SPACE
  const sideMin = roomy ? SIDE : SIDE_NARROW
  const gap = roomy ? GAP : GAP_NARROW
  // Bir rafa BOOKS_PER_SHELF kitap yan yana sığar; ekran alçaksa en az birkaç raf sırası
  // görünsün diye kitaplar küçülür ve raflar bölmede ortalanır
  const byWidth = (bayWidth - sideMin * 2 - gap * (BOOKS_PER_SHELF - 1)) / BOOKS_PER_SHELF
  const minRows = cols > 1 ? MIN_VISIBLE_ROWS_WIDE : MIN_VISIBLE_SHELVES
  const chrome = cols > 1 ? PAD_TOP + CROWN + PLINTH : 0
  const byHeight = ((height - bottomSpace - chrome) / minRows - HEADROOM - PLANK) / BOOK_RATIO
  const bookWidth = Math.max(40, Math.min(byWidth, byHeight, MAX_BOOK))
  const bookHeight = bookWidth * BOOK_RATIO
  const row = BOOKS_PER_SHELF * bookWidth + (BOOKS_PER_SHELF - 1) * gap
  // Son sıra da tam dolu çizilir: boş bölmeler de birer raftır, defter oraya da konabilir
  const padded = Math.max(cols, Math.ceil(shelfCount / cols) * cols)
  const rows = padded / cols
  const rowHeight = HEADROOM + bookHeight + PLANK
  // Dolap ekrana sığıyorsa dikeyde ortalanır (alttaki + düğmesine yer bırakarak)
  const cabinetHeight = CROWN + rows * rowHeight + PLINTH
  const free = height - (padTop + cabinetHeight + bottomSpace)
  const cabinetTop = padTop + Math.max(0, Math.floor(free / 2))
  return {
    cols,
    bayWidth,
    frame,
    originX: (width - cols * bayWidth) / 2,
    bookWidth,
    bookHeight,
    side: Math.max(sideMin, (bayWidth - row) / 2),
    step: bookWidth + gap,
    rowHeight,
    shelfCount: padded,
    rows,
    cabinetTop,
    cabinetHeight,
    bottomSpace,
    top: cabinetTop + CROWN,
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
//
// single: yan yana duran kategori dolaplarından biri (tek sütun). lit: seçili dolap; yalnız onun
// raflarındaki LED'ler yanar (öbürlerininki sönük). onScrollY: dolap aşağı yukarı
// kaydırılınca (yan yana duran öbür dolaplar da aynı yüksekliğe kaysın diye).
export function Bookshelf({
  shelves: rawShelves,
  editing,
  onOpen,
  onSelect,
  onMove,
  onDragChange,
  single = false,
  lit = true,
  onScrollY,
  children,
  ref,
}) {
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
    // Yan yana duran dolaplar aynı yükseklikte kalır; zaten oradaysa olay döngüsü kurulmaz
    setScrollTop: (top) => {
      const el = scrollRef.current
      if (el && Math.abs(el.scrollTop - top) > 0.5) el.scrollTop = top
    },
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

  const g = size && size.width > 0 && measure(size.width, size.height, rawShelves.length, single)
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
    const y = clamp(top + d.fy + scroll - d.startScroll, g.top, slotTop(g, g.shelfCount - 1))
    const row = clamp(Math.floor((y - g.top + g.bookHeight / 2) / g.rowHeight), 0, g.rows - 1)
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
        const max = Math.max(0, contentHeight(g) - g.viewHeight)
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

  const cabinetLeft = g ? g.originX - g.frame : 0
  const cabinetWidth = g ? g.cols * g.bayWidth + g.frame * 2 : 0
  const wide = g && g.cols > 1
  // Bölmenin iç kenarı: bölme panelinin ya da dolabın yan tahtasının yanından başlar
  const bayInset = (shelf) => {
    const col = shelf % g.cols
    return { left: col === 0 ? 0 : DIVIDER / 2, right: col === g.cols - 1 ? 0 : DIVIDER / 2 }
  }

  return (
    <div ref={wallRef} style={styles.wall}>
      <div
        ref={scrollRef}
        className="lib-scroll-y"
        style={{ ...styles.scroll, overflowY: drag ? 'hidden' : 'auto' }}
        onScroll={(e) => onScrollY?.(e.currentTarget.scrollTop)}
      >
        {g && (
          <div className={lit ? 'lib-cabinet lib-cabinet--lit' : 'lib-cabinet'} style={{ position: 'relative', height: contentHeight(g) }}>
            {/* Dolabın gövdesi: taç, kaide, yan dikmeler; aralarında raf bölmeleri */}
            <div className="lib-frame lib-frame--crown" style={{ left: cabinetLeft, top: g.cabinetTop, width: cabinetWidth, height: CROWN }} />
            <div
              className="lib-frame lib-frame--plinth"
              style={{ left: cabinetLeft, top: g.cabinetTop + g.cabinetHeight - PLINTH, width: cabinetWidth, height: PLINTH }}
            />
            <div className="lib-frame lib-frame--stile" style={{ left: cabinetLeft, top: g.cabinetTop, width: g.frame, height: g.cabinetHeight }} />
            <div
              className="lib-frame lib-frame--stile"
              style={{ left: cabinetLeft + cabinetWidth - g.frame, top: g.cabinetTop, width: g.frame, height: g.cabinetHeight }}
            />
            {/* Raf bölmesi: arka pano, tepesinde sarı LED şerit */}
            {shelves.map((_, shelf) => {
              const inset = bayInset(shelf)
              return (
                <div
                  key={`b${shelf}`}
                  className="lib-bay"
                  style={{
                    left: bayLeft(g, shelf) + inset.left,
                    width: g.bayWidth - inset.left - inset.right,
                    top: rowTop(g, Math.floor(shelf / g.cols)),
                    height: g.rowHeight - PLANK,
                  }}
                />
              )
            })}
            {/* Raf tahtaları */}
            {shelves.map((_, shelf) => {
              const inset = bayInset(shelf)
              return (
                <div
                  key={shelf}
                  className="lib-frame lib-frame--plank"
                  style={{
                    left: bayLeft(g, shelf) + inset.left,
                    width: g.bayWidth - inset.left - inset.right,
                    top: rowTop(g, Math.floor(shelf / g.cols) + 1) - PLANK,
                    height: PLANK,
                  }}
                />
              )
            })}
            {/* Geniş ekranda bölmeleri ayıran dikey ahşap paneller */}
            {wide &&
              Array.from({ length: g.cols - 1 }, (_, c) => (
                <div
                  key={`d${c}`}
                  className="lib-frame lib-frame--divider"
                  style={{
                    left: g.originX + (c + 1) * g.bayWidth - DIVIDER / 2,
                    top: g.top,
                    width: DIVIDER,
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
}
