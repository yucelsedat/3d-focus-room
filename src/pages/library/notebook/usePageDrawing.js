// Seyir defteri: lib/usePageDrawing.ts — sayfanın çizimi: çizgileri, geri al / yinele geçmişi ve
// kaydı. Silgiyle bir sürüşte silinen çizgiler tek adımda geri gelir.
import { useEffect, useRef, useState } from 'react'

import { getPageDrawing, setPageDrawing } from '../api.js'
import { moveStrokes, parseStrokes, serializeStrokes, strokeHit } from './drawing.js'

// Bu kadar adım geri alınabilir
const HISTORY = 60
// Çizim değiştikten bu kadar sonra kaydedilir (ms); arada gelen değişiklikler tek kayıtta toplanır
const SAVE_DELAY = 400

export function usePageDrawing(page) {
  const [strokes, setStrokes] = useState([])
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const current = useRef([])
  const undoStack = useRef([])
  const redoStack = useRef([])
  const erasing = useRef(false)
  const saveTimer = useRef(null)
  const pageRef = useRef(page)

  useEffect(() => {
    let cancelled = false
    pageRef.current = page
    getPageDrawing(page)
      .then((json) => {
        if (cancelled) return
        const list = parseStrokes(json)
        current.current = list
        undoStack.current = []
        redoStack.current = []
        setStrokes(list)
        setHistory({ undo: 0, redo: 0 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      // Sayfadan çıkarken bekleyen kayıt hemen yazılır
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
        setPageDrawing(page, serializeStrokes(current.current)).catch(() => {})
      }
    }
  }, [page])

  function save() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      setPageDrawing(pageRef.current, serializeStrokes(current.current)).catch(() => {})
    }, SAVE_DELAY)
  }

  function show(next) {
    current.current = next
    setStrokes(next)
    setHistory({ undo: undoStack.current.length, redo: redoStack.current.length })
    save()
  }

  function remember() {
    undoStack.current.push(current.current)
    if (undoStack.current.length > HISTORY) undoStack.current.shift()
    redoStack.current = []
  }

  function add(stroke) {
    remember()
    show([...current.current, stroke])
  }

  // Çizgiler tek adımda eklenir (yapıştırılan ya da çoğaltılan çizgiler)
  function addMany(list) {
    if (list.length === 0) return
    remember()
    show([...current.current, ...list])
  }

  // Verilen çizgiler tek adımda kalkar (kesilen ya da silinen seçim)
  function remove(set) {
    const next = current.current.filter((s) => !set.has(s))
    if (next.length === current.current.length) return
    remember()
    show(next)
  }

  // Verilen çizgiler (dx, dy) kadar kayar; tek adımda geri alınır. Kaymış çizgiler döner
  function move(list, dx, dy) {
    const moved = moveStrokes(list, dx, dy)
    const map = new Map(list.map((s, i) => [s, moved[i]]))
    remember()
    show(current.current.map((s) => map.get(s) ?? s))
    return moved
  }

  // Silgi (x, y) çevresinde r yarıçapında bir yere değdi
  function eraseAt(x, y, r) {
    const next = current.current.filter((s) => !strokeHit(s, x, y, r))
    if (next.length === current.current.length) return
    if (!erasing.current) {
      erasing.current = true
      remember()
    }
    show(next)
  }

  function endErase() {
    erasing.current = false
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(current.current)
    show(prev)
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(current.current)
    show(next)
  }

  // Sayfanın bütün çizimi silinir; geri alınabilir
  function clear() {
    if (current.current.length === 0) return
    remember()
    show([])
  }

  return {
    strokes,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    add,
    addMany,
    remove,
    move,
    eraseAt,
    endErase,
    undo,
    redo,
    clear,
  }
}
