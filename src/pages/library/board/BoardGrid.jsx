// Seyir defteri: components/board/BoardGrid.tsx — panodaki notlar: aşağı doğru uzayan ızgara
// (telefonda iki sütun, geniş ekranda daha çok). Düzenlerken notlar basılı tutulup sürüklenerek yer
// değiştirir: tutulan not işaretçiyle yürür, aradakiler ona yer açmak için bir sıra kayar; pano
// kenarına götürülünce pano o yana kendiliğinden kayar. Klavyede düzenlerken ok tuşları taşır.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { BoardCard, CARD_RATIO } from './BoardCard.jsx'

const SIDE = 18
const GAP = 20
const ROW_GAP = 28
// Kartın en dar ve en geniş hali; sütun sayısı panonun enine göre (en az iki)
const MIN_CARD = 190
const MAX_CARD = 240
// Raptiyeler kartın üstünden taşar; ilk sıranın üstünde onlara yer kalır
const TOP = 28
// Son sıradaki notlar oluşturma düğmesinin altında kalmasın
const BOTTOM_SPACE = 100
// Notu tutup sürüklemeye başlamak için bu kadar basılı tutulur; daha önce kaydırılırsa pano kayar
const HOLD_MS = 180
const SHIFT_MS = 160
// Sürüklenen not panonun üst ya da alt kenarına bu kadar yaklaşınca pano o yana kayar
const EDGE = 64
const MAX_SPEED = 12

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function measure(width, height, count) {
  let columns = Math.max(2, Math.floor((width - SIDE * 2 + GAP) / (MIN_CARD + GAP)))
  // Kartlar çok genişlemesin: sığdıkça sütun eklenir
  while ((width - SIDE * 2 - GAP * (columns - 1)) / columns > MAX_CARD) columns++
  const cardWidth = Math.floor((width - SIDE * 2 - GAP * (columns - 1)) / columns)
  const cardHeight = Math.round(cardWidth * CARD_RATIO)
  const stepY = cardHeight + ROW_GAP
  const rows = Math.ceil(count / columns)
  return {
    columns,
    cardWidth,
    cardHeight,
    stepX: cardWidth + GAP,
    stepY,
    contentHeight: Math.max(height, TOP + rows * stepY - ROW_GAP + BOTTOM_SPACE),
    viewHeight: height,
  }
}

const slotLeft = (g, index) => SIDE + (index % g.columns) * g.stepX
const slotTop = (g, index) => TOP + Math.floor(index / g.columns) * g.stepY

export function BoardGrid({ notes, editing, onOpen, onSelect, onMove, ref }) {
  const scrollRef = useRef(null)
  const [size, setSize] = useState(null)
  // Sürükleme: tutulan notun kimliği, kalktığı ve gireceği sıra, kayması; settling: bırakılan not
  // yerine süzülüyor
  const [drag, setDrag] = useState(null)
  const live = useRef(null)

  useImperativeHandle(ref, () => ({
    scrollToTop: (smooth) => scrollRef.current?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }),
  }))

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const g = size && measure(size.width, size.height, notes.length)

  // İşaretçinin yürüdüğü yoldan notun kayması ve gireceği sıra
  function track(d) {
    const scroll = scrollRef.current?.scrollTop ?? 0
    const last = notes.length - 1
    const left = slotLeft(g, d.from)
    const top = slotTop(g, d.from)
    const x = clamp(left + d.dx, SIDE, slotLeft(g, g.columns - 1))
    const y = clamp(top + d.dy + scroll - d.startScroll, TOP, slotTop(g, last))
    const column = clamp(Math.round((x - SIDE) / g.stepX), 0, g.columns - 1)
    const row = Math.max(0, Math.round((y - TOP) / g.stepY))
    return { ...d, offsetX: x - left, offsetY: y - top, to: clamp(row * g.columns + column, 0, last) }
  }

  // Not panonun üst ya da alt kenarına götürülünce pano o yana kayar, not işaretçinin altında kalır
  useEffect(() => {
    if (!drag?.moving) return
    let frame = 0
    let prev = performance.now()
    const step = (now) => {
      const d = live.current
      const scroll = scrollRef.current
      if (d && scroll && g) {
        const center = slotTop(g, d.from) + d.offsetY + g.cardHeight / 2 - scroll.scrollTop
        let speed = 0
        if (center < EDGE) speed = -(1 - Math.max(0, center) / EDGE)
        else if (center > g.viewHeight - EDGE) speed = Math.min(1, (center - g.viewHeight + EDGE) / EDGE)
        if (speed !== 0) {
          const max = Math.max(0, g.contentHeight - g.viewHeight)
          const next = clamp(scroll.scrollTop + (speed * MAX_SPEED * (now - prev)) / 16, 0, max)
          if (next !== scroll.scrollTop) {
            scroll.scrollTop = next
            const tracked = track(d)
            live.current = tracked
            setDrag(tracked)
          }
        }
      }
      prev = now
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // track ve g her çizimde yenidir; döngü yalnızca sürükleme başlayıp bitince kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.moving])

  function pointerDown(e, note, index) {
    if (!editing || e.button !== 0 || drag) return
    const target = e.currentTarget
    const pointerId = e.pointerId
    const start = { x: e.clientX, y: e.clientY }
    live.current = {
      pending: setTimeout(() => {
        try {
          target.setPointerCapture(pointerId)
        } catch {
          // işaretçi bu arada kalktıysa
        }
        const d = {
          id: note.id,
          pointerId,
          from: index,
          to: index,
          start,
          dx: 0,
          dy: 0,
          offsetX: 0,
          offsetY: 0,
          startScroll: scrollRef.current?.scrollTop ?? 0,
          moving: true,
        }
        live.current = d
        setDrag(d)
      }, HOLD_MS),
      start,
      pointerId,
    }
  }

  function pointerMove(e) {
    const d = live.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.pending) {
      // Basılı tutmadan kaydırılırsa pano kayar
      if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > 8) {
        clearTimeout(d.pending)
        live.current = null
      }
      return
    }
    if (!d.moving) return
    const tracked = track({ ...d, dx: e.clientX - d.start.x, dy: e.clientY - d.start.y })
    live.current = tracked
    setDrag(tracked)
  }

  function pointerUp(e, cancelled = false) {
    const d = live.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.pending) {
      clearTimeout(d.pending)
      live.current = null
      return
    }
    if (!d.moving) return
    const to = cancelled ? d.from : d.to
    // Bırakılan not yerine süzülür, sonra yeni sıra yazılır
    const settled = { ...d, moving: false, to, offsetX: slotLeft(g, to) - slotLeft(g, d.from), offsetY: slotTop(g, to) - slotTop(g, d.from) }
    live.current = settled
    setDrag(settled)
    setTimeout(() => {
      live.current = null
      setDrag(null)
      if (to !== d.from) onMove(d.id, to)
    }, SHIFT_MS)
  }

  // Klavyeyle düzenlerken ok tuşları notu bir sıra öne, geriye, yukarı ya da aşağı taşır
  function keyMove(e, note, index) {
    if (!editing || !g) return
    const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - g.columns, ArrowDown: index + g.columns }
    const to = moves[e.key]
    if (to === undefined || to < 0 || to >= notes.length) return
    e.preventDefault()
    onMove(note.id, to)
  }

  return (
    <div ref={scrollRef} className="lib-scroll-y" style={{ ...styles.area, overflowY: drag ? 'hidden' : 'auto' }}>
      {g && (
        <div style={{ position: 'relative', height: g.contentHeight }}>
          {notes.map((note, index) => {
            let slot = index
            let transform = 'none'
            let held = false
            if (drag) {
              if (drag.id === note.id) {
                held = true
                transform = `translate(${drag.offsetX}px, ${drag.offsetY}px) scale(${drag.moving ? 1.06 : 1})`
              } else {
                if (index > drag.from) slot--
                if (slot >= drag.to) slot++
                transform = `translate(${slotLeft(g, slot) - slotLeft(g, index)}px, ${slotTop(g, slot) - slotTop(g, index)}px)`
              }
            }
            const name = note.title.trim() || 'Pano notu'
            return (
              <div
                key={note.id}
                tabIndex={editing ? 0 : undefined}
                role={editing ? 'listitem' : undefined}
                aria-label={editing ? `${name}, ${index + 1}. sıra — basılı tutup sürükle ya da ok tuşlarıyla taşı` : undefined}
                onPointerDown={(e) => pointerDown(e, note, index)}
                onPointerMove={pointerMove}
                onPointerUp={(e) => pointerUp(e)}
                onPointerCancel={(e) => pointerUp(e, true)}
                onKeyDown={(e) => keyMove(e, note, index)}
                className={editing ? 'lib-board-slot lib-board-editing' : 'lib-board-slot'}
                style={{
                  ...styles.note,
                  left: slotLeft(g, index),
                  top: slotTop(g, index),
                  zIndex: held ? 10 : 0,
                  transform,
                  transition: held && drag?.moving ? 'none' : `transform ${SHIFT_MS}ms ease-out`,
                  touchAction: editing ? 'none' : undefined,
                }}
              >
                <BoardCard
                  note={note}
                  width={g.cardWidth}
                  onPress={editing ? undefined : () => onOpen(note)}
                  onLongPress={editing ? undefined : () => onSelect(note)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  area: {
    position: 'absolute',
    inset: 0,
  },
  note: {
    position: 'absolute',
  },
}
