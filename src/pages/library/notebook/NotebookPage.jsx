// Seyir defteri: components/notebook/NotebookPage.tsx — defterin bir sayfası. Üstte el çizimi
// düğmeler (blok seçimi, okuma modu, ayraç, sayfalarda arama, çizim, sayfa ayarları), altında elle
// yazılan başlık ve bloklar.
// PDF (belge modu): düz beyaz kâğıt, en az A4/Letter oranı kadar boylu, Markdown bloklar, biçim çubuğu.
// Not defteri: dokulu kâğıt (çizgili, oxford, düz, kareli, noktalı), el yazısı bloklar, kenarda
// blokların saati; alt çubukta saat, yapılacak satırı ve numaralı liste.
//
// page: { notebookId, kind: 'page', ref }
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import {
  createNote,
  deleteEmptyNotes,
  deleteNote,
  getPageNotes,
  getPageTitle,
  isFavorite,
  setFavorite,
  setBoardNoteTitle,
  setNoteOrder,
  setPageTitle,
  updateNote,
} from '../api.js'
import { DOCUMENT_PAPERS, isDocumentPaper } from '../model.js'
import { TornPaperMenu } from '../TornPaperMenu.jsx'
import { docPage, fonts, HAND_TAIL, highlightFill, notebook, notebookFills } from '../theme.js'
import {
  clipboardHasImage,
  cropAttachmentImage,
  deleteAttachmentFile,
  imageAttachment,
  pasteImageFromClipboard,
  pickFile,
  pickImageFromLibrary,
  takePhoto,
} from './attachments.js'
import { BlockSelection, PasteButton, SelectionBar } from './BlockSelection.jsx'
import { BottomBar, TimeMenu } from './BottomBar.jsx'
import {
  blockOf,
  blocksText,
  clearClipboard,
  deleteBlockFiles,
  putOnClipboard,
  takeFromClipboard,
  useClipboardBlocks,
  withCopiedFiles,
} from './blockClipboard.js'
import { DOC_ROW_LEFT, HAND_ROW_LEFT, HAND_ROW_RIGHT } from './docLayout.js'
import { DEFAULT_DRAW_PEN, moveStrokes, strokesBottom, strokesBounds } from './drawing.js'
import { DrawingActions, DrawingBar, DrawingSurface, DrawPenMenu, StrokeLayer } from './DrawingMode.jsx'
import { clearStrokeClipboard, putStrokesOnClipboard, takeStrokesFromClipboard, useClipboardStrokes } from './strokeClipboard.js'
import { usePageDrawing } from './usePageDrawing.js'
import { DocumentBar } from './DocumentBar.jsx'
import { setRawMarkdown, useRawMarkdown } from './documentSettings.js'
import { HandIcon } from './HandIcon.jsx'
import { MarginTime } from './HandText.jsx'
import {
  clockTime,
  DEFAULT_PEN,
  inkText,
  moveLineMarks,
  paintHighlight,
  parseMarks,
  serializeMarks,
  setHighlight,
  setInk,
  shiftBoxTimes,
  shiftMarks,
  marksIn,
} from './marks.js'
import { hasFile, insertAttachment, parseContent, serializeContent } from './noteContent.js'
import { linkAttachment } from './linkCards.js'
import { ImageViewer } from './ImageViewer.jsx'
import { lineOrder, moveLine, toggleCheckLine, toggleNumberLine } from './noteLists.js'
import { NoteEntry } from './NoteEntry.jsx'
import { PageHeading, PageTopBar } from './PageHeading.jsx'
import { pageHeading, paperSeed } from './pageHeadings.js'
import { PageSidebar } from './PageSidebar.jsx'
import { Paper, RuledLines } from './Paper.jsx'
import { PenMenu } from './PenMenu.jsx'
import { clipboardToMarkdown, looksLikeHtml, padForInsertion } from './richText/htmlToMarkdown.js'
import { insertCodeBlock, toggleInline, toggleLines } from './richText/markdownEdit.js'
import { useDictation } from './useDictation.js'

// Çizim modunda en son seçilen araç ve kalem; sayfa çevrilince de, başka bir sayfada çizim modu
// açılınca da onlarla açılır
const lastDrawing = { tool: 'pen', pen: DEFAULT_DRAW_PEN }
// Çoğaltılan çizgiler bu kadar sağa ve aşağıya kayar (içerik birimi)
const DUPLICATE_SHIFT = 24

// Yazılan blok bu kadar duraksayınca kaydedilir (mobilde her harf yerel veritabanına yazılır)
const SAVE_DELAY = 450

// Bloğun sırası; sayfada yoksa sayfanın sonu
function indexOrEnd(list, id) {
  const index = list.findIndex((n) => n.id === id)
  return index === -1 ? list.length : index
}

// Bloğun hemen altındaki sıra; blok sayfada yoksa sayfanın sonu
function afterIndex(list, id) {
  const index = list.findIndex((n) => n.id === id)
  return index === -1 ? list.length : index + 1
}

function missingLinksNotice(count) {
  return count === 1
    ? '1 linkin adresi kaynakta yok, düz metin olarak eklendi'
    : `${count} linkin adresi kaynakta yok, düz metin olarak eklendi`
}

// Panodaki HTML ve düz metin okunur, Markdown'a çevrilir. Tarayıcı izin isteyebilir; izin yoksa
// yalnızca düz metin okunur. Pano boşsa null.
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
    plain = await navigator.clipboard?.readText?.().catch(() => '') ?? ''
  }
  if (!html && !plain) return null
  return clipboardToMarkdown({ html: looksLikeHtml(html) ? html : null, plain: plain || html })
}

export function NotebookPage({
  page,
  paper = 'a4',
  isCurrent = true,
  onReady,
  onBack,
  reading = false,
  onReadingChange,
  onSearchPress,
  // Ajandada takvim yaprağı ve sayfa filtresi
  onCalendarPress,
  filtering = false,
  onFilterPress,
  pen = DEFAULT_PEN,
  onPenChange,
  folio,
  onAddPage,
  onDeletePage,
  // Yazarken değil; blok seçimi, sürükleme ya da çizim modu açıkken defterin sayfası çevrilmez
  onLockChange,
  // Pano notu: kaydı (başlığı, tutturulduğu gün); autoStart: boş açılınca yazmaya hemen başlanır
  boardNote = null,
  autoStart = false,
}) {
  // PDF'in kâğıdı (a4 / letter); not defterinde null: sayfa el yazısıyla yazılır
  const docPaper = isDocumentPaper(paper) ? paper : null
  const hand = docPaper === null
  const rawMarkdown = useRawMarkdown()
  const paperRef = useRef(null)
  const scrollRef = useRef(null)
  const [paperWidth, setPaperWidth] = useState(0)
  const [heading, setHeading] = useState(null)
  const [favorite, setFavoriteState] = useState(false)
  const [notes, setNotes] = useState([])
  const [loaded, setLoaded] = useState(false)
  const notesRef = useRef([])
  const splitting = useRef(new Set())
  // Ekin, biçimin, dikte ve yapıştırmanın gireceği yer: son yazılan yer
  const active = useRef(null)
  // Seçili yazı, notun içeriğindeki konumlarıyla. applied: seçime kalem değdi mi
  const selection = useRef(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const addingBelow = useRef(false)
  const pendingSaves = useRef(new Map())
  const saveTimer = useRef(0)
  const titleTimer = useRef(0)
  const pendingTitle = useRef(null)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Sayfayı temizle / sil sorusu
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)
  // Blok seçimi: açıkken sayfa yazılmaz; bloklar tıklanarak ya da kesik çizgili alan çekilerek
  // seçilir, kopyalanır, kesilir, çoğaltılır, silinir ya da panodakiler yapıştırılır
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [selectionNotice, setSelectionNotice] = useState(null)
  const blockBusy = useRef(false)
  const clipboardBlocks = useClipboardBlocks()
  // Seçim kapalıyken yapıştırılan blokların gireceği yer: en son dokunulan yazının imleci ya da
  // (boş kâğıda dokunulduysa) sayfanın sonu
  const pasteSpot = useRef(null)
  // Blokların sayfadaki kutuları (sürükleme ve seçim bunlardan ölçer)
  const rowRefs = useRef(new Map())
  const ruledRef = useRef(null)
  // Tutamaçtan sürüklenen blok: sırası, kayması, bırakılınca gireceği sıra
  const [drag, setDrag] = useState(null)
  const dragLive = useRef(null)
  // Çizim modu: açıkken sayfa yazılmaz, çevrilmez; dokunuşlar çizim araçlarına gider
  const [drawingOn, setDrawingOn] = useState(false)
  const [drawTool, setDrawTool] = useState(lastDrawing.tool)
  const [drawPen, setDrawPen] = useState(lastDrawing.pen)
  const [zoom, setZoom] = useState(1)
  const [selectedStrokes, setSelectedStrokes] = useState(() => new Set())
  const [drawNotice, setDrawNotice] = useState(null)
  const [drawMenuOpen, setDrawMenuOpen] = useState(false)
  const toolBeforeSelect = useRef(lastDrawing.tool === 'select' ? 'pen' : lastDrawing.tool)
  const pageDrawing = usePageDrawing(page)
  // Ekler: ataç menüsü, düzenleme modundaki resim (dosya adı), tam ekranda gezilen resimler
  const [attachMenu, setAttachMenu] = useState(null)
  const [editingImage, setEditingImage] = useState(null)
  const [viewer, setViewer] = useState(null)
  const clipboardStrokes = useClipboardStrokes()
  // Sesle yazılanın gireceği yer: imlecin önündeki ve arkasındaki yazı sabit kalır
  const dictationTarget = useRef(null)
  const dictation = useDictation({
    onTranscript: (text) => writeDictation(text),
    onEnd: () => finishDictation(),
    onError: (message) => setNotice(message),
  })

  const sheetMinHeight = docPaper ? paperWidth * DOCUMENT_PAPERS[docPaper].ratio : 0
  // Saati elle ayarlanan blok: { noteId, time, refocus }
  const [timeEdit, setTimeEdit] = useState(null)

  useLayoutEffect(() => {
    const el = paperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setPaperWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  // ─── Kaydetme ────────────────────────────────────────────────────────────────
  function flushSaves() {
    clearTimeout(saveTimer.current)
    const list = [...pendingSaves.current.values()]
    pendingSaves.current.clear()
    for (const note of list) updateNote(note.id, note).catch(() => {})
    clearTimeout(titleTimer.current)
    if (pendingTitle.current !== null) {
      const title = pendingTitle.current
      pendingTitle.current = null
      const save = page.kind === 'board' ? setBoardNoteTitle(page.ref, title) : setPageTitle(page.notebookId, page.ref, title)
      save.catch(() => {})
    }
  }

  function scheduleSave(note) {
    pendingSaves.current.set(note.id, note)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSaves, SAVE_DELAY)
  }

  const flushOnLeave = useEffectEvent(() => flushSaves())

  useEffect(() => {
    const onHide = () => flushOnLeave()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      flushOnLeave()
    }
  }, [])

  // Görünen sayfa değilken ya da okurken yazma ve sesle yazma kapanır
  const leavePage = useEffectEvent(() => {
    flushSaves()
    if (dictation.listening) dictation.stop()
    const el = document.activeElement
    if (el && paperRef.current?.contains(el)) el.blur()
  })

  useEffect(() => {
    if (!isCurrent || reading) leavePage()
  }, [isCurrent, reading])

  const locked = isCurrent && (selecting || drawingOn || drag !== null)
  useEffect(() => {
    if (isCurrent) onLockChange?.(locked)
  }, [isCurrent, locked, onLockChange])

  // Okuma moduna geçince ya da sayfa çevrilince blok seçimi ve çizim modu kapanır
  const [wasActive, setWasActive] = useState(isCurrent && !reading)
  if (wasActive !== (isCurrent && !reading)) {
    setWasActive(isCurrent && !reading)
    if (!(isCurrent && !reading)) {
      setSelecting(false)
      setSelectedIds(new Set())
      setDrawingOn(false)
      setZoom(1)
      setSelectedStrokes(new Set())
    }
  }

  // ─── Yükleme ─────────────────────────────────────────────────────────────────
  const notifyReady = useEffectEvent(() => onReady?.())
  // Başlık not defterinin (ve PDF'in) sayfasına ve pano notuna elle yazılır; ajandanın sayfaları
  // adlıdır. Pano notuna ayraç konmaz.
  const canTitle = page.kind === 'page' || page.kind === 'board'
  const isBoard = page.kind === 'board'
  const boardTitle = boardNote?.title ?? ''
  const boardCreated = boardNote?.created_at ?? null


  useEffect(() => {
    let cancelled = false
    const titled = page.kind === 'page'
    const board = page.kind === 'board' ? { title: boardTitle, created_at: boardCreated ?? '' } : null
    deleteEmptyNotes(page)
      .catch(() => {})
      .then(() =>
        Promise.all([
          titled ? getPageTitle(page.notebookId, page.ref) : (board?.title ?? ''),
          getPageNotes(page),
          board ? false : isFavorite(page).catch(() => false),
        ]),
      )
      .then(([title, list, fav]) => {
        if (cancelled) return
        setHeading(pageHeading(page, title, board))
        setFavoriteState(fav)
        notesRef.current = list
        setNotes(list)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setHeading(pageHeading(page, '', board))
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [page, boardTitle, boardCreated])

  useEffect(() => {
    if (!loaded) return
    const frame = requestAnimationFrame(() => notifyReady())
    return () => cancelAnimationFrame(frame)
  }, [loaded])

  // ─── Bloklar ─────────────────────────────────────────────────────────────────
  function scrollToEndSoon() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }

  async function createAndShowNote() {
    const note = await createNote(page).catch(() => null)
    if (!note) return null
    notesRef.current = [...notesRef.current, note]
    setNotes((prev) => [...prev, note])
    scrollToEndSoon()
    return note
  }

  async function addNote() {
    const note = await createAndShowNote()
    if (note) setFocusRequest({ noteId: note.id, segment: 0 })
  }

  // autoStart: boş açılan sayfada yazmaya hemen başlanır
  const startWriting = useEffectEvent(() => {
    if (autoStart && !reading) addNote()
  })

  useEffect(() => {
    if (loaded && notesRef.current.length === 0) startWriting()
  }, [loaded])

  // Boş sayfanın ipucuna tıklayınca ilk blok açılır. Düğme odağı bırakır: blok sunucudan gelene
  // kadar basılan boşluk / Enter düğmeye yeniden basıp başka boş bloklar açmasın.
  async function startFirstBlock(e) {
    e.currentTarget.blur()
    if (addingBelow.current) return
    addingBelow.current = true
    await addNote().finally(() => {
      addingBelow.current = false
    })
  }

  async function tapBelowBlocks() {
    pasteSpot.current = 'end'
    if (reading || selecting || !heading || addingBelow.current) return
    const last = notesRef.current[notesRef.current.length - 1]
    if (last && last.content === '') {
      active.current = { noteId: last.id, segment: 0, cursor: 0 }
      setFocusRequest({ noteId: last.id, segment: 0, cursor: 0 })
      return
    }
    addingBelow.current = true
    await addNote().finally(() => {
      addingBelow.current = false
    })
  }

  async function openFirstBlock() {
    if (reading || !heading || addingBelow.current) return
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    const first = notesRef.current[0]
    if (first && first.content === '') {
      active.current = { noteId: first.id, segment: 0, cursor: 0 }
      setFocusRequest({ noteId: first.id, segment: 0, cursor: 0 })
      return
    }
    addingBelow.current = true
    try {
      const note = await createNote(page)
      const next = [note, ...notesRef.current]
      notesRef.current = next
      setNotes(next)
      setNoteOrder(page, next.map((n) => n.id)).catch(() => {})
      active.current = { noteId: note.id, segment: 0, cursor: 0 }
      setFocusRequest({ noteId: note.id, segment: 0, cursor: 0 })
    } catch {
      // sunucu yanıt vermediyse blok açılmaz
    } finally {
      addingBelow.current = false
    }
  }

  function saveNote(note) {
    const change = (n) => (n.id === note.id ? note : n)
    notesRef.current = notesRef.current.map(change)
    setNotes((prev) => prev.map(change))
    scheduleSave(note)
  }

  // Yazı değişince fosforlu kalemin boyası, yazının rengi ve kutulu satırların saatleri de yazıyla
  // birlikte kayar; yeni yazılan yazı elde tutulan kalemin renginde olur
  function changeNote(noteId, content) {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note || note.content === content) return
    // Seçili yazının üstüne yazılırsa kalem o yazıdan geçmemiş sayılır
    if (selection.current?.noteId === noteId) selection.current = null
    saveNote({
      ...note,
      content,
      highlights: serializeMarks(shiftMarks(parseMarks(note.highlights), note.content, content)),
      inks: serializeMarks(inkText(parseMarks(note.inks), note.content, content, pen.ink)),
      times: serializeMarks(shiftBoxTimes(parseMarks(note.times), note.content, content)),
    })
  }

  // Enter: blok imlecin olduğu yerden ikiye bölünür. Arkası (boyası ve rengiyle) hemen altına
  // açılan yeni bloğa geçer; liste maddesindeyse yeni blok maddenin işaretiyle başlar.
  async function splitNote(noteId, segment, at, prefix) {
    if (splitting.current.has(noteId)) return
    splitting.current.add(noteId)
    await splitNoteNow(noteId, segment, at, prefix).finally(() => {
      splitting.current.delete(noteId)
    })
  }

  async function splitNoteNow(noteId, segment, at, prefix) {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note) return
    endDictationHere()
    const offset = serializeContent(parseContent(note.content).slice(0, segment)).length + at
    const length = note.content.length
    const head = (json) => serializeMarks(marksIn(parseMarks(json), 0, offset))
    const tail = (json) =>
      serializeMarks(
        marksIn(parseMarks(json), offset, length).map((m) => ({ ...m, start: m.start + prefix.length, end: m.end + prefix.length })),
      )

    saveNote({
      ...note,
      content: note.content.slice(0, offset),
      highlights: head(note.highlights),
      inks: head(note.inks),
      times: head(note.times),
    })
    flushSaves()

    const created = await createNote(page).catch(() => null)
    if (!created) return
    const fresh = {
      ...created,
      content: prefix + note.content.slice(offset),
      highlights: tail(note.highlights),
      inks: tail(note.inks),
      times: tail(note.times),
      time: null,
    }
    const index = notesRef.current.findIndex((n) => n.id === noteId)
    const next = [...notesRef.current.slice(0, index + 1), fresh, ...notesRef.current.slice(index + 1)]
    notesRef.current = next
    setNotes(next)
    updateNote(fresh.id, fresh).catch(() => {})
    setNoteOrder(page, next.map((n) => n.id)).catch(() => {})
    active.current = { noteId: fresh.id, segment: 0, cursor: prefix.length }
    setFocusRequest({ noteId: fresh.id, segment: 0, cursor: prefix.length })
  }

  // Bloğun en başında geri silme: blok bir üstteki bloğun sonuna eklenir, kendisi kalkar
  function mergeBack(noteId) {
    const index = notesRef.current.findIndex((n) => n.id === noteId)
    if (index <= 0) return
    endDictationHere()
    const prev = notesRef.current[index - 1]
    const note = notesRef.current[index]
    const at = prev.content.length
    const join = (a, b) =>
      serializeMarks([...parseMarks(a), ...parseMarks(b).map((m) => ({ ...m, start: m.start + at, end: m.end + at }))])
    const prevSegments = parseContent(prev.content)
    const last = prevSegments[prevSegments.length - 1]
    const cursor = last?.type === 'text' ? last.text.length : 0

    saveNote({
      ...prev,
      content: prev.content + note.content,
      highlights: join(prev.highlights, note.highlights),
      inks: join(prev.inks, note.inks),
      times: join(prev.times, note.times),
    })
    pendingSaves.current.delete(note.id)
    notesRef.current = notesRef.current.filter((n) => n.id !== note.id)
    setNotes((list) => list.filter((n) => n.id !== note.id))
    deleteNote(note.id).catch(() => {})
    const segment = prevSegments.length - 1
    active.current = { noteId: prev.id, segment, cursor }
    setFocusRequest({ noteId: prev.id, segment, cursor })
  }

  // ─── Kalem ve fosforlu kalem ────────────────────────────────────────────────
  // Fosforlu kalem açıkken yazı seçilip bırakıldı: kalem oradan geçmiş olur (baştan sona aynı renkle
  // boyalı yer silinir)
  function strokeNote(noteId, start, end, color) {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note) return
    saveNote({ ...note, highlights: serializeMarks(paintHighlight(parseMarks(note.highlights), start, end, color)) })
  }

  // Yazı seçildi ya da seçim değişti; start === end ise seçim bırakıldı
  function selectText(noteId, start, end) {
    if (colorMenuOpen) return
    if (start === end) {
      releaseSelection(selection.current?.noteId ?? noteId)
      return
    }
    const prev = selection.current
    if (prev?.noteId === noteId && prev.start === start && prev.end === end) return
    selection.current = { noteId, start, end, applied: false }
  }

  // Seçim bırakıldı: fosforlu kalem açıkken seçilen yer, kalemin geçtiği yerdir
  function releaseSelection(noteId) {
    if (colorMenuOpen) return
    const done = selection.current
    if (!done || done.noteId !== noteId) return
    selection.current = null
    if (!done.applied && pen.active) strokeNote(noteId, done.start, done.end, pen.color)
  }

  // Elde tutulan kalem değişti. Yazı seçiliyse seçim o anda etkilenir.
  function changePen(next, how) {
    onPenChange?.(next)
    const target = selection.current
    const note = target && notesRef.current.find((n) => n.id === target.noteId)
    if (!target || !note) return
    target.applied = true
    const { start, end } = target
    if (how === 'button') {
      // Düğmeyle açılan kalem seçimin üstünden bir kez geçer
      if (next.active) strokeNote(note.id, start, end, next.color)
      return
    }
    if (next.active) {
      saveNote({ ...note, highlights: serializeMarks(setHighlight(parseMarks(note.highlights), start, end, next.color)) })
    } else {
      saveNote({ ...note, inks: serializeMarks(setInk(parseMarks(note.inks), start, end, next.ink)) })
    }
  }

  // ─── Not defteri: saat, yapılacak satırı, numaralı liste ─────────────────────
  // Saatin gireceği blok: imlecin son durduğu blok, yoksa sayfanın son bloğu
  function timeTargetNote() {
    const activeId = active.current?.noteId
    return notesRef.current.find((n) => n.id === activeId) ?? notesRef.current[notesRef.current.length - 1]
  }

  // Sayfa boşsa saatli ilk blok açılır
  async function timeTargetOrNew() {
    const note = timeTargetNote()
    if (note) return note
    const created = await createAndShowNote()
    if (created) setFocusRequest({ noteId: created.id, segment: 0 })
    return created
  }

  // Kenarda görünen saat: bloğun saati, yoksa blok kutulu bir satırla başlıyorsa o satırın saati
  function shownTime(note) {
    return note.time ?? parseMarks(note.times).find((m) => m.start === 0)?.color ?? null
  }

  // Bloğun saati kalkar, kenarda yeniden çizgi olur (ilk kutulu satırın saati de gider)
  function withoutTime(note) {
    return { ...note, time: null, times: serializeMarks(parseMarks(note.times).filter((m) => m.start !== 0)) }
  }

  // Saat: imlecin olduğu bloğun çizgisi yerine o anki saat gelir; saati varsa yeniden çizgi olur.
  // Hiçbir bloğa dokunulmadıysa sayfanın son bloğuna konur, sayfa boşsa saatli ilk blok açılır.
  async function toggleTime() {
    if (reading) return
    setEditingImage(null)
    const note = await timeTargetOrNew()
    if (!note) return
    saveNote(shownTime(note) ? withoutTime(note) : { ...note, time: clockTime() })
  }

  // Saat ayarı: saati düğmeyle aynı bloğa, ama elle seçilerek yazılır; bloğun saati varsa menü
  // onunla açılır. Sayfa boşsa blok menü kapanınca açılır.
  function openTimeMenu() {
    if (reading) return
    setAttachMenu(null)
    setEditingImage(null)
    const note = timeTargetNote()
    // Saat yazılınca imleç yazıyorsa kaldığı yere döner
    const writing = document.activeElement?.closest?.('.nb-paper') && document.activeElement.tagName === 'TEXTAREA'
    const refocus = writing && active.current ? { ...active.current } : null
    document.activeElement?.blur?.()
    setTimeEdit({ noteId: note?.id ?? null, time: note ? shownTime(note) : null, refocus })
  }

  // Menü kapandı: ayarlanan saat bloğa yazılır, imleç kaldığı yere döner
  async function saveEditedTime(time) {
    const edit = timeEdit
    setTimeEdit(null)
    if (!edit) return
    const note = notesRef.current.find((n) => n.id === edit.noteId) ?? (await timeTargetOrNew())
    if (!note) return
    saveNote({ ...note, time })
    if (edit.refocus?.noteId === note.id) setFocusRequest({ ...edit.refocus })
  }

  // Kutu / numara: imlecin olduğu satırın başına işaret koyar ya da kaldırır
  async function toggleLine(toggle) {
    if (reading) return
    setAttachMenu(null)
    setEditingImage(null)
    endDictationHere()
    const at = await cursorTarget()
    if (!at) return
    const { note, segments, index, cursor } = at
    const text = segments[index]
    if (text.type !== 'text') return
    const edit = toggle(text.text, cursor)
    changeNote(note.id, serializeContent(segments.map((s, i) => (i === index ? { ...text, text: edit.text } : s))))
    active.current = { noteId: note.id, segment: index, cursor: edit.cursor }
    setFocusRequest({ noteId: note.id, segment: index, cursor: edit.cursor })
  }

  // Kutulu satır kutusundan tutulup notun yazısında yukarı aşağı taşındı; boyası, kalem rengi ve
  // saati satırla birlikte gider
  function moveNoteLine(noteId, segment, from, to) {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note) return
    const segments = parseContent(note.content)
    const text = segments[segment]
    if (text?.type !== 'text') return
    const at = serializeContent(segments.slice(0, segment)).length
    const moved = moveLine(text.text, from, to)
    saveNote({
      ...note,
      content: serializeContent(segments.map((s, i) => (i === segment ? { ...text, text: moved } : s))),
      highlights: serializeMarks(moveLineMarks(parseMarks(note.highlights), at, text.text, from, to)),
      inks: serializeMarks(moveLineMarks(parseMarks(note.inks), at, text.text, from, to)),
      times: serializeMarks(moveLineMarks(parseMarks(note.times), at, text.text, from, to)),
    })
    active.current = null
  }

  // ─── Biçim düğmeleri, yapıştırma, sesle yazma ─────────────────────────────────
  // İmlecin son durduğu yazı bölümü; yazılan bir yer yoksa yeni blok açılır
  async function cursorTarget() {
    let target = active.current
    let note = target && notesRef.current.find((n) => n.id === target.noteId)
    if (!note || !target) {
      note = await createAndShowNote()
      if (!note) return null
      target = { noteId: note.id, segment: 0, cursor: 0 }
    }
    const segments = parseContent(note.content)
    const index = segments[target.segment]?.type === 'text' ? target.segment : segments.length - 1
    const text = segments[index]
    const cursor = text.type === 'text' ? Math.min(target.cursor, text.text.length) : 0
    return { note, segments, index, cursor }
  }

  // Biçim düğmeleri imlecin olduğu yazı bölümüne (yazı seçiliyse seçime) uygulanır; ardından imleç
  // ya da seçim yazıda kalır. keepFocus false ise yazma kapanır, blok hemen biçimli görünür.
  async function editMarkdown(apply, keepFocus = true) {
    if (reading) return
    endDictationHere()
    const picked = selection.current
    const at = await cursorTarget()
    if (!at) return
    const { note, segments, index, cursor } = at
    const text = segments[index]
    if (text.type !== 'text') return
    const offset = serializeContent(segments.slice(0, index)).length
    let start = cursor
    let end = cursor
    if (picked?.noteId === note.id && picked.start >= offset && picked.end <= offset + text.text.length) {
      start = picked.start - offset
      end = picked.end - offset
    }
    const edit = apply(text.text, start, end)
    changeNote(note.id, serializeContent(segments.map((s, i) => (i === index ? { ...text, text: edit.text } : s))))
    active.current = { noteId: note.id, segment: index, cursor: edit.end }
    if (keepFocus) {
      setFocusRequest({ noteId: note.id, segment: index, cursor: edit.start, end: edit.end })
    } else {
      document.activeElement?.blur?.()
    }
  }

  const formatInline = (format) => editMarkdown((text, start, end) => toggleInline(text, start, end, format))
  const formatLines = (format) => editMarkdown((text, start, end) => toggleLines(text, start, end, format))

  // Panodaki zengin metin Markdown'a çevrilip imlecin yerine (seçim varsa onun yerine) girer
  async function pasteMarkdown(result) {
    if (!result || result.text.trim() === '') {
      setNotice('Panoda yapıştırılacak yazı yok')
      return
    }
    await editMarkdown((text, start, end) => {
      const before = text.slice(0, start)
      const after = text.slice(end)
      const inserted = padForInsertion(result.text, before, after)
      const caret = start + inserted.length
      return { text: before + inserted + after, start: caret, end: caret }
    }, !result.rich)
    setNotice(
      result.missingLinks > 0
        ? missingLinksNotice(result.missingLinks)
        : result.rich
          ? 'Biçimli metin olarak yapıştırıldı'
          : 'Panoda biçimli metin yok, düz metin olarak eklendi',
    )
  }

  async function pasteFromClipboard() {
    await pasteMarkdown(await readClipboardMarkdown().catch(() => null))
  }

  // Mikrofon: söylenenler imlecin olduğu yere, konuşuldukça yazılır
  async function toggleDictation() {
    if (dictation.listening) {
      dictation.stop()
      return
    }
    const at = await cursorTarget()
    if (!at) return
    const text = at.segments[at.index]
    if (text.type !== 'text') return
    dictationTarget.current = {
      noteId: at.note.id,
      segment: at.index,
      before: text.text.slice(0, at.cursor),
      after: text.text.slice(at.cursor),
    }
    document.activeElement?.blur?.()
    if (!dictation.start()) finishDictation()
  }

  function writeDictation(spoken) {
    const target = dictationTarget.current
    const note = target && notesRef.current.find((n) => n.id === target.noteId)
    if (!target || !note) return
    const { segment, before, after } = target
    const lead = spoken && before && !/\s$/.test(before) ? ' ' : ''
    const trail = spoken && after && !/^\s/.test(after) ? ' ' : ''
    const segments = parseContent(note.content).map((s, i) =>
      i === segment && s.type === 'text' ? { ...s, text: before + lead + spoken + trail + after } : s,
    )
    changeNote(note.id, serializeContent(segments))
    active.current = { noteId: note.id, segment, cursor: before.length + lead.length + spoken.length }
  }

  // Dinleme bitti: hiçbir şey söylenmediyse yeni açılan boş blok kalkar
  function finishDictation() {
    const target = dictationTarget.current
    dictationTarget.current = null
    const note = target && notesRef.current.find((n) => n.id === target.noteId)
    if (note && note.content.trim() === '') {
      notesRef.current = notesRef.current.filter((n) => n.id !== note.id)
      setNotes((prev) => prev.filter((n) => n.id !== note.id))
      deleteNote(note.id).catch(() => {})
    }
    flushSaves()
  }

  // Blok elle değiştirilirse sesle yazma o noktada bırakılır
  function endDictationHere() {
    if (!dictationTarget.current) return
    dictationTarget.current = null
    dictation.cancel()
  }

  // ─── Sayfa ──────────────────────────────────────────────────────────────────
  function changeTitle(title) {
    setHeading((prev) => (prev ? { ...prev, title } : prev))
    pendingTitle.current = title
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(flushSaves, SAVE_DELAY)
  }

  function toggleFavorite() {
    const next = !favorite
    setFavoriteState(next)
    setFavorite(page, next).catch(() => setFavoriteState(!next))
  }

  function openSettings() {
    endDictationHere()
    if (dictation.listening) dictation.stop()
    document.activeElement?.blur?.()
    setColorMenuOpen(false)
    setSettingsOpen(true)
  }

  // ─── Blok seçimi ve pano ──────────────────────────────────────────────────────
  useEffect(() => {
    if (selectionNotice === null) return
    const timer = setTimeout(() => setSelectionNotice(null), 1600)
    return () => clearTimeout(timer)
  }, [selectionNotice])

  function changeSelecting(next) {
    if (next) {
      setColorMenuOpen(false)
      selection.current = null
      endDictationHere()
      document.activeElement?.blur?.()
    }
    setSelecting(next)
    setSelectedIds(new Set())
    setSelectionNotice(null)
  }

  // Blokların kaydırılan içerikteki kutuları, sayfadaki sırasıyla
  function extents() {
    return notesRef.current.map((n) => {
      const el = rowRefs.current.get(n.id)
      return el ? { top: el.offsetTop, height: el.offsetHeight } : { top: 0, height: 0 }
    })
  }

  // Tıklanan bloğun seçimi açılır / kapanır; boş kâğıda tıklayınca seçim temizlenir
  function tapBlock(index) {
    const note = notesRef.current[index]
    if (!note) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(note.id)) next.delete(note.id)
      else next.add(note.id)
      return next
    })
  }

  function sweepBlocks(indices) {
    setSelectedIds(new Set(indices.flatMap((i) => (notesRef.current[i] ? [notesRef.current[i].id] : []))))
  }

  function selectedNotes() {
    return notesRef.current.filter((n) => selectedIds.has(n.id))
  }

  // Seçili bloklarla yapılan iş; iş bitene kadar düğmelere yeniden basılması yok sayılır
  async function withBlocks(work) {
    const picked = selectedNotes()
    if (picked.length === 0 || blockBusy.current) return
    blockBusy.current = true
    await work(picked).finally(() => {
      blockBusy.current = false
    })
  }

  // Bloklar uygulamanın panosuna, düz yazıları sistemin panosuna kopyalanır
  async function copyToClipboard(picked) {
    const blocks = picked.map(blockOf)
    await putOnClipboard(blocks)
    const text = blocksText(blocks)
    if (text.trim() !== '') navigator.clipboard?.writeText(text).catch(() => {})
  }

  // Kopyalanınca ya da kesilince seçim kapanır; bloklar üst çubuktaki yapıştır düğmesiyle başka bir
  // yere (bu ya da başka bir sayfaya, başka bir deftere) yapıştırılır
  function copySelection() {
    withBlocks(async (picked) => {
      await copyToClipboard(picked)
      changeSelecting(false)
    })
  }

  function cutSelection() {
    withBlocks(async (picked) => {
      await copyToClipboard(picked)
      removeNotes(picked)
      changeSelecting(false)
    })
  }

  function deleteSelection() {
    const picked = selectedNotes()
    if (picked.length === 0) return
    setConfirm({
      title: 'Blokları sil',
      message: picked.length === 1 ? 'Seçili blok sayfadan silinsin mi?' : `Seçili ${picked.length} blok sayfadan silinsin mi?`,
      action: 'Sil',
      run: () => {
        removeNotes(picked)
        setSelectionNotice('silindi')
      },
    })
  }

  // Kopyaları seçili blokların hemen altına gelir; seçim kopyalara geçer
  function duplicateSelection() {
    withBlocks(async (picked) => {
      const blocks = await Promise.all(picked.map((n) => withCopiedFiles(blockOf(n))))
      const lastId = picked[picked.length - 1].id
      const created = await insertBlocks(blocks, (list) => afterIndex(list, lastId))
      setSelectedIds(new Set(created.map((n) => n.id)))
      setSelectionNotice('çoğaltıldı')
    })
  }

  function confirmClearClipboard() {
    setConfirm({
      title: 'Panoyu boşalt',
      message: 'Kopyalanan bloklar panodan silinsin mi?',
      action: 'Boşalt',
      run: clearClipboard,
    })
  }

  // Panodaki bloklar yapıştırılır. Blok seçimi açıksa seçili blokların yerine (seçili blok yoksa
  // sayfanın sonuna) gelir. Seçim kapalıysa en son dokunulan yere gelir: yazının içindeyse blok
  // imlecin olduğu yerden ikiye bölünür, araya girer; boş bir bloğa dokunulduysa onun yerine geçer.
  async function pasteBlocks() {
    if (blockBusy.current) return
    blockBusy.current = true
    await pasteNow().finally(() => {
      blockBusy.current = false
    })
  }

  async function pasteNow() {
    endDictationHere()
    flushSaves()
    document.activeElement?.blur?.()
    const blocks = takeFromClipboard()
    if (blocks.length === 0) return
    if (selecting) {
      const picked = selectedNotes()
      const created = await insertBlocks(blocks, (list) => (picked.length > 0 ? indexOrEnd(list, picked[0].id) : list.length))
      if (picked.length > 0) removeNotes(picked)
      else scrollToEndSoon()
      setSelectedIds(new Set(created.map((n) => n.id)))
      setSelectionNotice('yapıştırıldı')
      return
    }
    const spot = pasteSpot.current
    if (spot === null || spot === 'end') {
      await insertBlocks(blocks, (list) => list.length)
      scrollToEndSoon()
    } else {
      await pasteAtCursor(blocks, spot)
    }
  }

  async function pasteAtCursor(blocks, spot) {
    const note = notesRef.current.find((n) => n.id === spot.noteId)
    if (!note) {
      scrollToEndSoon()
      return insertBlocks(blocks, (list) => list.length)
    }
    if (note.content.trim() === '') {
      const created = await insertBlocks(blocks, (list) => indexOrEnd(list, note.id))
      removeNotes([note])
      return created
    }
    const segments = parseContent(note.content)
    const text = segments[spot.segment]
    const length = note.content.length
    const offset =
      text?.type === 'text' ? serializeContent(segments.slice(0, spot.segment)).length + Math.min(spot.cursor, text.text.length) : length
    if (offset === 0) return insertBlocks(blocks, (list) => indexOrEnd(list, note.id))
    if (offset >= length) return insertBlocks(blocks, (list) => afterIndex(list, note.id))
    // Blok imleçten bölünür: önü yerinde kalır, arkası yapıştırılanların altına yeni blok olur
    const part = (json, from, to) => serializeMarks(marksIn(parseMarks(json), from, to))
    saveNote({
      ...note,
      content: note.content.slice(0, offset),
      highlights: part(note.highlights, 0, offset),
      inks: part(note.inks, 0, offset),
      times: part(note.times, 0, offset),
    })
    const tail = {
      content: note.content.slice(offset),
      highlights: part(note.highlights, offset, length),
      inks: part(note.inks, offset, length),
      times: part(note.times, offset, length),
      time: null,
    }
    const created = await insertBlocks([...blocks, tail], (list) => afterIndex(list, note.id))
    return created.slice(0, blocks.length)
  }

  // Bloklar sayfadan kalkar, ekleri de silinir (panoya alınan blokların ekleri ayrı dosyalardır)
  function removeNotes(picked) {
    const ids = new Set(picked.map((n) => n.id))
    notesRef.current = notesRef.current.filter((n) => !ids.has(n.id))
    setNotes((prev) => prev.filter((n) => !ids.has(n.id)))
    for (const note of picked) {
      pendingSaves.current.delete(note.id)
      deleteNote(note.id).catch(() => {})
    }
    deleteBlockFiles(picked.map(blockOf))
    if (active.current && ids.has(active.current.noteId)) active.current = null
    const spot = pasteSpot.current
    if (spot && spot !== 'end' && ids.has(spot.noteId)) pasteSpot.current = null
    setSelectedIds(new Set())
  }

  // Bloklar sayfaya yeni bloklar olarak eklenir; place, eklenecekleri sırayı bulur. Eklenenler döner.
  async function insertBlocks(blocks, place) {
    const created = []
    for (const block of blocks) {
      const note = await createNote(page).catch(() => null)
      if (!note) continue
      const full = { ...note, ...block }
      await updateNote(full.id, full).catch(() => {})
      created.push(full)
    }
    if (created.length === 0) return created
    const list = notesRef.current
    const at = Math.min(list.length, Math.max(0, place(list)))
    const next = [...list.slice(0, at), ...created, ...list.slice(at)]
    notesRef.current = next
    setNotes(next)
    await setNoteOrder(page, next.map((n) => n.id)).catch(() => {})
    return created
  }

  // Seçim açıkken klavye: Escape kapatır, Ctrl+C / Ctrl+X kopyalar / keser, Delete siler,
  // Ctrl+V panodakini yapıştırır
  useEffect(() => {
    if (!selecting || !isCurrent) return
    const onKey = (e) => {
      if (confirm) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') changeSelecting(false)
      else if (mod && e.key.toLowerCase() === 'c') copySelection()
      else if (mod && e.key.toLowerCase() === 'x') cutSelection()
      else if (mod && e.key.toLowerCase() === 'v' && clipboardBlocks > 0) pasteBlocks()
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ─── Blokları sürükleyerek sıralama ───────────────────────────────────────────
  // Saatin yerindeki çizgi bloğun tutamacıdır: basılı tutup yukarı aşağı sürükleyince blok yer
  // değiştirir; bırakılacağı yerde kurşun kalem çizgisi çıkar
  function moveNote(from, to) {
    if (from === to) return
    const next = lineOrder(notesRef.current.length, from, to).map((i) => notesRef.current[i])
    notesRef.current = next
    setNotes(next)
    setNoteOrder(page, next.map((n) => n.id)).catch(() => {})
  }

  function dropIndex(list, from, dy) {
    const own = list[from]
    if (!own) return from
    const center = own.top + own.height / 2 + dy
    let to = 0
    for (let i = 0; i < list.length; i++) if (i !== from && list[i].top + list[i].height / 2 < center) to++
    return to
  }

  function dropLineY(list, from, to) {
    const others = list.filter((_, i) => i !== from)
    if (others.length === 0) return list[from]?.top ?? 0
    if (to < others.length) return others[to].top
    const last = others[others.length - 1]
    return last.top + last.height
  }

  function gripProps(index) {
    return {
      onPointerDown: (e) => {
        if (e.button !== 0 || dragLive.current || selecting) return
        e.preventDefault()
        const target = e.currentTarget
        const startY = e.clientY
        const pointerId = e.pointerId
        dragLive.current = {
          pending: setTimeout(() => {
            try {
              target.setPointerCapture(pointerId)
            } catch {
              // işaretçi bu arada kalktıysa
            }
            document.activeElement?.blur?.()
            const list = extents()
            const d = { from: index, offset: 0, to: index, list, startY, pointerId, moving: true }
            dragLive.current = d
            setDrag({ from: index, offset: 0, to: index, moving: true })
          }, 280),
          startY,
          pointerId,
        }
      },
      onPointerMove: (e) => {
        const d = dragLive.current
        if (!d || e.pointerId !== d.pointerId) return
        if (d.pending) {
          if (Math.abs(e.clientY - d.startY) > 8) {
            clearTimeout(d.pending)
            dragLive.current = null
          }
          return
        }
        const own = d.list[d.from]
        if (!own) return
        // Bloğun ortası ilk bloğun üstüyle son bloğun altı arasında kalır
        const center = own.top + own.height / 2
        const first = d.list[0].top
        const last = d.list[d.list.length - 1].top + d.list[d.list.length - 1].height
        const dy = Math.min(last - center, Math.max(first - center, e.clientY - d.startY))
        d.offset = dy
        d.to = dropIndex(d.list, d.from, dy)
        setDrag({ from: d.from, offset: dy, to: d.to, moving: true, lineTop: dropLineY(d.list, d.from, d.to) })
      },
      onPointerUp: (e) => {
        const d = dragLive.current
        if (!d || e.pointerId !== d.pointerId) return
        if (d.pending) {
          clearTimeout(d.pending)
          dragLive.current = null
          return
        }
        // Bırakılan blok yeni yerine kayar; yeni sıra çizilince sürükleme durumu sıfırlanır
        const own = d.list[d.from]
        const settle = d.to === d.from || !own ? 0 : (d.to > d.from ? dropLineY(d.list, d.from, d.to) - own.height : dropLineY(d.list, d.from, d.to)) - own.top
        setDrag({ from: d.from, offset: settle, to: d.to, moving: false, lineTop: null })
        setTimeout(() => {
          moveNote(d.from, d.to)
          dragLive.current = null
          setDrag(null)
        }, 140)
      },
      onPointerCancel: () => {
        const d = dragLive.current
        if (d?.pending) clearTimeout(d.pending)
        dragLive.current = null
        setDrag(null)
      },
      // Klavyeyle: Alt+↑ / Alt+↓ bloğu bir yukarı / aşağı taşır
      onKeyDown: (e) => {
        if (!e.altKey) return
        if (e.key === 'ArrowUp' && index > 0) {
          e.preventDefault()
          moveNote(index, index - 1)
        } else if (e.key === 'ArrowDown' && index < notesRef.current.length - 1) {
          e.preventDefault()
          moveNote(index, index + 1)
        }
      },
    }
  }

  // ─── Çizim modu ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (drawNotice === null) return
    const timer = setTimeout(() => setDrawNotice(null), 1600)
    return () => clearTimeout(timer)
  }, [drawNotice])

  function changeDrawing(next) {
    if (next) {
      endDictationHere()
      if (dictation.listening) dictation.stop()
      document.activeElement?.blur?.()
      setSelecting(false)
      setSelectedIds(new Set())
      setColorMenuOpen(false)
      selection.current = null
    } else {
      setZoom(1)
      setDrawMenuOpen(false)
    }
    setSelectedStrokes(new Set())
    setDrawNotice(null)
    setDrawingOn(next)
  }

  function changeDrawTool(tool) {
    lastDrawing.tool = tool
    setDrawTool(tool)
  }

  function changeDrawPen(pen) {
    lastDrawing.pen = pen
    setDrawPen(pen)
  }

  const drawSelecting = drawingOn && drawTool === 'select'
  const pickedStrokes = pageDrawing.strokes.filter((s) => selectedStrokes.has(s))

  function changeDrawSelecting(next) {
    setSelectedStrokes(new Set())
    setDrawNotice(null)
    if (next) {
      if (drawTool !== 'select') toolBeforeSelect.current = drawTool
      changeDrawTool('select')
    } else {
      changeDrawTool(toolBeforeSelect.current)
    }
  }

  function copyStrokes() {
    if (pickedStrokes.length === 0) return
    putStrokesOnClipboard(pickedStrokes)
    changeDrawSelecting(false)
  }

  function cutStrokes() {
    if (pickedStrokes.length === 0) return
    putStrokesOnClipboard(pickedStrokes)
    pageDrawing.remove(new Set(pickedStrokes))
    changeDrawSelecting(false)
  }

  function duplicateStrokes() {
    if (pickedStrokes.length === 0) return
    const copies = moveStrokes(pickedStrokes, DUPLICATE_SHIFT, DUPLICATE_SHIFT)
    pageDrawing.addMany(copies)
    setSelectedStrokes(new Set(copies))
    setDrawNotice('çoğaltıldı')
  }

  function deleteStrokes() {
    if (pickedStrokes.length === 0) return
    pageDrawing.remove(new Set(pickedStrokes))
    setSelectedStrokes(new Set())
    setDrawNotice('silindi')
  }

  // Panodaki çizim görünen alanın ortasına yapıştırılır, seçili gelir
  function pasteStrokes() {
    const list = takeStrokesFromClipboard()
    const b = strokesBounds(list)
    const scroller = scrollRef.current
    if (!b || !scroller) return
    const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / zoom
    const cy = (scroller.scrollTop + scroller.clientHeight / 2) / zoom
    const pasted = moveStrokes(list, cx - (b.x0 + b.x1) / 2, cy - (b.y0 + b.y1) / 2)
    pageDrawing.addMany(pasted)
    if (drawTool !== 'select') toolBeforeSelect.current = drawTool
    changeDrawTool('select')
    setSelectedStrokes(new Set(pasted))
    setDrawNotice('yapıştırıldı')
  }

  function confirmClearStrokeClipboard() {
    setConfirm({ title: 'Panoyu boşalt', message: 'Kopyalanan çizim panodan silinsin mi?', action: 'Boşalt', run: clearStrokeClipboard })
  }

  function confirmClearDrawing() {
    setDrawMenuOpen(false)
    setConfirm({
      title: 'Çizimi sil',
      message: 'Sayfadaki bütün çizim silinsin mi? Geri al ile geri getirilebilir.',
      action: 'Sil',
      run: () => {
        pageDrawing.clear()
        setSelectedStrokes(new Set())
      },
    })
  }

  // Çizim modunda klavye: Escape önce seçimi, sonra büyütmeyi, en son çizim modunu kapatır; Ctrl+Z
  // geri alır, Ctrl+Shift+Z / Ctrl+Y yineler; seçimde Ctrl+C / Ctrl+X / Ctrl+V ve Delete
  useEffect(() => {
    if (!drawingOn || !isCurrent) return
    const onKey = (e) => {
      if (confirm || drawMenuOpen) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (e.key === 'Escape') {
        if (drawSelecting) changeDrawSelecting(false)
        else if (zoom > 1) setZoom(1)
        else changeDrawing(false)
      } else if (mod && key === 'z' && !e.shiftKey) pageDrawing.undo()
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) pageDrawing.redo()
      else if (mod && key === 'c' && drawSelecting) copyStrokes()
      else if (mod && key === 'x' && drawSelecting) cutStrokes()
      else if (mod && key === 'v' && clipboardStrokes > 0) pasteStrokes()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && drawSelecting) deleteStrokes()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ─── Ekler ───────────────────────────────────────────────────────────────────
  // Ataç menüsü: panoda resim varsa onu yapıştırmak, fotoğraf çekmek, galeriden ya da dosyadan
  async function openAttachMenu() {
    setEditingImage(null)
    const hasImage = await clipboardHasImage().catch(() => false)
    setAttachMenu({ hasImage })
  }

  // Eki imlecin son durduğu yere koyar; ekin altındaki satırdan yazmaya devam edilir
  async function attach(source) {
    setAttachMenu(null)
    setEditingImage(null)
    endDictationHere()
    let picked = null
    try {
      picked = await source()
    } catch {
      setNotice('Ek eklenemedi')
      return
    }
    if (!picked) return
    // PDF'te resim kâğıda düz basılır, el yapıştırması gibi yamuk durmaz
    if (docPaper && picked.type === 'image') picked = { ...picked, rotation: 0 }
    const at = await cursorTarget()
    if (!at) return
    const { note, segments, index, cursor } = at
    changeNote(note.id, serializeContent(insertAttachment(segments, index, cursor, picked)))
    flushSaves()
    active.current = { noteId: note.id, segment: index + 2, cursor: 0 }
    setFocusRequest({ noteId: note.id, segment: index + 2 })
  }

  const attachOptions = [
    ...(attachMenu?.hasImage ? [{ label: 'Panodaki resmi yapıştır', source: pasteImageFromClipboard }] : []),
    { label: 'Fotoğraf çek', source: takePhoto },
    { label: 'Galeriden fotoğraf', source: pickImageFromLibrary },
    { label: 'Dosya seç', source: pickFile },
  ]

  // Eki sayfadan kaldırma sorusu; kalkınca dosyası da silinir
  function confirmRemoveAttachment(attachment, remove) {
    const what =
      attachment.type === 'image' ? 'Bu resim' : attachment.type === 'link' ? `"${attachment.title || attachment.url}" linki` : `"${attachment.label}"`
    setConfirm({
      title: 'Eki sil',
      message: `${what} sayfadan kaldırılsın mı?`,
      action: 'Sil',
      run: () => {
        remove()
        setEditingImage(null)
        if (hasFile(attachment)) deleteAttachmentFile(attachment.name)
      },
    })
  }

  // Tam ekranda sayfadaki bütün resimler sırayla gezilir: bloklar yukarıdan aşağı
  function openImage(name) {
    setEditingImage(null)
    const images = notesRef.current.flatMap((n) => parseContent(n.content)).filter((s) => s.type === 'image')
    const index = images.findIndex((s) => s.name === name)
    if (index !== -1) setViewer({ images, index })
  }

  // Tam ekranda kırpılan resim yeni dosyasıyla bloğunda yerini alır; eski dosya silinir
  async function cropViewerImage(name, rect) {
    const cropped = await cropAttachmentImage(name, rect)
    const note = notesRef.current.find((n) => parseContent(n.content).some((s) => s.type === 'image' && s.name === name))
    if (!note) return
    const segments = parseContent(note.content).map((s) =>
      s.type === 'image' && s.name === name ? { ...s, name: cropped.name, width: cropped.width, height: cropped.height } : s,
    )
    changeNote(note.id, serializeContent(segments))
    flushSaves()
    deleteAttachmentFile(name)
  }

  // Sayfadaki bütün bloklar silinir; başlık yerinde kalır
  function clearPage() {
    if (notesRef.current.length === 0 && pageDrawing.strokes.length === 0) return
    setConfirm({
      title: 'Sayfayı temizle',
      message: 'Sayfadaki bütün yazılar silinsin mi? Bu geri alınamaz.',
      action: 'Temizle',
      run: () => {
        endDictationHere()
        setSelecting(false)
        removeNotes(notesRef.current)
        pageDrawing.clear()
        selection.current = null
      },
    })
  }

  function deletePage() {
    if (!onDeletePage) return
    setConfirm({
      title: 'Sayfayı sil',
      message: isBoard
        ? 'Bu not bütün yazıları, resimleri ve dosyalarıyla panodan kaldırılsın mı? Bu geri alınamaz.'
        : 'Bu sayfa bütün yazılarıyla defterden çıkarılsın mı? Ardındaki sayfalar birer sayfa geri kayar. Bu geri alınamaz.',
      action: 'Sil',
      run: () => {
        endDictationHere()
        pendingSaves.current.clear()
        onDeletePage()
      },
    })
  }

  const pageEmpty = notes.length === 0 && pageDrawing.strokes.length === 0
  const settingsSections = [
    ...(docPaper ? [{
      title: 'Yazı',
      items: [
        {
          label: rawMarkdown ? 'Biçimli yaz' : "Markdown'ı düzenle",
          hint: rawMarkdown
            ? 'Şu an yazıya dokununca ham Markdown açılıyor; yazı biçimli görünürken yazılsın'
            : 'Yazıya dokununca ham Markdown açılsın; görseller, tablolar ve kod da düzenlenir',
          icon: 'pencil',
          onPress: () => {
            document.activeElement?.blur?.()
            setRawMarkdown(!rawMarkdown)
          },
        },
      ],
    }] : []),
    {
      title: 'Sayfa',
      items: [
        ...(onAddPage
          ? [
              { label: 'Sola sayfa ekle', hint: 'Bu sayfanın önüne boş bir sayfa', icon: 'pageAddLeft', onPress: () => onAddPage('left') },
              { label: 'Sağa sayfa ekle', hint: 'Bu sayfanın ardına boş bir sayfa', icon: 'pageAddRight', onPress: () => onAddPage('right') },
            ]
          : []),
        {
          label: 'Sayfayı temizle',
          hint: reading ? 'Okuma modunda sayfa değişmez' : pageEmpty ? 'Sayfa zaten boş' : 'Bütün yazılar, çizimler ve ekler silinir',
          icon: 'eraser',
          danger: true,
          disabled: reading || pageEmpty,
          onPress: clearPage,
        },
        ...(onDeletePage
          ? [
              {
                label: 'Sayfayı sil',
                hint: isBoard ? 'Not panodan kalkar' : 'Sayfa defterden çıkar, ardındakiler geri kayar',
                icon: 'trash',
                danger: true,
                onPress: deletePage,
              },
            ]
          : []),
      ],
    },
  ]

  const folioText = folio ? (
    hand ? (
      <div style={styles.folioText}>{`sf. ${folio.number} / ${folio.total}` + HAND_TAIL}</div>
    ) : (
      <div style={styles.docFolioText}>{`${folio.number} / ${folio.total}`}</div>
    )
  ) : null
  const headingView = (
    <PageHeading
      heading={heading}
      onTitleChange={canTitle ? changeTitle : undefined}
      onTitleSubmit={canTitle ? openFirstBlock : undefined}
      readOnly={reading || drawingOn || selecting}
      document={!hand}
    />
  )

  return (
    <div
      ref={paperRef}
      // Sayfada resmin dışında bir yere dokunulunca resim düzenlemesi kapanır
      onPointerDown={(e) => {
        if (editingImage && !e.target.closest('.nb-photo, .nb-image-handle, .lib-hand-icon')) setEditingImage(null)
      }}
      className="nb-paper"
      style={{
        ...styles.paper,
        ...(hand ? styles.handPaper : null),
        // Fosforlu kalem açıkken seçim kalemin renginde: yazının üstünden kalem geçiyormuş gibi
        '--nb-selection': pen.active ? highlightFill(pen.color) : 'rgba(11, 92, 173, 0.25)',
      }}
    >
      <Surface hand={hand} seed={paperSeed(page)} oxford={paper === 'oxford'}>
      <PageTopBar
        onBack={onBack}
        tight={
          [!reading, !reading && clipboardBlocks > 0, true, true, onCalendarPress, onSearchPress, onFilterPress, !reading, true].filter(Boolean).length >= 8
        }
      >
        {drawingOn ? (
          <DrawingActions
            zoom={zoom}
            onResetZoom={() => setZoom(1)}
            selecting={drawSelecting}
            onSelectingChange={changeDrawSelecting}
            clipboardStrokes={clipboardStrokes}
            onPaste={pasteStrokes}
            onClearClipboard={confirmClearStrokeClipboard}
            onClose={() => changeDrawing(false)}
          />
        ) : (
        <>
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
          onPress={() => onReadingChange?.(!reading)}
        />
        {!isBoard && (
          <HandIcon
            shape="bookmark"
            label={favorite ? 'Ayracı kaldır' : 'Ayraç koy'}
            size={28}
            selected={favorite}
            fill={favorite ? notebookFills.bookmarkFill : undefined}
            onPress={toggleFavorite}
          />
        )}
        {onCalendarPress && <HandIcon shape="calendar" label="Takvim" size={28} onPress={onCalendarPress} />}
        {onSearchPress && <HandIcon shape="search" label="Sayfalarda ara" size={28} onPress={onSearchPress} />}
        {onFilterPress && (
          <HandIcon
            shape="filter"
            label={filtering ? 'Filtreyi değiştir' : 'Sayfaları filtrele'}
            size={28}
            selected={filtering}
            fill={filtering ? notebookFills.filterFill : undefined}
            onPress={onFilterPress}
          />
        )}
        {!reading && <HandIcon shape="brush" label="Çizim modu" size={28} onPress={() => changeDrawing(true)} />}
        <HandIcon shape="more" label="Sayfa ayarları" size={28} onPress={openSettings} />
        </>
        )}
      </PageTopBar>
      {/* Not defterinde başlık kaymaz; PDF'te kâğıdın üstünde, yazıyla birlikte kayar */}
      {hand && headingView}

      <div ref={scrollRef} className="nb-scroll" style={{ ...styles.scroll, overflowX: drawingOn && zoom > 1 ? 'auto' : 'hidden' }}>
        <div
          ref={ruledRef}
          style={{
            ...styles.ruled,
            ...(hand ? styles.handRuled : null),
            paddingBottom: hand ? notebook.lineHeight * 2 : docPage.lineHeight * 2,
            // Çizim sayfanın sonundan aşağı taşarsa sayfa onu da içine alacak kadar uzar
            minHeight: Math.max(strokesBottom(pageDrawing.strokes), sheetMinHeight),
            // Çizim modunda sayfanın tamamı sol üst köşesinden büyür
            ...(drawingOn && zoom !== 1 ? { zoom } : null),
          }}
        >
          {hand ? <RuledLines paper={paper} /> : headingView}

          {notes.map((note, index) => (
            <NoteEntry
              key={note.id}
              note={note}
              rowRef={(el) => {
                if (el) rowRefs.current.set(note.id, el)
                else rowRefs.current.delete(note.id)
              }}
              inert={selecting || drawingOn}
              selected={selecting && selectedIds.has(note.id)}
              lifted={drag?.from === index}
              dragOffset={drag?.from === index ? drag.offset : 0}
              dragTransition={drag?.from === index && !drag.moving ? 'transform 140ms ease-out' : 'none'}
              gripProps={gripProps(index)}
              focusRequest={focusRequest}
              rawMarkdown={rawMarkdown}
              readOnly={reading || drawingOn}
              onChangeContent={(content) => {
                if (dictationTarget.current?.noteId === note.id) endDictationHere()
                changeNote(note.id, content)
              }}
              onActive={(segment, cursor) => {
                active.current = { noteId: note.id, segment, cursor }
                pasteSpot.current = { noteId: note.id, segment, cursor }
              }}
              // Yazıdan çıkınca seçim bırakılmış olur. Boş bloklar burada silinmez.
              onBlur={() => {
                releaseSelection(note.id)
                flushSaves()
              }}
              onSelect={(start, end) => selectText(note.id, start, end)}
              onSplit={(segment, at, prefix) => splitNote(note.id, segment, at, prefix)}
              onMergeBack={() => mergeBack(note.id)}
              onPasteMarkdown={(result) => pasteMarkdown(result)}
              editingImage={editingImage}
              onEditImage={setEditingImage}
              onOpenImage={openImage}
              onConfirmRemove={confirmRemoveAttachment}
              onPasteImage={(segment, file) => attach(() => imageAttachment(file))}
              onPasteLink={(segment, url) => {
                const loading = 'Link kartı hazırlanıyor…'
                setNotice(loading)
                attach(() => linkAttachment(url)).then(() => setNotice((n) => (n === loading ? null : n)))
              }}
              hand={hand}
              onMoveLine={(segment, from, to) => moveNoteLine(note.id, segment, from, to)}
            />
          ))}

          {heading && notes.length === 0 && loaded && !reading && !selecting && !drawingOn && (
            // Boş sayfa soluk bir davetle başlar (not defterinde çizgili satırda, kenarında çizgi);
            // tıklayınca ilk blok açılır
            <button type="button" onClick={startFirstBlock} className="nb-hint" style={hand ? styles.hintRow : styles.docHintRow} aria-label={heading.hint}>
              {hand && (
                <span style={styles.hintMargin}>
                  <MarginTime time={null} />
                </span>
              )}
              <span style={hand ? styles.hint : styles.docHint}>{hand ? heading.hint + HAND_TAIL : heading.hint}</span>
            </button>
          )}

          <div style={styles.blank} onClick={tapBelowBlocks} aria-hidden="true" />

          {/* Bırakılınca bloğun gireceği yeri gösteren kurşun kalem çizgisi */}
          {drag && drag.to !== drag.from && drag.lineTop != null && (
            <div style={{ ...styles.dropLine, top: drag.lineTop - 1.5 }} />
          )}

          <StrokeLayer strokes={pageDrawing.strokes} hidden={drawSelecting ? selectedStrokes : undefined} />

          {drawingOn && isCurrent && (
            <DrawingSurface
              scrollRef={scrollRef}
              zoom={zoom}
              onZoom={setZoom}
              tool={drawTool}
              pen={drawPen}
              strokes={pageDrawing.strokes}
              selected={drawSelecting ? selectedStrokes : new Set()}
              onSelectedChange={setSelectedStrokes}
              drawing={pageDrawing}
            />
          )}

          {selecting && (
            <BlockSelection
              scrollRef={scrollRef}
              extents={extents}
              selected={new Set(notes.flatMap((n, i) => (selectedIds.has(n.id) ? [i] : [])))}
              onTap={tapBlock}
              onSweep={sweepBlocks}
            />
          )}
        </div>
      </div>

      {/* Okurken alt çubuğun yerinde sayfa numarası durur */}
      {reading ? (
        <div style={styles.folio}>{folioText}</div>
      ) : drawingOn ? (
        <>
          {folioText && <div style={styles.folio}>{folioText}</div>}
          {drawSelecting ? (
            <SelectionBar
              count={pickedStrokes.length}
              notice={drawNotice}
              noun="çizgi"
              idle="alan seç"
              onCopy={copyStrokes}
              onCut={cutStrokes}
              onDuplicate={duplicateStrokes}
              onDelete={deleteStrokes}
            />
          ) : (
            <DrawingBar
              tool={drawTool}
              onToolChange={changeDrawTool}
              pen={drawPen}
              onPenPress={() => setDrawMenuOpen(true)}
              canUndo={pageDrawing.canUndo}
              canRedo={pageDrawing.canRedo}
              onUndo={pageDrawing.undo}
              onRedo={pageDrawing.redo}
            />
          )}
        </>
      ) : selecting ? (
        <>
          {folioText && <div style={styles.folio}>{folioText}</div>}
          <SelectionBar
            count={notes.filter((n) => selectedIds.has(n.id)).length}
            notice={selectionNotice}
            onCopy={copySelection}
            onCut={cutSelection}
            onDuplicate={duplicateSelection}
            onDelete={deleteSelection}
          />
        </>
      ) : (
        <>
          {folioText && <div style={styles.folio}>{folioText}</div>}
          {hand ? (
            <BottomBar
              listening={dictation.listening}
              pen={pen}
              onSwatchPress={() => {
                setAttachMenu(null)
                setColorMenuOpen(true)
              }}
              onHighlighterPress={() => changePen({ ...pen, active: !pen.active }, 'button')}
              onMicPress={toggleDictation}
              onClockPress={toggleTime}
              onClockEditPress={openTimeMenu}
              onCheckPress={() => toggleLine(toggleCheckLine)}
              onNumberPress={() => toggleLine(toggleNumberLine)}
              onClipPress={() => (attachMenu ? setAttachMenu(null) : openAttachMenu())}
              notice={notice}
            />
          ) : (
          <DocumentBar
            listening={dictation.listening}
            pen={pen}
            onSwatchPress={() => setColorMenuOpen(true)}
            onHighlighterPress={() => changePen({ ...pen, active: !pen.active }, 'button')}
            onPaste={pasteFromClipboard}
            onHeading={() => formatLines('heading')}
            onBold={() => formatInline('bold')}
            onItalic={() => formatInline('italic')}
            onBullet={() => formatLines('bullet')}
            onTask={() => formatLines('task')}
            onCode={() => editMarkdown(insertCodeBlock)}
            onMicPress={toggleDictation}
            onClipPress={() => (attachMenu ? setAttachMenu(null) : openAttachMenu())}
            notice={notice}
          />
          )}
        </>
      )}

      {attachMenu && (
        <div style={styles.menuLayer} onPointerDown={(e) => e.target === e.currentTarget && setAttachMenu(null)}>
          <div style={styles.attachMenu} role="menu">
            {attachOptions.map((option, i) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => attach(option.source)}
                className="nb-attach-option"
                style={{ ...styles.attachOption, ...(i > 0 ? styles.attachDivider : null) }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewer && (
        <ImageViewer
          images={viewer.images}
          startIndex={viewer.index}
          onClose={() => setViewer(null)}
          onCrop={reading ? undefined : cropViewerImage}
        />
      )}

      <DrawPenMenu
        visible={drawMenuOpen}
        pen={drawPen}
        onChange={changeDrawPen}
        onClear={pageDrawing.strokes.length > 0 ? confirmClearDrawing : undefined}
        onClose={() => setDrawMenuOpen(false)}
      />

      <TimeMenu visible={timeEdit !== null} time={timeEdit?.time ?? null} onClose={saveEditedTime} />

      <PenMenu visible={colorMenuOpen} pen={pen} onChange={(next) => changePen(next, 'menu')} onClose={() => setColorMenuOpen(false)} />

      <PageSidebar
        visible={settingsOpen}
        title="Sayfa ayarları"
        subtitle={heading?.meta}
        sections={settingsSections}
        onClose={() => setSettingsOpen(false)}
      />

      <TornPaperMenu
        visible={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        options={[
          {
            label: confirm?.action ?? 'Tamam',
            danger: true,
            onPress: () => {
              const run = confirm?.run
              setConfirm(null)
              run?.()
            },
          },
          { label: 'Vazgeç', onPress: () => setConfirm(null) },
        ]}
        onClose={() => setConfirm(null)}
      />
      </Surface>
    </div>
  )
}

// Not defterinin dokulu kâğıdı (kırmızı kenar boşluğu yalnızca oxford'da); PDF'in sayfası düz beyaz
function Surface({ hand, seed, oxford, children }) {
  if (!hand) return children
  return (
    <Paper seed={seed} margin={oxford}>
      {children}
    </Paper>
  )
}

const styles = {
  paper: {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: docPage.sheet,
    color: docPage.ink,
  },
  handPaper: {
    backgroundColor: notebook.paper,
    color: notebook.graphite,
  },
  // Not defterinde satırlar en üstten başlar: çizgiler satırların altına denk gelir
  handRuled: {
    paddingTop: 0,
  },
  hintRow: {
    position: 'relative',
    display: 'block',
    margin: 0,
    padding: `0 ${HAND_ROW_RIGHT}px 0 ${HAND_ROW_LEFT}px`,
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'text',
  },
  hintMargin: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: notebook.marginX - 8,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  hint: {
    ...fonts.hand,
    fontSize: 21,
    lineHeight: `${notebook.lineHeight}px`,
    color: 'rgba(56, 56, 61, 0.35)',
  },
  folioText: {
    ...fonts.hand,
    fontSize: 19,
    lineHeight: '28px',
    color: 'rgba(56, 56, 61, 0.6)',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  menuLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
  },
  // Alt çubuğun üstünde, kâğıt parçası gibi hafif yamuk menü
  attachMenu: {
    position: 'absolute',
    bottom: 46 + 8,
    left: '50%',
    minWidth: 220,
    padding: '4px 0',
    backgroundColor: '#FFFDF5',
    border: '1px solid rgba(56, 56, 61, 0.25)',
    borderRadius: 3,
    transform: 'translateX(-50%) rotate(-1deg)',
    boxShadow: '1px 2px 6px rgba(59, 47, 26, 0.25)',
  },
  attachOption: {
    display: 'block',
    width: '100%',
    margin: 0,
    padding: '8px 18px',
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    ...fonts.handBold,
    fontSize: 22,
    color: notebook.graphite,
    cursor: 'pointer',
  },
  attachDivider: {
    borderTop: `1px solid ${notebook.rule}`,
  },
  dropLine: {
    position: 'absolute',
    left: 8,
    right: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: notebook.graphite,
    pointerEvents: 'none',
    zIndex: 25,
  },
  // PDF: başlık üst çubuğun hemen altında başlar
  ruled: {
    position: 'relative',
    flexGrow: 1,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 10,
    boxSizing: 'border-box',
  },
  docHintRow: {
    display: 'block',
    margin: 0,
    padding: `0 20px 0 ${DOC_ROW_LEFT}px`,
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'text',
  },
  docHint: {
    ...fonts.docItalic,
    fontSize: docPage.fontSize,
    lineHeight: `${docPage.lineHeight}px`,
    color: docPage.faint,
  },
  blank: {
    flexGrow: 1,
    minHeight: notebook.lineHeight * 3,
    cursor: 'text',
  },
  folio: {
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 4,
    minHeight: 8,
  },
  docFolioText: {
    ...fonts.bodyThin,
    fontSize: 12,
    lineHeight: '24px',
    letterSpacing: 1,
    color: docPage.muted,
  },
}
