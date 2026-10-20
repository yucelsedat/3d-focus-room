// Timeline dokümanı: yükleme + iyimser eşzamanlı kayıt (rev) + çakışma.
// Ay ızgarası, gün canvas'ı ve zaman ekseni aynı belleği paylaşır → görünümler
// arasında geçerken yeniden yükleme yok, bekleyen kayıt kaybolmaz.
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { API, C } from './theme'

export function useTimelineDoc(id) {
  const [items, setItems] = useState(null)       // null: yükleniyor
  const [loadErr, setLoadErr] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | error | conflict
  const [conflict, setConflict] = useState(null)       // { rev, content }
  const itemsRef = useRef(null)
  const bgRef = useRef(C.bg)
  const revRef = useRef(0)
  const saveTimer = useRef(null)
  const inflight = useRef(false)
  const dirty = useRef(false)
  const flushRef = useRef(null)                  // null: çakışma çözülene dek kayıt durur
  const [bg, setBg] = useState(C.bg)

  // ── yükle ──
  useEffect(() => {
    let alive = true
    fetch(`${API}/api/timelines/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => {
        if (!alive) return
        revRef.current = d.rev
        bgRef.current = d.content.bg || C.bg
        setBg(bgRef.current)
        itemsRef.current = d.content.items
        setItems(d.content.items)
      })
      .catch(err => { if (alive) setLoadErr(err.message) })
    return () => { alive = false }
  }, [id])

  // ── kayıt (iyimser eşzamanlılık) ──
  const putBody = () => JSON.stringify({ content: { items: itemsRef.current, bg: bgRef.current, view: null }, rev: revRef.current })

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current); saveTimer.current = null
    if (inflight.current || !dirty.current || !itemsRef.current) return
    inflight.current = true; dirty.current = false
    setSaveState('saving')
    try {
      const r = await fetch(`${API}/api/timelines/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: putBody() })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        revRef.current = d.rev
        setSaveState(dirty.current ? 'dirty' : 'saved')
      } else if (r.status === 409 && d.code === 'rev-mismatch') {
        dirty.current = true
        setConflict({ rev: d.rev, content: d.content })
        setSaveState('conflict')
      } else {
        dirty.current = true
        setSaveState('error')
      }
    } catch {
      dirty.current = true
      setSaveState('error')
    } finally {
      inflight.current = false
    }
    // kayıt sürerken gelen değişiklikler
    if (dirty.current && !saveTimer.current) setTimeout(() => flushRef.current?.(), 3000)
  }, [id])

  useLayoutEffect(() => { flushRef.current = conflict ? null : flush })

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveState(s => (s === 'conflict' ? s : 'dirty'))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveTimer.current = null; flushRef.current?.() }, 700)
  }, [])

  // Sekme kapanırken / pano değişirken bekleyen kaydı keepalive ile gönder
  useEffect(() => {
    const sendNow = () => {
      if (!dirty.current || !itemsRef.current || flushRef.current === null) return
      try { fetch(`${API}/api/timelines/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: putBody(), keepalive: true }) } catch {}
      dirty.current = false
    }
    window.addEventListener('beforeunload', sendNow)
    return () => { window.removeEventListener('beforeunload', sendNow); clearTimeout(saveTimer.current); sendNow() }
  }, [id])

  // items güncelle (+ kayıt). fn: önceki dizi → yeni dizi
  const update = useCallback((fn, save = true) => {
    const next = fn(itemsRef.current)
    itemsRef.current = next
    setItems(next)
    if (save) scheduleSave()
  }, [scheduleSave])

  const resolveConflict = (useTheirs) => {
    if (!conflict) return
    revRef.current = conflict.rev
    if (useTheirs && conflict.content) {
      itemsRef.current = conflict.content.items
      setItems(conflict.content.items)
      dirty.current = false
      setSaveState('saved')
    }
    setConflict(null)
    if (!useTheirs) { dirty.current = true; setTimeout(() => flushRef.current?.(), 0) }
  }

  return { items, itemsRef, loadErr, saveState, conflict, resolveConflict, update, scheduleSave, bg }
}
