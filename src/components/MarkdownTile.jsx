// ── Duvardaki metin (markdown) tile'ı ─────────────────────────────────────────
// PDF defterinin tek bir sayfası duvarda: yazı bloklardan oluşur ve hep biçimli görünür; başlığa,
// paragrafa ya da maddeye tıklayınca yalnızca o satır yerinde Markdown olur (LiveDocText).
//
// Bloklar defterdeki gibidir:
//  - satırın sonunda Enter yeni blok açar, ortasında bloğu ikiye böler; bloğun başında geri silme
//    bloğu bir üstteki blokla birleştirir
//  - yazının altındaki (ya da sağındaki boş kolondaki) boşluğa dokununca sona yeni blok açılır
//  - bloğun solundaki çizgi tutamaçtır: basılı tutup sürükleyince blok yer değiştirir (kolonlar
//    arasında da), Alt+↑ / Alt+↓ bir yukarı / aşağı taşır
//  - üst çubuk: blok seçimi (kopyala, kes, çoğalt, sil; defterlerle ortak blok panosu), panodaki
//    blokları yapıştır, okuma modu, sayfayı temizle. Tile tek sayfadır: aramaya, takvime, ayraca,
//    sayfa eklemeye gerek yoktur.
//  - alt çubuk: defterin biçim çubuğu (DocumentBar): biçimli yapıştır, başlık, kalın, italik, liste,
//    görev, kod bloğu, sesle yazma, görsel ekle ve ham Markdown'a geçiş
// Çubuklar dokunulan / imlecin olduğu kolonun üstünde ve altında açılır.
//
// İçerik düz Markdown olarak saklanır; bloklar en üst düzeydeki Markdown bloklarıdır (bkz.
// mdtile/blocks.js). Tile'ın yüksekliği sabit; yazı kolonlara akar, sığmazsa sağa doğru kolon kolon
// genişler.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import '../pages/library/notebook/notebook.css'
import { PasteButton, SelectionBar } from '../pages/library/notebook/BlockSelection.jsx'
import { clearClipboard, putOnClipboard, takeFromClipboard, useClipboardBlocks } from '../pages/library/notebook/blockClipboard.js'
import { DOC_RENDERED_PAD, leadingHeadingCenter } from '../pages/library/notebook/docLayout.js'
import { LiveDocText, RawDocText } from '../pages/library/notebook/DocText.jsx'
import { DocumentBar } from '../pages/library/notebook/DocumentBar.jsx'
import { HandIcon } from '../pages/library/notebook/HandIcon.jsx'
import { copyMarkdownAcross } from '../pages/library/notebook/richText/markdownCopy.js'
import { insertCodeBlock, toggleInline, toggleLines } from '../pages/library/notebook/richText/markdownEdit.js'
import { parseMarkdown, unitAt } from '../pages/library/notebook/richText/markdownUnits.js'
import { clipboardToMarkdown, looksLikeHtml, padForInsertion } from '../pages/library/notebook/richText/htmlToMarkdown.js'
import { useDictation } from '../pages/library/notebook/useDictation.js'
import { PortalBoxContext } from '../pages/library/portalRoot.js'
import { storageGet, storageSet } from '../pages/library/state.js'
import { docPage, fonts, notebook, notebookFills } from '../pages/library/theme.js'
import { TornPaperMenu } from '../pages/library/TornPaperMenu.jsx'
import { useStore } from '../store/useStore'
import { fitMdCols, MD_COL_PX_W, MD_PX_PER_UNIT } from '../utils/markdownRender'
import {
  blocksFromMarkdown,
  isHeadingBlock,
  joinBlocks,
  newBlockId,
  noteBlockToTexts,
  splitAt,
  splitBlockText,
  textToNoteBlock,
} from './mdtile/blocks.js'
import { rowRects } from './mdtile/geometry.js'
import { TileBlockSelection } from './mdtile/TileBlockSelection.jsx'

const SAVE_DELAY = 700
const PAD = 24
const NOTICE_MS = 2600
const SELECTION_NOTICE_MS = 1600
// Tutamaç basılı tutulunca sürükleme başlar; bu süre dolmadan kayan parmak sürüklemez
const DRAG_HOLD_MS = 280
const DRAG_SLOP = 8
const BAR_GAP = 10

// Tile'da görseller: https, http ve sunucudaki yüklemeler (/uploads/...)
const tileImageOk = (uri) => /^(https?:\/\/|\/(?!\/))/i.test(uri ?? '')
const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i

const isEditable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
const isBlank = (text) => text.trim() === ''
const noop = () => {}

// Panodaki HTML ve düz metin Markdown'a çevrilir (defterin "Biçimli yapıştır"ı ile aynı)
async function readClipboardMarkdown() {
  let html = ''
  let plain = ''
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text()
      if (!plain && item.types.includes('text/plain')) plain = await (await item.getType('text/plain')).text()
    }
  } catch {
    plain = (await navigator.clipboard?.readText?.().catch(() => '')) ?? ''
  }
  if (!html && !plain) return null
  return clipboardToMarkdown({ html: looksLikeHtml(html) ? html : null, plain: plain || html })
}

async function uploadImage(id, file) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/canvas/mdtile-${encodeURIComponent(id)}/upload`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error('upload failed')
  return (await r.json()).url
}

const readingKey = (id) => `focusroom.mdTile.${id}.reading`

export function MarkdownTile({ id, content, width, height }) {
  const updateMedia = useStore((s) => s.updateMedia)
  const pxWidth = Math.round(width * MD_PX_PER_UNIT)
  const pxHeight = Math.round(height * MD_PX_PER_UNIT)
  const nCols = Math.max(1, Math.round(pxWidth / MD_COL_PX_W))

  const [blocks, setBlocksState] = useState(() => blocksFromMarkdown(content))
  const [focused, setFocused] = useState(false)
  const [focusedId, setFocusedId] = useState(null) // yazılan blok
  const [raw, setRaw] = useState(false)
  const [reading, setReading] = useState(() => storageGet(readingKey(id)) === '1')
  const [notice, setNotice] = useState(null)
  const [imageBox, setImageBox] = useState(null) // null | yazılan görsel linki
  const [cols, setCols] = useState(nCols)
  const [barCol, setBarCol] = useState(0) // çubukların durduğu kolon
  const [focusRequest, setFocusRequest] = useState(null) // { id, start, end, seq }
  // Blok seçimi: açıkken bloklar yazılmaz; dokunarak ya da alan çekerek seçilir
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [selectionNotice, setSelectionNotice] = useState(null)
  // Tutamaçtan sürüklenen blok: { id, dx, dy, target: { id, side } | null }
  const [drag, setDrag] = useState(null)
  // Silme / temizleme sorusu
  const [confirm, setConfirm] = useState(null)
  const [portalEl, setPortalEl] = useState(null)
  const clipboardBlocks = useClipboardBlocks()

  const wrapRef = useRef(null)
  const viewRef = useRef(null)
  const fileRef = useRef(null)
  const blocksRef = useRef(blocks)
  const docRefs = useRef(new Map())
  const rowEls = useRef(new Map())
  const savedRef = useRef((content ?? '').trim())
  const saveTimer = useRef(null)
  const focusedRef = useRef(false)
  const requestSeq = useRef(0)
  const appliedSeq = useRef(0)
  // Biçimin, görselin, sesle yazmanın gireceği yer: son yazılan blok ve oradaki imleç / seçim
  const active = useRef(null) // { id, start, end }
  // Seçim kapalıyken panodaki blokların gireceği yer: son dokunulan yazı ya da (boşluğa dokunulduysa) son
  const pasteSpot = useRef(null) // null | 'end' | { id, start, end }
  const dictTarget = useRef(null) // { id, before, after }
  const dragLive = useRef(null)
  const blockBusy = useRef(false)
  const widthRef = useRef(width)
  const colsRef = useRef(cols)
  useLayoutEffect(() => {
    widthRef.current = width
    colsRef.current = cols
    focusedRef.current = focused
  })

  function setBlocks(next) {
    blocksRef.current = next
    setBlocksState(next)
  }

  function cancelDrag() {
    const d = dragLive.current
    if (d?.pending) clearTimeout(d.pending)
    dragLive.current = null
    setDrag(null)
  }

  const findIndex = (blockId) => blocksRef.current.findIndex((b) => b.id === blockId)

  // Dışarıdan gelen değişiklik (başka sekme, EditModal): yazılmıyorsa tile güncellenir
  useEffect(() => {
    const next = (content ?? '').trim()
    if (next === savedRef.current || focusedRef.current) return
    savedRef.current = next
    setBlocks(blocksFromMarkdown(next))
    active.current = null
    pasteSpot.current = null
  }, [content])

  // ─── Kayıt ──────────────────────────────────────────────────────────────────
  async function persist({ grow = false } = {}) {
    const next = joinBlocks(blocksRef.current.map((b) => b.text))
    const neededW = (colsRef.current * MD_COL_PX_W) / MD_PX_PER_UNIT
    const widen = grow && neededW > widthRef.current + 1e-6
    if (next === savedRef.current && !widen) return
    savedRef.current = next
    const body = widen ? { content: next, width: neededW } : { content: next }
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) updateMedia(await r.json())
    } catch (e) {
      console.error('[MarkdownTile] save failed', e)
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      persist()
    }, SAVE_DELAY)
  }

  function flush() {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    persist({ grow: true })
  }

  // Tile kalkarken (oda değişti) bekleyen kayıt hemen yapılır
  useEffect(
    () => () => {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      persist()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ─── Bloklar ────────────────────────────────────────────────────────────────
  function updateBlock(blockId, text) {
    const list = blocksRef.current
    const i = findIndex(blockId)
    if (i < 0 || list[i].text === text) return
    setBlocks(list.map((b, k) => (k === i ? { ...b, text } : b)))
    scheduleSave()
  }

  // Bloğun yazısına odaklan; istek blok çizildikten sonra uygulanır
  function focusBlock(blockId, start, end = start) {
    active.current = { id: blockId, start, end }
    pasteSpot.current = { id: blockId, start, end }
    requestSeq.current += 1
    setFocusRequest({ id: blockId, start, end, seq: requestSeq.current })
  }

  useLayoutEffect(() => {
    const r = focusRequest
    if (!r || appliedSeq.current === r.seq) return
    const doc = docRefs.current.get(r.id)
    if (!doc) return
    appliedSeq.current = r.seq
    doc.focus()
    doc.setSelection(r.start, r.end)
  }, [focusRequest, raw, blocks])

  // Yazma alanından çıkılırken odak tile'da kalsın (çubuklar açık kalır). Odaktaki öğe DOM'dan
  // kalkacaksa önce çağrılır: kalkan öğenin odağı sessizce gider, tile bunu fark edemezdi.
  function keepTileFocus() {
    viewRef.current?.focus({ preventScroll: true })
  }

  // Biçimin / görselin gireceği blok: son yazılan blok; yoksa sondaki boş blok ya da sona yeni blok
  function targetBlock() {
    const a = active.current
    const list = blocksRef.current
    const block = a && list.find((b) => b.id === a.id)
    if (block) {
      const len = block.text.length
      return { block, start: Math.min(a.start, len), end: Math.min(a.end, len) }
    }
    const last = list[list.length - 1]
    if (last && isBlank(last.text)) return { block: last, start: last.text.length, end: last.text.length }
    const fresh = { id: newBlockId(), text: '' }
    setBlocks([...list, fresh])
    return { block: fresh, start: 0, end: 0 }
  }

  // Blok birden çok Markdown bloğu taşıyorsa (ham düzenleme, yapıştırma) bloklara ayrılır. caret
  // verilirse imlecin düştüğü parça döner.
  function normalizeBlock(blockId, caret = null) {
    const list = blocksRef.current
    const i = findIndex(blockId)
    if (i < 0) return null
    const split = splitBlockText(list[i].text, caret)
    if (!split) return caret === null ? null : { id: blockId, offset: caret }
    const parts = split.pieces.map((text, k) => ({ id: k === 0 ? blockId : newBlockId(), text }))
    setBlocks([...list.slice(0, i), ...parts, ...list.slice(i + 1)])
    scheduleSave()
    if (!split.caret) return null
    return { id: parts[split.caret.index].id, offset: split.caret.offset }
  }

  // Enter: blok imlecin olduğu yerden ikiye bölünür, arkası hemen altına açılan yeni bloğa geçer
  function enterBlock(blockId, at) {
    const list = blocksRef.current
    const i = findIndex(blockId)
    if (i < 0) return
    endDictationHere()
    const { head, tail } = splitAt(list[i].text, at)
    const fresh = { id: newBlockId(), text: tail }
    setBlocks([...list.slice(0, i), { ...list[i], text: head }, fresh, ...list.slice(i + 1)])
    scheduleSave()
    focusBlock(fresh.id, 0)
  }

  // Bloğun en başında geri silme: blok bir üstteki bloğun sonuna eklenir. Üstteki blok boşsa o
  // kalkar; görselle, kodla, tabloyla bitiyorsa birleşmez, imleç üstteki son yazıya geçer.
  function mergeBack(blockId) {
    const i0 = findIndex(blockId)
    if (i0 <= 0) return
    endDictationHere()
    const prev = blocksRef.current[i0 - 1]
    if (isBlank(prev.text)) {
      setBlocks(blocksRef.current.filter((b) => b.id !== prev.id))
      scheduleSave()
      focusBlock(blockId, 0)
      return
    }
    const units = parseMarkdown(prev.text).units
    const last = units[units.length - 1]
    const textual = last && isBlank(prev.text.slice(last.end))
    const removesCur = textual || isBlank(blocksRef.current[i0].text)
    // Yazılan blok kalkacak: odak önce tile'a geçer (bu sırada blok kendi parçalarına ayrılabilir)
    if (removesCur) keepTileFocus()
    const list = blocksRef.current
    const cur = list.find((b) => b.id === blockId)
    if (!cur) return
    if (textual) {
      const cut = prev.text.replace(/\s+$/, '')
      setBlocks(list.flatMap((b) => (b.id === cur.id ? [] : b.id === prev.id ? [{ ...prev, text: cut + cur.text }] : [b])))
      scheduleSave()
      focusBlock(prev.id, cut.length)
      return
    }
    if (removesCur) {
      setBlocks(list.filter((b) => b.id !== cur.id))
      scheduleSave()
    }
    if (last) focusBlock(prev.id, last.end)
  }

  // Yazının altındaki ya da sağındaki boşluğa dokunuldu: sona yeni blok açılır (son blok boşsa
  // ona yazılır). Blokların arasındaki boşluğa dokunmak blok açmaz.
  function tapEmpty(e) {
    if (e.target !== e.currentTarget || reading || selecting) return
    pasteSpot.current = 'end'
    const list = blocksRef.current
    const last = list[list.length - 1]
    if (last) {
      const rects = rowRects(rowEls.current.get(last.id))
      const r = rects[rects.length - 1]
      const after = !r || e.clientX > r.right || (e.clientY > r.bottom && e.clientX >= r.left)
      if (!after) return
      if (isBlank(last.text)) {
        focusBlock(last.id, last.text.length)
        return
      }
    }
    const fresh = { id: newBlockId(), text: '' }
    setBlocks([...list, fresh])
    focusBlock(fresh.id, 0)
  }

  // ─── Kolonlar ───────────────────────────────────────────────────────────────
  // Yazı tile'a sığmıyorsa görünüm sağa doğru tam genişlikte kolon ekler (kırpılmaz)
  function refit() {
    const el = viewRef.current
    // Sürüklenen blok kaydırıldığı için taşma alanını büyütür; bırakılana kadar kolonlar ölçülmez
    if (!el || (dragLive.current && !dragLive.current.pending)) return
    const n = fitMdCols(el, nCols)
    setCols((prev) => (prev === n ? prev : n))
  }
  useLayoutEffect(refit)
  // Görseller yüklendikçe yazı uzar
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onLoad = () => refit()
    el.addEventListener('load', onLoad, true)
    return () => el.removeEventListener('load', onLoad, true)
  })
  // Odakta değilken yazı tile'dan taşıyorsa (ör. görsel yüklendi) tile kalıcı olarak genişler
  useEffect(() => {
    if (!focused && cols > nCols) persist({ grow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, focused, nCols])

  // Tile 3D'de ölçekli / dönük durur: ekrandaki nokta tile'ın kendi ölçüsüne çevrilir
  function toLocal(clientX, clientY) {
    const view = viewRef.current
    if (!view) return { x: 0, y: 0 }
    const r = view.getBoundingClientRect()
    const sx = r.width ? view.offsetWidth / r.width : 1
    const sy = r.height ? view.offsetHeight / r.height : 1
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy }
  }

  // Çubuklar dokunulan / imlecin olduğu kolonun üstünde ve altında açılır
  function columnAtX(clientX) {
    const view = viewRef.current
    if (!view) return
    const r = view.getBoundingClientRect()
    if (!r.width) return
    const px = ((clientX - r.left) / r.width) * view.offsetWidth
    const c = Math.max(0, Math.min(colsRef.current - 1, Math.floor(px / MD_COL_PX_W)))
    setBarCol((prev) => (prev === c ? prev : c))
  }
  function columnAtCaret() {
    const view = viewRef.current
    const s = window.getSelection?.()
    let rect = null
    if (s && s.rangeCount && view?.contains(s.anchorNode)) {
      const rects = s.getRangeAt(0).getClientRects()
      rect = rects[rects.length - 1] ?? null
    }
    // Boş satırda imlecin dikdörtgeni olmaz; ham yazıda seçim DOM'da değildir → odaktaki alan
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const el = document.activeElement
      if (!el || el === view || !view?.contains(el)) return
      rect = el.getBoundingClientRect()
    }
    columnAtX(rect.left + 1)
  }

  useEffect(() => {
    if (notice === null) return
    const t = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (selectionNotice === null) return
    const t = setTimeout(() => setSelectionNotice(null), SELECTION_NOTICE_MS)
    return () => clearTimeout(t)
  }, [selectionNotice])

  // ─── Odak ───────────────────────────────────────────────────────────────────
  function endEditing() {
    if (!focusedRef.current) return
    focusedRef.current = false
    setFocused(false)
    setFocusedId(null)
    setImageBox(null)
    setSelecting(false)
    setSelectedIds(new Set())
    cancelDrag()
    // Boş bloklar kalkar (sesle yazılan blok hariç)
    const list = blocksRef.current
    const kept = list.filter((b) => !isBlank(b.text) || b.id === dictTarget.current?.id)
    if (kept.length !== list.length) setBlocks(kept)
    flush()
  }

  function onWrapFocus() {
    if (!focused) setFocused(true)
  }
  function onWrapBlur(e) {
    const to = e.relatedTarget
    if (e.currentTarget.contains(to)) return
    // Odak tile'ın dışındaki bir öğeye geçti
    if (to) {
      endEditing()
      return
    }
    // Gidilen yer yok: dışarı dokunulduysa pointerdown zaten bitirdi. Odaktaki öğe DOM'dan kalktıysa
    // ya da yer değiştirdiyse (blok silindi, sürüklenip bırakıldı) odak tile'a döner.
    requestAnimationFrame(() => {
      if (!focusedRef.current || wrapRef.current?.contains(document.activeElement)) return
      const el = document.activeElement
      if (el && el !== document.body) endEditing()
      else keepTileFocus()
    })
  }
  // Odaktaki öğe DOM'dan kalkınca odak sessizce gider (blur gelmez); tile'ın dışına dokunulunca da
  // yazma biter
  useEffect(() => {
    if (!focused) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) endEditing()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  })

  // ─── Biçim çubuğu ───────────────────────────────────────────────────────────
  // Düzenleme imlecin olduğu bloğa (seçim varsa seçime) uygulanır
  function applyEdit(apply) {
    endDictationHere()
    const t = targetBlock()
    const edit = apply(t.block.text, t.start, t.end)
    updateBlock(t.block.id, edit.text)
    active.current = { id: t.block.id, start: edit.start, end: edit.end }
    return { id: t.block.id, edit }
  }

  function editMarkdown(apply) {
    if (reading) return
    const { id: blockId, edit } = applyEdit(apply)
    focusBlock(blockId, edit.start, edit.end)
  }

  const formatInline = (format) => editMarkdown((t, s, e) => toggleInline(t, s, e, format))
  const formatLines = (format) => editMarkdown((t, s, e) => toggleLines(t, s, e, format))

  // Kod blokları yazı birimi değildir: kod bloğu ham Markdown'da açılır, imleç çitlerin içine girer
  function addCode() {
    if (reading) return
    setRaw(true)
    editMarkdown(insertCodeBlock)
  }

  function toggleRaw() {
    const a = active.current
    if (a && findIndex(a.id) >= 0) focusBlock(a.id, a.start, a.end)
    else keepTileFocus()
    setRaw((r) => !r)
  }

  // İmleç (ör. görsel kutusu kapanınca) son yazılan yere döner
  function refocus() {
    const a = active.current
    if (a && findIndex(a.id) >= 0) focusBlock(a.id, a.start, a.end)
    else keepTileFocus()
  }

  // ─── Yapıştırma ─────────────────────────────────────────────────────────────
  // Panodaki zengin metin Markdown'a çevrilip imlecin yerine girer; birden çok Markdown bloğu
  // taşıyorsa her biri ayrı blok olur
  function pasteMarkdown(result) {
    if (reading) return
    if (!result || result.text.trim() === '') {
      setNotice('Panoda yapıştırılacak yazı yok')
      return
    }
    const { id: blockId, edit } = applyEdit((text, start, end) => {
      const before = text.slice(0, start)
      const after = text.slice(end)
      const inserted = padForInsertion(result.text, before, after)
      const caret = start + inserted.length
      return { text: before + inserted + after, start: caret, end: caret }
    })
    const at = normalizeBlock(blockId, edit.end) ?? { id: blockId, offset: edit.end }
    active.current = { id: at.id, start: at.offset, end: at.offset }
    pasteSpot.current = { ...active.current }
    // Biçimli yapıştırılan yazı hemen biçimli görünsün: yazma kapanır, tile odakta kalır
    if (result.rich) keepTileFocus()
    else focusBlock(at.id, at.offset)
    setNotice(
      result.missingLinks > 0
        ? `${result.missingLinks} linkin adresi kaynakta yok, düz metin olarak eklendi`
        : result.rich
          ? 'Biçimli metin olarak yapıştırıldı'
          : 'Panoda biçimli metin yok, düz metin olarak eklendi',
    )
  }

  // Yazı alanının dışındayken (boşluğa dokunulmuş, tutamaç seçili) yapıştırılan şey de girer
  function onWrapPaste(e) {
    if (reading || selecting || isEditable(e.target) || !e.clipboardData) return
    const image = [...(e.clipboardData.files ?? [])].find((f) => f.type.startsWith('image/'))
    e.preventDefault()
    if (image) {
      pasteImageFile(image)
      return
    }
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    if (!html && !plain) return
    pasteMarkdown(clipboardToMarkdown({ html: looksLikeHtml(html) ? html : null, plain: plain || html }))
  }

  // Görseller imlecin olduğu birimin (paragraf, madde) altına kendi blokları olarak girer; blok
  // orada bölünür, yazmaya görselin altındaki bloktan devam edilir. Art arda görseller şerit olur.
  function insertImages(urls) {
    if (urls.length === 0 || reading) return
    endDictationHere()
    const t = targetBlock()
    const text = t.block.text
    let cut = 0
    if (!isBlank(text)) {
      const unit = unitAt(parseMarkdown(text).units, t.end)
      cut = unit ? unit.end : text.length
    }
    const { head, tail } = splitAt(text, cut)
    const image = { id: newBlockId(), text: urls.map((u) => `![](${u})`).join('\n') }
    const after = { id: newBlockId(), text: tail }
    const list = blocksRef.current
    const i = list.findIndex((b) => b.id === t.block.id)
    const parts = [...(isBlank(head) ? [] : [{ ...t.block, text: head }]), image, after]
    if (isBlank(head)) keepTileFocus()
    setBlocks([...list.slice(0, i), ...parts, ...list.slice(i + 1)])
    scheduleSave()
    focusBlock(after.id, 0)
  }

  function insertText(str) {
    editMarkdown((text, start, end) => {
      const caret = start + str.length
      return { text: text.slice(0, start) + str + text.slice(end), start: caret, end: caret }
    })
  }

  async function pasteImageFile(file) {
    setNotice('Görsel yükleniyor…')
    try {
      insertImages([await uploadImage(id, file)])
      setNotice(null)
    } catch {
      setNotice('Görsel yüklenemedi')
    }
  }

  async function pickFiles(files) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setImageBox(null)
    setNotice('Görsel yükleniyor…')
    try {
      const urls = []
      for (const f of list) urls.push(await uploadImage(id, f))
      insertImages(urls)
      setNotice(null)
    } catch {
      setNotice('Görsel yüklenemedi')
    }
  }

  function submitImageBox() {
    const urls = (imageBox ?? '').split(/\s+/).filter((u) => tileImageOk(u))
    setImageBox(null)
    if (urls.length === 0) {
      setNotice('Geçerli bir görsel linki yok')
      refocus()
      return
    }
    insertImages(urls)
  }

  // ─── Sesle yazma ────────────────────────────────────────────────────────────
  const dictation = useDictation({
    onTranscript: (spoken) => {
      const t = dictTarget.current
      if (!t || findIndex(t.id) < 0) return
      const lead = spoken && t.before && !/\s$/.test(t.before) ? ' ' : ''
      const trail = spoken && t.after && !/^\s/.test(t.after) ? ' ' : ''
      updateBlock(t.id, t.before + lead + spoken + trail + t.after)
      const caret = (t.before + lead + spoken).length
      active.current = { id: t.id, start: caret, end: caret }
    },
    onEnd: () => finishDictation(),
    onError: (message) => setNotice(message),
  })

  // Dinleme bitti: hiçbir şey söylenmediyse yeni açılan boş blok kalkar
  function finishDictation() {
    const t = dictTarget.current
    dictTarget.current = null
    const i = t ? findIndex(t.id) : -1
    // Kullanıcı bu arada o bloğa yazmaya başladıysa blok kalır
    if (i >= 0 && isBlank(blocksRef.current[i].text) && !rowEls.current.get(t.id)?.contains(document.activeElement)) {
      setBlocks(blocksRef.current.filter((b) => b.id !== t.id))
    }
    flush()
  }

  // Blok elle değiştirilirse sesle yazma o noktada bırakılır
  function endDictationHere() {
    if (!dictTarget.current) return
    dictTarget.current = null
    dictation.cancel()
  }

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop()
      return
    }
    if (reading) return
    // Yazma kapanır (klavye söyleneni bozmasın); tile odakta kalır, çubuk açık durur
    keepTileFocus()
    const t = targetBlock()
    dictTarget.current = { id: t.block.id, before: t.block.text.slice(0, t.start), after: t.block.text.slice(t.end) }
    if (!dictation.start()) dictTarget.current = null
  }

  // ─── Blok seçimi ve pano ────────────────────────────────────────────────────
  function changeSelecting(next) {
    if (next) {
      endDictationHere()
      if (dictation.listening) dictation.stop()
      setImageBox(null)
      cancelDrag()
    }
    keepTileFocus()
    setSelecting(next)
    setSelectedIds(new Set())
    setSelectionNotice(null)
  }

  function tapBlock(blockId) {
    if (!blockId) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }

  const selectedBlocks = () => blocksRef.current.filter((b) => selectedIds.has(b.id))

  // Seçili bloklarla yapılan iş; iş bitene kadar düğmelere yeniden basılması yok sayılır
  async function withBlocks(work) {
    const picked = selectedBlocks()
    if (picked.length === 0 || blockBusy.current) return
    blockBusy.current = true
    await work(picked).finally(() => {
      blockBusy.current = false
    })
  }

  // Bloklar uygulamanın blok panosuna (defterlerle ortak), Markdown'ları sistemin panosuna
  async function copyToClipboard(picked) {
    await putOnClipboard(picked.map((b) => textToNoteBlock(b.text)))
    const text = joinBlocks(picked.map((b) => b.text))
    if (text.trim() !== '') navigator.clipboard?.writeText(text).catch(() => {})
  }

  function removeBlocks(ids) {
    if (!blocksRef.current.some((b) => ids.has(b.id))) return
    keepTileFocus()
    setBlocks(blocksRef.current.filter((b) => !ids.has(b.id)))
    scheduleSave()
    if (active.current && ids.has(active.current.id)) active.current = null
    const spot = pasteSpot.current
    if (spot && spot !== 'end' && ids.has(spot.id)) pasteSpot.current = null
    setSelectedIds(new Set())
  }

  function copySelection() {
    withBlocks(async (picked) => {
      await copyToClipboard(picked)
      changeSelecting(false)
    })
  }

  function cutSelection() {
    withBlocks(async (picked) => {
      await copyToClipboard(picked)
      removeBlocks(new Set(picked.map((b) => b.id)))
      changeSelecting(false)
    })
  }

  function deleteSelection() {
    const picked = selectedBlocks()
    if (picked.length === 0) return
    setConfirm({
      title: 'Blokları sil',
      message: picked.length === 1 ? 'Seçili blok silinsin mi?' : `Seçili ${picked.length} blok silinsin mi?`,
      action: 'Sil',
      run: () => {
        removeBlocks(new Set(picked.map((b) => b.id)))
        setSelectionNotice('silindi')
      },
    })
  }

  // Kopyalar seçili blokların en altındakinin hemen altına gelir; seçim kopyalara geçer
  function duplicateSelection() {
    const picked = selectedBlocks()
    if (picked.length === 0) return
    const copies = picked.map((b) => ({ id: newBlockId(), text: b.text }))
    const list = blocksRef.current
    const at = list.findIndex((b) => b.id === picked[picked.length - 1].id) + 1
    setBlocks([...list.slice(0, at), ...copies, ...list.slice(at)])
    scheduleSave()
    setSelectedIds(new Set(copies.map((b) => b.id)))
    setSelectionNotice('çoğaltıldı')
  }

  function confirmClearClipboard() {
    setConfirm({ title: 'Panoyu boşalt', message: 'Kopyalanan bloklar panodan silinsin mi?', action: 'Boşalt', run: clearClipboard })
  }

  // Panodaki bloklar (bu ya da başka bir tile'dan, defterden) yapıştırılır. Seçim açıksa seçili
  // blokların yerine (seçili blok yoksa sona) gelir. Kapalıysa son dokunulan yere: yazının içindeyse
  // blok imleçten ikiye bölünür, araya girer; boş bloğa dokunulduysa onun yerine geçer.
  function pasteBlocks() {
    if (blockBusy.current || reading) return
    const texts = takeFromClipboard().flatMap(noteBlockToTexts)
    if (texts.length === 0) return
    endDictationHere()
    keepTileFocus()
    const fresh = texts.map((text) => ({ id: newBlockId(), text }))
    const list = blocksRef.current
    let next
    if (selecting) {
      const first = list.findIndex((b) => selectedIds.has(b.id))
      const at = first === -1 ? list.length : first
      next = [...list.slice(0, at).filter((b) => !selectedIds.has(b.id)), ...fresh, ...list.slice(at).filter((b) => !selectedIds.has(b.id))]
      setSelectedIds(new Set(fresh.map((b) => b.id)))
      setSelectionNotice('yapıştırıldı')
    } else {
      const spot = pasteSpot.current
      const i = spot && spot !== 'end' ? list.findIndex((b) => b.id === spot.id) : -1
      if (i === -1) {
        next = [...list, ...fresh]
      } else {
        const block = list[i]
        const cut = Math.min(spot.end, block.text.length)
        if (isBlank(block.text)) next = [...list.slice(0, i), ...fresh, ...list.slice(i + 1)]
        else if (cut === 0) next = [...list.slice(0, i), ...fresh, ...list.slice(i)]
        else if (isBlank(block.text.slice(cut))) next = [...list.slice(0, i + 1), ...fresh, ...list.slice(i + 1)]
        else {
          const { head, tail } = splitAt(block.text, cut)
          next = [...list.slice(0, i), { ...block, text: head }, ...fresh, { id: newBlockId(), text: tail }, ...list.slice(i + 1)]
        }
      }
      pasteSpot.current = null
      active.current = null
    }
    setBlocks(next)
    scheduleSave()
  }

  // Sayfadaki bütün bloklar silinir
  function clearPage() {
    if (blocksRef.current.length === 0) return
    setConfirm({
      title: 'Sayfayı temizle',
      message: 'Bu tile\'daki bütün yazılar ve görseller silinsin mi? Bu geri alınamaz.',
      action: 'Temizle',
      run: () => {
        endDictationHere()
        if (selecting) changeSelecting(false)
        removeBlocks(new Set(blocksRef.current.map((b) => b.id)))
      },
    })
  }

  function closeConfirm(run) {
    keepTileFocus()
    setConfirm(null)
    run?.()
  }

  // ─── Okuma modu ─────────────────────────────────────────────────────────────
  // Açıkken yazı yalnızca okunur: dokunmak yazmayı açmaz, tutamaçlar ve biçim çubuğu kalkar
  function toggleReading() {
    const next = !reading
    storageSet(readingKey(id), next ? '1' : '0')
    if (next) {
      endDictationHere()
      if (dictation.listening) dictation.stop()
      setSelecting(false)
      setSelectedIds(new Set())
      setImageBox(null)
      cancelDrag()
      keepTileFocus()
      const list = blocksRef.current
      const kept = list.filter((b) => !isBlank(b.text))
      if (kept.length !== list.length) setBlocks(kept)
      flush()
    }
    setReading(next)
  }

  // ─── Blokları sürükleyerek sıralama ─────────────────────────────────────────
  // Yazı kolonlara aktığından bırakılacak yer iki boyutta bulunur: işaretçinin üstünde durduğu
  // blok parçasının üst yarısı → önüne, alt yarısı → ardına; boşluktaysa aynı kolonda en yakın blok
  function dropTarget(x, y, fromId) {
    const order = blocksRef.current.map((b) => b.id).filter((bid) => bid !== fromId)
    if (order.length === 0) return null
    const frags = order.flatMap((bid) => rowRects(rowEls.current.get(bid)).map((r, k, all) => ({ id: bid, r, k, last: k === all.length - 1 })))
    if (frags.length === 0) return null
    const hit = frags.find((f) => x >= f.r.left && x <= f.r.right && y >= f.r.top && y <= f.r.bottom)
    if (hit) return { id: hit.id, side: hit.k === 0 && y < (hit.r.top + hit.r.bottom) / 2 ? 'before' : 'after' }
    // Yazının sağındaki boş kolon: en sona
    if (x > Math.max(...frags.map((f) => f.r.right))) return { id: order[order.length - 1], side: 'after' }
    // Kolon aralığındaysa en yakın kolona çekilir
    let cx = x
    if (!frags.some((f) => x >= f.r.left && x <= f.r.right)) {
      const near = frags.reduce((a, f) => {
        const d = Math.min(Math.abs(x - f.r.left), Math.abs(x - f.r.right))
        return !a || d < a.d ? { d, x: (f.r.left + f.r.right) / 2 } : a
      }, null)
      cx = near.x
    }
    const column = frags.filter((f) => cx >= f.r.left && cx <= f.r.right)
    const above = column.filter((f) => f.r.bottom <= y).sort((a, b) => b.r.bottom - a.r.bottom)[0]
    if (above) return { id: above.id, side: 'after' }
    const below = column.filter((f) => f.r.top >= y).sort((a, b) => a.r.top - b.r.top)[0]
    if (below) return { id: below.id, side: 'before' }
    return { id: order[order.length - 1], side: 'after' }
  }

  function movedOrder(fromId, target) {
    const list = blocksRef.current
    const moving = list.find((b) => b.id === fromId)
    const rest = list.filter((b) => b.id !== fromId)
    let at = rest.findIndex((b) => b.id === target.id)
    if (!moving || at < 0) return null
    if (target.side === 'after') at += 1
    const next = [...rest.slice(0, at), moving, ...rest.slice(at)]
    return next.every((b, i) => b === list[i]) ? null : next
  }

  function moveBlock(fromId, target) {
    const next = target && movedOrder(fromId, target)
    if (!next) return
    setBlocks(next)
    scheduleSave()
  }

  function gripProps(blockId) {
    return {
      onPointerDown: (e) => {
        if (e.button !== 0 || dragLive.current || selecting || reading) return
        e.preventDefault()
        const target = e.currentTarget
        const start = { x: e.clientX, y: e.clientY }
        const pointerId = e.pointerId
        dragLive.current = {
          pending: setTimeout(() => {
            try {
              target.setPointerCapture(pointerId)
            } catch {
              // işaretçi bu arada kalktıysa
            }
            // Yazma kapanır, odak tile'da (tutamaçta) kalır
            target.focus({ preventScroll: true })
            dragLive.current = { id: blockId, start, pointerId, target: null }
            setDrag({ id: blockId, dx: 0, dy: 0, target: null })
          }, DRAG_HOLD_MS),
          start,
          pointerId,
        }
      },
      onPointerMove: (e) => {
        const d = dragLive.current
        if (!d || e.pointerId !== d.pointerId) return
        if (d.pending) {
          if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > DRAG_SLOP) cancelDrag()
          return
        }
        const a = toLocal(d.start.x, d.start.y)
        const b = toLocal(e.clientX, e.clientY)
        const t = dropTarget(e.clientX, e.clientY, d.id)
        d.target = t && movedOrder(d.id, t) ? t : null
        setDrag({ id: d.id, dx: b.x - a.x, dy: b.y - a.y, target: d.target })
      },
      onPointerUp: (e) => {
        const d = dragLive.current
        if (!d || e.pointerId !== d.pointerId) return
        if (d.pending) {
          cancelDrag()
          return
        }
        dragLive.current = null
        setDrag(null)
        moveBlock(d.id, d.target)
      },
      onPointerCancel: cancelDrag,
      // Klavyeyle: Alt+↑ / Alt+↓ bloğu bir yukarı / aşağı taşır
      onKeyDown: (e) => {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
        e.preventDefault()
        const list = blocksRef.current
        const i = findIndex(blockId)
        const j = e.key === 'ArrowUp' ? i - 1 : i + 1
        if (i < 0 || j < 0 || j >= list.length) return
        moveBlock(blockId, { id: list[j].id, side: e.key === 'ArrowUp' ? 'before' : 'after' })
      },
    }
  }

  // ─── Klavye ─────────────────────────────────────────────────────────────────
  function onKeyDownCapture(e) {
    if (e.nativeEvent.isComposing || e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    if (confirm) closeConfirm()
    else if (imageBox !== null) {
      setImageBox(null)
      refocus()
    } else if (drag) cancelDrag()
    else if (selecting) changeSelecting(false)
    else {
      document.activeElement?.blur?.()
      endEditing()
    }
  }

  // Seçim açıkken Ctrl+C / Ctrl+X kopyalar / keser, Ctrl+V panodakileri yapıştırır, Delete siler.
  // Seçim, sürükleme, soru açıkken ya da tutamaç odaktayken tuşlar oyuna gitmez (WASD / oklar
  // yürütür, E / Q / R / B menü açardı).
  function onKeyDown(e) {
    if (isEditable(e.target)) return
    if (selecting && !confirm) {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      let handled = true
      if (mod && key === 'c') copySelection()
      else if (mod && key === 'x') cutSelection()
      else if (mod && key === 'v' && clipboardBlocks > 0) pasteBlocks()
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection()
      else handled = false
      if (handled) e.preventDefault()
    }
    const held = selecting || drag !== null || confirm !== null || e.target.classList?.contains('mdtile-grip')
    if (held && e.key !== 'Tab') e.stopPropagation()
  }

  // Çubukların boş yerine basmak odağı tile'dan almasın (çubuklar kapanırdı)
  function keepFocusOnBar(e) {
    if (!e.target.closest('input, textarea, button, [contenteditable]')) e.preventDefault()
  }

  // Seçim birden çok bloğa yayılıyorsa her bloğun seçilen yeri kendi Markdown'ıyla kopyalanır
  function onCopy(e) {
    if (e.isDefaultPrevented() || e.nativeEvent.defaultPrevented) return
    copyMarkdownAcross(
      e,
      blocksRef.current.map((b) => ({ root: rowEls.current.get(b.id), source: b.text })),
    )
  }

  // ─── Görünüm ────────────────────────────────────────────────────────────────
  const showBars = focused || dictation.listening || confirm !== null
  const Doc = raw ? RawDocText : LiveDocText
  const viewWidth = cols * MD_COL_PX_W
  const order = useMemo(() => blocks.map((b) => b.id), [blocks])
  const portalBox = useMemo(() => (portalEl ? { el: portalEl, width: viewWidth, height: pxHeight } : null), [portalEl, viewWidth, pxHeight])
  const selectedCount = blocks.filter((b) => selectedIds.has(b.id)).length
  const barLeft = barCol * MD_COL_PX_W

  function gripOffset(block) {
    const center = !raw || focusedId !== block.id ? leadingHeadingCenter(block.text) : null
    return center === null ? 0 : Math.max(0, Math.round(DOC_RENDERED_PAD + center - docPage.lineHeight / 2))
  }

  function rowClass(block) {
    let name = 'mdtile-row'
    if (isHeadingBlock(block.text)) name += ' is-heading'
    if (selecting && selectedIds.has(block.id)) name += ' is-selected'
    if (drag?.id === block.id) name += ' is-lifted'
    if (drag?.target?.id === block.id) name += ` drop-${drag.target.side}`
    return name
  }

  return (
    <div
      ref={wrapRef}
      className="mdtile-live-wrap"
      style={{ position: 'relative', width: `${pxWidth}px`, height: `${pxHeight}px` }}
      onFocus={onWrapFocus}
      onBlur={onWrapBlur}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      onPaste={onWrapPaste}
      onCopy={onCopy}
      onCut={onCopy}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{TILE_CSS}</style>

      {showBars && (
        <div className="mdtile-top" style={{ bottom: `calc(100% + ${BAR_GAP}px)`, left: `${barLeft}px` }} onMouseDown={keepFocusOnBar}>
          {!reading && (
            <HandIcon
              shape="select"
              label={selecting ? 'Blok seçimini kapat' : 'Blok seç'}
              size={28}
              selected={selecting}
              color={selecting ? notebookFills.selectionInk : undefined}
              onPress={() => changeSelecting(!selecting)}
            />
          )}
          {!reading && clipboardBlocks > 0 && <PasteButton onPress={pasteBlocks} onLongPress={confirmClearClipboard} />}
          <HandIcon
            shape="book"
            label={reading ? 'Okuma modunu kapat' : 'Okuma modu'}
            size={28}
            selected={reading}
            fill={reading ? notebookFills.readingFill : undefined}
            onPress={toggleReading}
          />
          {!reading && (
            <HandIcon shape="eraser" label="Sayfayı temizle" size={28} disabled={blocks.length === 0} onPress={clearPage} />
          )}
        </div>
      )}

      <div
        ref={viewRef}
        className={`mdtile-live${reading ? ' is-reading' : ''}`}
        // Tıklanınca odak alır: görsele/boşluğa tıklayınca da çubuklar açılır
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: `${pxHeight}px`,
          padding: `${PAD}px`,
          columnGap: `${PAD * 2}px`,
          borderColor: dictation.listening ? '#ef4444' : selecting ? notebookFills.selectionInk : focused ? '#60a5fa' : 'transparent',
        }}
        onMouseDown={(e) => columnAtX(e.clientX)}
        onClick={tapEmpty}
      >
        {blocks.map((block) => {
          const lifted = drag?.id === block.id
          return (
            <div
              key={block.id}
              ref={(el) => {
                if (el) rowEls.current.set(block.id, el)
                else rowEls.current.delete(block.id)
              }}
              className={rowClass(block)}
              style={lifted ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
            >
              {focused && !reading && !selecting && (
                // Çizgi bloğun tutamacıdır: basılı tutup sürükleyince blok yer değiştirir
                <div
                  {...gripProps(block.id)}
                  role="button"
                  tabIndex={0}
                  aria-label="Blok — basılı tutup sürükle ya da Alt+ok tuşlarıyla taşı"
                  title="Basılı tutup sürükle"
                  className="nb-grip mdtile-grip"
                >
                  <span className="mdtile-dash" style={{ marginTop: gripOffset(block) }} aria-hidden="true">
                    —
                  </span>
                </div>
              )}
              <Doc
                ref={(handle) => {
                  if (handle) docRefs.current.set(block.id, handle)
                  else docRefs.current.delete(block.id)
                }}
                value={block.text}
                readOnly={reading}
                placeholder="Yaz…"
                imageOk={tileImageOk}
                onChangeText={(text) => {
                  if (dictTarget.current?.id === block.id) endDictationHere()
                  updateBlock(block.id, text)
                }}
                onSelectionChange={noop}
                onSelect={(start, end) => {
                  active.current = { id: block.id, start, end }
                  pasteSpot.current = { id: block.id, start, end }
                  columnAtCaret()
                }}
                onFocus={() => {
                  setFocusedId(block.id)
                  if (active.current?.id !== block.id) {
                    const len = block.text.length
                    active.current = { id: block.id, start: len, end: len }
                    pasteSpot.current = { ...active.current }
                  }
                }}
                onBlur={() => {
                  setFocusedId((prev) => (prev === block.id ? null : prev))
                  normalizeBlock(block.id)
                }}
                onEnter={(at) => enterBlock(block.id, at)}
                onBackspaceAtStart={() => mergeBack(block.id)}
                onPasteMarkdown={pasteMarkdown}
                onPasteImage={pasteImageFile}
                onPasteLink={(url) => (IMAGE_URL.test(url) ? insertImages([url]) : insertText(url))}
              />
            </div>
          )
        })}
        {blocks.length === 0 && !reading && (
          // Boş tile soluk bir davetle başlar; dokununca ilk blok açılır
          <div className="mdtile-hint" aria-hidden="true">
            Yazmaya başla…
          </div>
        )}
      </div>

      {selecting && (
        <TileBlockSelection
          rows={(blockId) => rowEls.current.get(blockId)}
          order={order}
          selected={selectedIds}
          onTap={tapBlock}
          onSweep={(ids) => setSelectedIds(new Set(ids))}
          toLocal={toLocal}
          style={{ width: `${viewWidth}px`, height: `${pxHeight}px` }}
        />
      )}

      {showBars && !reading && (
        <div className="mdtile-bar" style={{ top: `${pxHeight + BAR_GAP}px`, left: `${barLeft}px` }} onMouseDown={keepFocusOnBar}>
          {selecting ? (
            <div className="mdtile-selbar">
              <SelectionBar
                count={selectedCount}
                notice={selectionNotice}
                onCopy={copySelection}
                onCut={cutSelection}
                onDuplicate={duplicateSelection}
                onDelete={deleteSelection}
              />
            </div>
          ) : (
            <>
              {imageBox !== null && (
                <div className="mdtile-imagebox">
                  <input
                    autoFocus
                    type="text"
                    value={imageBox}
                    placeholder="Görsel linki (https://…) — birden çoksa boşlukla ayır, Enter"
                    onChange={(e) => setImageBox(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        submitImageBox()
                      }
                    }}
                  />
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={submitImageBox}>
                    Ekle
                  </button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
                    Dosyadan…
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      pickFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </div>
              )}
              <DocumentBar
                listening={dictation.listening}
                onPaste={async () => pasteMarkdown(await readClipboardMarkdown().catch(() => null))}
                onHeading={() => formatLines('heading')}
                onBold={() => formatInline('bold')}
                onItalic={() => formatInline('italic')}
                onBullet={() => formatLines('bullet')}
                onTask={() => formatLines('task')}
                onCode={addCode}
                onMicPress={toggleMic}
                onImagePress={() => setImageBox((v) => (v === null ? '' : null))}
                onRawPress={toggleRaw}
                rawActive={raw}
                notice={notice}
                style={{ borderRadius: 12, border: '1px solid rgba(36, 41, 47, 0.18)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
              />
            </>
          )}
        </div>
      )}
      {(!showBars || reading) && notice !== null && (
        <div className="mdtile-notice" style={{ top: `${pxHeight + BAR_GAP}px`, left: `${barLeft}px` }} role="status">
          {notice}
        </div>
      )}

      {/* Sorular tile'ın içinde, tile'ın boyutunda açılır (3D'de duvarla birlikte durur) */}
      <div
        ref={setPortalEl}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${viewWidth}px`,
          height: `${pxHeight}px`,
          transform: 'translateZ(0)',
          pointerEvents: confirm ? 'auto' : 'none',
          zIndex: 50,
        }}
      />
      <PortalBoxContext.Provider value={portalBox}>
        <TornPaperMenu
          visible={confirm !== null}
          title={confirm?.title ?? ''}
          message={confirm?.message}
          options={[
            { label: confirm?.action ?? 'Tamam', danger: true, onPress: () => closeConfirm(confirm?.run) },
            { label: 'Vazgeç', onPress: () => closeConfirm() },
          ]}
          onClose={() => closeConfirm()}
        />
      </PortalBoxContext.Provider>
    </div>
  )
}

const TILE_CSS = `
  .mdtile-live {
    box-sizing: border-box;
    width: ${MD_COL_PX_W}px;
    background: rgba(255, 255, 255, 0.96);
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    column-fill: auto;
    pointer-events: auto;
    cursor: text;
    outline: none;
    color: ${docPage.ink};
    -webkit-font-smoothing: antialiased;
  }
  .mdtile-live.is-reading { cursor: default; }
  /* Defterin dikey (flex) akışı kolonlara akabilsin diye blok akışa çevrilir */
  .mdtile-live [data-md-root] { display: block !important; }
  .mdtile-live [data-md-root] > * { margin-bottom: 10px; }
  .mdtile-live [data-md-root] > *:last-child { margin-bottom: 0; }
  .mdtile-live img, .mdtile-live .nb-carousel, .mdtile-live pre { break-inside: avoid; }
  .mdtile-live [role="heading"] { break-after: avoid; }
  .mdtile-live a { pointer-events: auto; }

  /* Bloklar: tutamaç kolonun sol boşluğunda (kolon aralığında) durur, yazıyı kaydırmaz */
  .mdtile-row { position: relative; margin-bottom: 10px; border-radius: 6px; }
  .mdtile-row:last-child { margin-bottom: 0; }
  .mdtile-row.is-heading { break-after: avoid; }
  .mdtile-row.is-selected {
    background: ${notebookFills.selectionTint};
    box-shadow: 0 0 0 5px ${notebookFills.selectionTint}, 0 0 0 6px ${notebookFills.selectionEdge};
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  /* Sürüklenen blok kâğıttan kaldırılmış gibi parmakla yürür */
  .mdtile-row.is-lifted {
    z-index: 20;
    background: ${docPage.sheet};
    box-shadow: 0 6px 18px rgba(59, 47, 26, 0.28);
    opacity: 0.96;
    pointer-events: none;
  }
  .mdtile-row.is-lifted .mdtile-grip { pointer-events: auto; box-shadow: none; }
  /* Bırakılınca bloğun gireceği yeri gösteren kurşun kalem çizgisi */
  .mdtile-row.drop-before { box-shadow: 0 -4px 0 0 ${notebook.graphite}; }
  .mdtile-row.drop-after { box-shadow: 0 4px 0 0 ${notebook.graphite}; }
  .mdtile-grip {
    position: absolute;
    left: -${PAD}px;
    top: 0;
    bottom: 0;
    width: ${PAD}px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    touch-action: none;
    z-index: 1;
  }
  .mdtile-dash {
    font-family: ${fonts.hand.fontFamily};
    font-weight: ${fonts.hand.fontWeight};
    font-size: 22px;
    line-height: ${docPage.lineHeight}px;
    color: rgba(56, 56, 61, 0.4);
    user-select: none;
    pointer-events: none;
  }
  .mdtile-grip:hover .mdtile-dash { color: rgba(56, 56, 61, 0.75); }
  .mdtile-hint {
    font-family: ${fonts.docItalic?.fontFamily ?? 'inherit'};
    font-style: italic;
    font-weight: 200;
    font-size: ${docPage.fontSize}px;
    line-height: ${docPage.lineHeight}px;
    color: ${docPage.faint};
    pointer-events: none;
    user-select: none;
  }

  .mdtile-top {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 46px;
    padding: 0 12px;
    background: #F6F5F2;
    border: 1px solid rgba(36, 41, 47, 0.18);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    pointer-events: auto;
    cursor: default;
    box-sizing: border-box;
  }
  .mdtile-bar {
    position: absolute;
    width: max-content;
    pointer-events: auto;
    cursor: default;
  }
  .mdtile-bar .nb-tool-row { justify-content: flex-start; gap: 4px; padding: 0 10px; }
  .mdtile-selbar {
    width: 440px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid rgba(36, 41, 47, 0.18);
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  }
  .mdtile-imagebox {
    display: flex; gap: 6px; align-items: center;
    margin-bottom: 8px; padding: 8px;
    background: #F6F5F2; border: 1px solid rgba(36, 41, 47, 0.18); border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  .mdtile-imagebox input[type="text"] {
    flex: 1; min-width: 340px; height: 34px; padding: 0 10px;
    border: 1px solid rgba(36, 41, 47, 0.22); border-radius: 8px; outline: none;
    font: 300 14px 'DM Sans', system-ui, sans-serif; color: ${docPage.ink}; background: #fff;
  }
  .mdtile-imagebox input[type="text"]:focus { border-color: ${docPage.link}; }
  .mdtile-imagebox button {
    height: 34px; padding: 0 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid rgba(36, 41, 47, 0.18); background: #fff; color: ${docPage.ink};
    font: 800 13px 'DM Sans', system-ui, sans-serif;
  }
  .mdtile-notice {
    position: absolute; left: 0; padding: 8px 14px; border-radius: 10px;
    background: rgba(36, 41, 47, 0.92); color: #fff;
    font: 300 13px 'DM Sans', system-ui, sans-serif; pointer-events: none;
  }
`
