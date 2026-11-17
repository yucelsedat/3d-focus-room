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
import { TornPaperMenu } from './TornPaperMenu.jsx'
import { colors, fonts, HAND_TAIL, shelf, type } from './theme.js'

// Ana sayfa: defterlerin raflarda durduğu kitaplıklar (seyir defteri: app/index.tsx). Her
// kategorinin kendi kitaplığı vardır; kitaplıklar yan yana durur, sola sağa kaydırınca ya da
// başlığın altındaki sekmelerden birine basınca öbür kategoriye geçilir (açılışta Genel).
// Kitaplığın rafları aşağı doğru uzar. Sağ üstteki kalemle düzenlemeye geçilir; düzenlerken
// defterler basılı tutulup sürüklenerek yer değiştirir.
export default function LibraryPage() {
  const navigate = useNavigate()
  const pagerRef = useRef(null)
  const shelfRefs = useRef(new Map())
  const [notebooks, setNotebooks] = useState([])
  const [categories, setCategories] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [activeId, setActiveId] = useState(GENERAL_CATEGORY_ID)
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState(false)
  // Basılı tutulan defter; silme sorusu ve kategori seçimi aynı kâğıtta sorulur. Kâğıt
  // kapanırken yazısı silinmesin diye seçili defter kapanınca da tutulur.
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMode, setMenuMode] = useState('main')
  // Kitaplıkların yan yana durduğu alanın eni; her kitaplık bu kadar yer kaplar
  const [pageWidth, setPageWidth] = useState(0)
  // Bir defter sürüklenirken kitaplıklar arasında geçilmez
  const [dragging, setDragging] = useState(false)
  // Görünen kitaplık ve onun çizildiği en
  const shown = useRef({ page: 0, width: 0 })
  const wallRef = useRef(null)

  // Oluşturma ekranından dönünce yeni defter de rafta görünsün (rota her açılışta yeniden kurulur)
  useEffect(() => {
    let cancelled = false
    Promise.all([getNotebooks(), getCategories()])
      .then(([books, list]) => {
        if (cancelled) return
        setNotebooks(books)
        setCategories(list)
        setLoadError(null)
        setActiveId((id) => (list.some((c) => c.id === id) ? id : GENERAL_CATEGORY_ID))
      })
      .catch((err) => !cancelled && setLoadError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setPageWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Kategoriler ayarlanınca; seçili kategori silinmişse Genel'e dönülür
  function updateCategories(list) {
    setCategories(list)
    setActiveId((id) => (list.some((c) => c.id === id) ? id : GENERAL_CATEGORY_ID))
  }

  const activeIndex = Math.max(0, categories.findIndex((c) => c.id === activeId))

  // Sekmeden seçilen kategorinin kitaplığına kayılır; en değişince görünen kitaplık yerinde kalır
  useLayoutEffect(() => {
    if (pageWidth === 0) return
    const { page, width } = shown.current
    if (page === activeIndex && width === pageWidth) return
    shown.current = { page: activeIndex, width: pageWidth }
    pagerRef.current?.scrollTo({ left: activeIndex * pageWidth, behavior: width === pageWidth ? 'smooth' : 'auto' })
  }, [activeIndex, pageWidth])

  // Kaydırarak başka kitaplığa geçilince onun sekmesi seçilir
  const settleTimer = useRef(0)
  function onPagerScroll() {
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = pagerRef.current
      if (!el || pageWidth === 0) return
      const page = Math.round(el.scrollLeft / pageWidth)
      const category = categories[page]
      if (!category || Math.abs(el.scrollLeft - page * pageWidth) > 2) return
      shown.current = { page, width: pageWidth }
      setActiveId(category.id)
    }, 90)
  }

  const counts = useMemo(() => {
    const result = new Map()
    for (const nb of notebooks) result.set(nb.category_id, (result.get(nb.category_id) ?? 0) + 1)
    return result
  }, [notebooks])

  // Her kategorinin kitaplığı: defterleri raf raf, her rafta soldan sağa. Kitaplık en az
  // DEFAULT_SHELF_COUNT raftır; düzenlerken en alttaki dolu rafın altında hep boş bir raf olur.
  const library = useMemo(() => {
    const result = new Map()
    for (const category of categories) result.set(category.id, [])
    for (const nb of notebooks) {
      const shelves = result.get(nb.category_id)
      if (shelves) (shelves[nb.shelf] ??= []).push(nb)
    }
    for (const [id, shelves] of result) {
      const length = Math.max(DEFAULT_SHELF_COUNT, shelves.length + (editing ? 1 : 0))
      const full = Array.from({ length }, (_, i) => shelves[i] ?? [])
      for (const books of full) books.sort((a, b) => a.position - b.position || a.id - b.id)
      result.set(id, full)
    }
    return result
  }, [notebooks, categories, editing])
  const visibleCount = (library.get(activeId) ?? []).reduce((sum, books) => sum + books.length, 0)

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
    <div className="lib-root">
      <div className="lib-app" style={styles.app}>
        <header style={styles.header}>
          <button
            type="button"
            onClick={() => navigate('/worlds')}
            aria-label="Odalar"
            title="3B odalara git"
            className="lib-press"
            style={styles.headerButton}
          >
            <Icon name="cube-outline" size={22} color={colors.onInk} style={{ opacity: 0.7 }} />
          </button>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Kitaplık</h1>
            {editing && <div style={styles.subtitle}>Basılı tut, sürükle</div>}
          </div>
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            disabled={!canEdit}
            aria-label={editing ? 'Düzenlemeyi bitir' : 'Kitaplığı düzenle'}
            title={editing ? 'Düzenlemeyi bitir' : 'Defterlerin yerini sürükleyerek değiştir'}
            className="lib-press"
            style={{ ...styles.headerButton, ...(!canEdit ? styles.headerButtonDisabled : null) }}
          >
            <Icon name={editing ? 'checkmark' : 'create-outline'} size={24} color={colors.onInk} />
          </button>
        </header>
        <CategoryTabs
          categories={categories}
          activeId={activeId}
          counts={counts}
          onSelect={(id) => id !== activeId && setActiveId(id)}
          onManage={() => setManaging(true)}
        />
        <div ref={wallRef} style={styles.wall}>
          <div
            ref={pagerRef}
            className="lib-pager"
            onScroll={onPagerScroll}
            style={{ ...styles.pager, overflowX: dragging ? 'hidden' : 'auto' }}
          >
            {pageWidth > 0 &&
              categories.map((category) => {
                const shelves = library.get(category.id) ?? []
                const empty = shelves.every((books) => books.length === 0)
                return (
                  <div key={category.id} style={{ ...styles.page, width: pageWidth }}>
                    <Bookshelf
                      ref={(handle) => {
                        if (handle) shelfRefs.current.set(category.id, handle)
                        else shelfRefs.current.delete(category.id)
                      }}
                      shelves={shelves}
                      editing={editing}
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
        <BottomNav active="library" onReselect={() => shelfRefs.current.get(activeId)?.scrollToTop(true)} />
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

const styles = {
  app: {
    backgroundColor: colors.ink,
  },
  header: {
    height: 64,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
  headerButtonDisabled: {
    opacity: 0.25,
    cursor: 'default',
  },
  title: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    lineHeight: 1.2,
    color: colors.onInk,
  },
  subtitle: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1.5,
    color: colors.onInk,
  },
  wall: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    backgroundColor: shelf.wall,
  },
  pager: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    overflowY: 'hidden',
  },
  page: {
    position: 'relative',
    flexShrink: 0,
    height: '100%',
    display: 'flex',
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
  },
  emptyText: {
    ...fonts.hand,
    fontSize: 21,
    lineHeight: 1.25,
    color: 'rgba(244, 239, 230, 0.75)',
  },
}
