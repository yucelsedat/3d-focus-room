import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import './library.css'
import {
  deleteNotebook,
  getCategories,
  getNotebooks,
  setNotebookCategory,
  setNotebookShelves,
} from './api.js'
import { Bookshelf } from './Bookshelf.jsx'
import { CategoryManager } from './CategoryManager.jsx'
import { AddButton, BottomNav, CategoryTabs } from './chrome.jsx'
import { Icon } from './icons.jsx'
import { DEFAULT_SHELF_COUNT, GENERAL_CATEGORY_ID, settleOverflow } from './model.js'
import { forgetNotebook } from './state.js'
import { forgetLibraryBook, libKey } from '../../components/notebook/libraryShelf.js'
import { useStore } from '../../store/useStore.js'
import { TornPaperMenu } from './TornPaperMenu.jsx'
import { colors, fonts, HAND_TAIL } from './theme.js'

// Ana sayfa: her kategorinin tek sütunlu dolabı yan yana durur (geniş ekranda üçü birden
// görünür). Üstteki ince çubuktaki sekmelerden birine basınca o kategorinin dolabı seçilir;
// ekranda değilse dolaplar onu gösterecek kadar (bir dolap) kayar. Yatay kaydırınca da geçilir. Raflar aşağı doğru uzar ve bütün dolaplar birlikte aşağı yukarı kayar. Gezinme solda dikey bir şerittir. Kalemle
// düzenlemeye geçilir; düzenlerken defterler basılı tutulup sürüklenerek yer değiştirir.
export default function LibraryPage() {
  const navigate = useNavigate()
  const wallRef = useRef(null)
  const pagerRef = useRef(null)
  const shelfRefs = useRef(new Map())
  const [notebooks, setNotebooks] = useState([])
  const [categories, setCategories] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [activeId, setActiveId] = useState(GENERAL_CATEGORY_ID)
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState(false)
  // Bir defter sürüklenirken dolaplar yana kaymaz
  const [dragging, setDragging] = useState(false)
  // Basılı tutulan defter; silme sorusu ve kategori seçimi aynı kâğıtta sorulur. Kâğıt
  // kapanırken yazısı silinmesin diye seçili defter kapanınca da tutulur.
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMode, setMenuMode] = useState('main')
  // Dolapların durduğu alanın eni ve bir dolabın kapladığı en: geniş ekranda üç dolap yan yana görünür
  const [wallWidth, setWallWidth] = useState(0)
  const perScreen = wallWidth >= 1050 ? 3 : wallWidth >= 720 ? 2 : 1
  const pageW = wallWidth > 0 ? Math.floor(wallWidth / perScreen) : 0
  // Ekranda görünen ilk (en soldaki) dolabın sırası ve onun çizildiği en
  const shown = useRef({ first: 0, pageW: 0 })

  // Oluşturma ekranından dönünce yeni defter de rafta görünsün (rota her açılışta yeniden kurulur)
  useEffect(() => {
    let cancelled = false
    Promise.all([getNotebooks(), getCategories()])
      .then(([books, list]) => {
        if (cancelled) return
        setNotebooks(books)
        setCategories(list)
        setLoadError(null)
        // Kitaplık hep ilk kategorinin dolabıyla açılır
        setActiveId(list[0]?.id ?? GENERAL_CATEGORY_ID)
      })
      .catch((err) => !cancelled && setLoadError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWallWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function updateCategories(list) {
    setCategories(list)
    setActiveId(keepCategory(list))
  }

  const activeIndex = Math.max(0, categories.findIndex((c) => c.id === activeId))

  // Dolaplar yalnız gerektiğinde kayar: seçilen dolap ekrandaysa yerinde kalır, değilse dolaplar
  // onu ekrana sokacak kadar (bir dolap) kayar. Son dolap en sağa gelince daha öteye gidilmez,
  // ardında boşluk kalmaz. (first. dolap en soldayken kaydırma = first * pageW)
  const maxFirst = Math.max(0, categories.length - perScreen)
  useLayoutEffect(() => {
    if (pageW === 0) return
    const prev = shown.current
    let first = Math.min(prev.first, maxFirst)
    if (activeIndex < first) first = activeIndex
    else if (activeIndex > first + perScreen - 1) first = activeIndex - perScreen + 1
    first = Math.max(0, Math.min(first, maxFirst))
    if (first === prev.first && pageW === prev.pageW) return
    shown.current = { first, pageW }
    const smooth = prev.pageW === pageW
    pagerRef.current?.scrollTo({ left: first * pageW, behavior: smooth ? 'smooth' : 'auto' })
  }, [activeIndex, pageW, perScreen, maxFirst])

  function goToCategory(id) {
    if (id !== activeId && categories.some((c) => c.id === id)) setActiveId(id)
  }

  // Elle yatay kaydırma durunca: seçili dolap ekrandan çıktıysa ekrandaki en yakın dolap seçilir
  const settleTimer = useRef(0)
  function onPagerScroll() {
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = pagerRef.current
      if (!el || pageW === 0) return
      const end = el.scrollWidth - el.clientWidth
      const first = Math.max(0, Math.min(Math.round(el.scrollLeft / pageW), maxFirst))
      // Dolap yerine oturmadıysa (kayma sürüyor) bekle; en sonda sağ kenar da yerine oturmaktır
      if (Math.abs(el.scrollLeft - first * pageW) > 2 && el.scrollLeft < end - 2) return
      shown.current = { first, pageW }
      const last = Math.min(categories.length - 1, first + perScreen - 1)
      const next = Math.max(first, Math.min(activeIndex, last))
      if (next !== activeIndex && categories[next]) setActiveId(categories[next].id)
    }, 90)
  }

  // Dolaplar aynı zeminde durur: biri aşağı yukarı kayınca öbürleri de aynı yüksekliğe kayar
  function syncScroll(sourceId, top) {
    for (const [id, handle] of shelfRefs.current) if (id !== sourceId) handle.setScrollTop(top)
  }

  const counts = useMemo(() => {
    const result = new Map()
    for (const nb of notebooks) result.set(nb.category_id, (result.get(nb.category_id) ?? 0) + 1)
    return result
  }, [notebooks])

  // Her kategorinin kitaplığı: defterleri raf raf, her rafta soldan sağa. Dolaplar yan yana
  // aynı hizada durduğu için hepsi aynı sayıda raftır: en az DEFAULT_SHELF_COUNT, en uzun
  // kategorininki kadar; düzenlerken en alttaki dolu rafın altında hep boş bir raf olur.
  const library = useMemo(() => {
    const result = new Map()
    for (const category of categories) result.set(category.id, [])
    for (const nb of notebooks) {
      const shelves = result.get(nb.category_id)
      if (shelves) (shelves[nb.shelf] ??= []).push(nb)
    }
    let length = DEFAULT_SHELF_COUNT
    for (const shelves of result.values()) length = Math.max(length, shelves.length + (editing ? 1 : 0))
    for (const [id, shelves] of result) {
      const full = Array.from({ length }, (_, i) => shelves[i] ?? [])
      for (const books of full) books.sort((a, b) => a.position - b.position || a.id - b.id)
      result.set(id, full)
    }
    return result
  }, [notebooks, categories, editing])
  const activeShelves = library.get(activeId) ?? []
  const visibleCount = activeShelves.reduce((sum, books) => sum + books.length, 0)

  // Yalnızca defterin kendi kategorisindeki defterlerin yeri değişir. Dolu rafa giren defter
  // rafın en sağındakini alttaki rafa indirir, o raf da doluysa onun en sağındakini...
  function move(id, to) {
    const book = notebooks.find((b) => b.id === id)
    const shelves = book && library.get(book.category_id)
    if (!book || !shelves) return
    const next = shelves.map((books) => books.filter((b) => b.id !== id))
    while (next.length <= to.shelf) next.push([])
    next[to.shelf].splice(to.index, 0, book)
    settleOverflow(next, to.shelf)
    const slots = new Map()
    next.forEach((books, s) => books.forEach((b, position) => slots.set(b.id, { shelf: s, position })))
    setNotebooks((prev) => prev.map((b) => (slots.has(b.id) ? { ...b, ...slots.get(b.id) } : b)))
    setNotebookShelves(next.map((books) => books.map((b) => b.id)))
  }

  // Defter başka kategoriye geçer, o kategorinin raflarının sonuna konur
  async function moveSelectedTo(categoryId) {
    if (!selected) return
    const { id } = selected
    setMenuOpen(false)
    const slot = await setNotebookCategory(id, categoryId)
    if (slot) setNotebooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...slot } : b)))
  }

  function openNotebook(nb) {
    navigate(`/notebook?id=${nb.id}`)
  }

  function select(nb) {
    setMenuMode('main')
    setSelected(nb)
    setMenuOpen(true)
  }

  async function removeSelected() {
    if (!selected) return
    const { id } = selected
    setMenuOpen(false)
    await deleteNotebook(id)
    forgetNotebook(id)
    // Oyunda elde tutulan defter buysa bırakılır (B artık "elinde defter yok" der); kartlar
    // "silinmiş" görünür
    forgetLibraryBook(id)
    const st = useStore.getState()
    if (st.heldNotebook === libKey(id)) st.setHeldNotebook(null)
    setNotebooks((prev) => prev.filter((n) => n.id !== id))
  }

  // Menüden bir yere gidilince kâğıt kapanır
  function andClose(action) {
    return () => {
      if (!selected) return
      setMenuOpen(false)
      action(selected)
    }
  }

  const menuOptions =
    menuMode === 'delete'
      ? [
          { label: 'Evet, sil', danger: true, onPress: removeSelected },
          { label: 'Vazgeç', onPress: () => setMenuMode('main') },
        ]
      : menuMode === 'category'
        ? categories.map((category) => ({
            label: category.name,
            checked: category.id === selected?.category_id,
            onPress: () => moveSelectedTo(category.id),
          }))
        : [
            { label: 'Aç', onPress: andClose(openNotebook) },
            { label: 'Düzenle', onPress: andClose((nb) => navigate(`/edit-notebook/${nb.id}`)) },
            ...(categories.length > 1 ? [{ label: 'Kategori', onPress: () => setMenuMode('category') }] : []),
            { label: 'Sil', danger: true, onPress: () => setMenuMode('delete') },
          ]

  const menuTitle =
    menuMode === 'delete'
      ? `“${selected?.title}” silinsin mi?`
      : menuMode === 'category'
        ? 'Hangi kategoride?'
        : (selected?.title ?? '')

  // Yeri değişecek en az iki defter olunca düzenlenebilir
  const canEdit = editing || visibleCount > 1

  return (
    <div className="lib-root lib-home">
      <div className="lib-app lib-room-app">
        {/* Yan yana dolaplar: her kategorinin bir dolabı. Yatay kaydırılır, sekmeye basınca o
            kategorinin dolabı ekranda değilse dolaplar onu gösterecek kadar kayar. */}
        <div ref={wallRef} className="lib-room-wall">
          <div
            ref={pagerRef}
            className="lib-room-pager"
            onScroll={onPagerScroll}
            style={{ overflowX: dragging ? 'hidden' : 'auto' }}
          >
            <div className="lib-room-strip">
              {pageW > 0 &&
                categories.map((category) => {
                  const shelves = library.get(category.id) ?? []
                  const empty = shelves.every((books) => books.length === 0)
                  return (
                    <div key={category.id} className="lib-room-page" style={{ width: pageW }}>
                      <Bookshelf
                        ref={(handle) => {
                          if (handle) shelfRefs.current.set(category.id, handle)
                          else shelfRefs.current.delete(category.id)
                        }}
                        single
                        onScrollY={(top) => syncScroll(category.id, top)}
                        shelves={shelves}
                        lit={category.id === activeId}
                        editing={editing && category.id === activeId}
                        onOpen={openNotebook}
                        onSelect={select}
                        onMove={move}
                        onDragChange={setDragging}
                      >
                        {empty && (
                          <div style={styles.empty}>
                            <div style={styles.emptyTitle}>{'Bu raflar boş' + HAND_TAIL}</div>
                            <div style={styles.emptyText}>
                              {(category.id === GENERAL_CATEGORY_ID
                                ? 'Yeni bir defter ekle'
                                : 'Yeni defter ekle ya da bir defteri bu kategoriye taşı') + HAND_TAIL}
                            </div>
                          </div>
                        )}
                      </Bookshelf>
                    </div>
                  )
                })}
            </div>
          </div>
          {loadError && (
            <div style={styles.empty} role="alert">
              <div style={styles.emptyTitle}>{'Kitaplık açılamadı' + HAND_TAIL}</div>
              <div style={styles.emptyText}>{loadError}</div>
            </div>
          )}
          {!editing && !loadError && (
            <AddButton
              label="Yeni defter"
              hint="Seçili kategoride defter oluşturma ekranını açar"
              onPress={() => navigate(`/new-notebook?category=${activeId}`)}
            />
          )}
        </div>
        {/* Üstte ince çubuk: odalar, kategori sekmeleri, düzenleme ve kategori ayarı */}
        <div className="lib-topbar">
          <CategoryTabs
            categories={categories}
            activeId={activeId}
            counts={counts}
            onSelect={goToCategory}
            onManage={() => setManaging(true)}
            tone="room"
            leading={
              <button
                type="button"
                onClick={() => navigate('/worlds')}
                aria-label="Odalar"
                title="3B odalara git"
                className="lib-press"
                style={styles.barButton}
              >
                <Icon name="cube-outline" size={19} color={colors.onInk} style={{ opacity: 0.75 }} />
              </button>
            }
            trailing={
              <button
                type="button"
                onClick={() => setEditing((on) => !on)}
                disabled={!canEdit}
                aria-label={editing ? 'Düzenlemeyi bitir' : 'Kitaplığı düzenle'}
                title={editing ? 'Düzenlemeyi bitir' : 'Defterlerin yerini sürükleyerek değiştir'}
                className="lib-press"
                style={{ ...styles.barButton, ...(!canEdit ? styles.barButtonDisabled : null) }}
              >
                <Icon name={editing ? 'checkmark' : 'create-outline'} size={20} color={colors.onInk} />
              </button>
            }
          />
          {editing && <div className="lib-edit-hint">Basılı tut, sürükle</div>}
        </div>
        <BottomNav
          tone="room"
          orientation="vertical"
          active="library"
          onReselect={() => shelfRefs.current.forEach((handle) => handle.scrollToTop(true))}
        />
        <TornPaperMenu
          visible={menuOpen}
          title={menuTitle}
          message={
            menuMode === 'delete'
              ? 'İçindeki bütün notlar da silinir.'
              : menuMode === 'category'
                ? selected?.title
                : undefined
          }
          options={menuOptions}
          onClose={() => setMenuOpen(false)}
        />
        <CategoryManager
          visible={managing}
          onClose={() => setManaging(false)}
          onChange={(list) => {
            updateCategories(list)
            // Silinen kategorinin defterleri Genel'e geçmiş olabilir
            getNotebooks().then(setNotebooks)
          }}
        />
      </div>
    </div>
  )
}

// Seçili kategori silinmişse Genel'e dönülür (dönmeden)
function keepCategory(list) {
  return (id) => (list.some((c) => c.id === id) ? id : GENERAL_CATEGORY_ID)
}


const styles = {
  barButton: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
  barButtonDisabled: {
    opacity: 0.25,
    cursor: 'default',
  },
  // Boş kategoride rafların ortasında tebeşirle yazılmış gibi bir not
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 96,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 40px',
    gap: 4,
    pointerEvents: 'none',
    textAlign: 'center',
  },
  emptyTitle: {
    ...fonts.handBold,
    fontSize: 34,
    lineHeight: 1.2,
    color: colors.onInk,
    textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)',
  },
  emptyText: {
    ...fonts.hand,
    fontSize: 21,
    lineHeight: 1.25,
    color: 'rgba(244, 239, 230, 0.85)',
    textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)',
  },
}
