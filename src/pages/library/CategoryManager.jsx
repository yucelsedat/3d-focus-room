import { useEffect, useRef, useState } from 'react'

import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryCounts,
  renameCategory,
  setCategoryOrder,
} from './api.js'
import { Icon } from './icons.jsx'
import {
  categoryNameTaken,
  cleanCategoryName,
  GENERAL_CATEGORY_ID,
  GENERAL_CATEGORY_NAME,
  MAX_CATEGORY_NAME,
} from './model.js'
import { PAPER_LINE, PAPER_MARGIN, TornPaperMenu } from './TornPaperMenu.jsx'
import { colors, fonts, HAND_TAIL, notebook } from './theme.js'

const NAME_SIZE = 27
const COUNT_SIZE = 19
const PLACEHOLDER = 'rgba(56, 56, 61, 0.45)'

// Kitaplığın sekmelerinin ayarlandığı kâğıt: kategoriler satır satır yazılı; adın üstüne
// tıklayıp değiştirilir, çöp kutusuyla silinir, soldaki tutamaçtan sürüklenip sırası değişir,
// en alttaki boş satıra yenisi yazılır.
// Genel hep en baştadır, adı değişmez ve silinmez. Silinen kategorinin defterleri Genel'e geçer.
export function CategoryManager({ visible, onClose, onChange }) {
  const [categories, setCategories] = useState([])
  const [counts, setCounts] = useState(new Map())
  // Adı değiştirilmekte olan kategoriler: yazı satırdan ayrılınca kaydedilir
  const [drafts, setDrafts] = useState({})
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null)
  // Sürüklenen satır: sırası, parmağın kayması ve bırakılınca gireceği sıra
  const [drag, setDrag] = useState(null)

  const movable = categories.filter((c) => c.id !== GENERAL_CATEGORY_ID)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    Promise.all([getCategories(), getCategoryCounts()]).then(([list, c]) => {
      if (cancelled) return
      setCategories(list)
      setCounts(c)
    })
    return () => {
      cancelled = true
    }
  }, [visible])

  async function reload() {
    const [list, c] = await Promise.all([getCategories(), getCategoryCounts()])
    setCategories(list)
    setCounts(c)
    onChange?.(list)
  }

  function dropDraft(id) {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function commitRename(category) {
    const draft = drafts[category.id]
    if (draft === undefined) return
    dropDraft(category.id)
    const name = cleanCategoryName(draft)
    if (name === category.name || name === '') return
    if (categoryNameTaken(categories, name, category.id)) {
      setError(`“${name}” zaten var`)
      return
    }
    setError(null)
    await renameCategory(category.id, name).catch((e) => setError(e.message))
    await reload()
  }

  async function add() {
    const name = cleanCategoryName(newName)
    if (name === '') return
    if (categoryNameTaken(categories, name)) {
      setError(`“${name}” zaten var`)
      return
    }
    setError(null)
    setNewName('')
    await createCategory(name).catch((e) => setError(e.message))
    await reload()
  }

  // Kategori from'dan to'ya taşınır (ikisi de Genel'den sonrakiler arasındaki sıra); sekmeler
  // hemen yeni sırayla dizilir
  function move(from, to) {
    const next = [...movable]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    const list = [...categories.filter((c) => c.id === GENERAL_CATEGORY_ID), ...next]
    setCategories(list)
    onChange?.(list)
    setCategoryOrder(next.map((c) => c.id))
  }

  async function remove() {
    if (!confirming) return
    const { id } = confirming
    setConfirming(null)
    await deleteCategory(id)
    await reload()
  }

  // Kapanırken yarım kalan ad değişiklikleri de kaydedilir; kâğıt bir sonraki açılışta temiz gelir
  function close() {
    for (const category of categories) {
      if (drafts[category.id] !== undefined) commitRename(category)
    }
    setNewName('')
    setError(null)
    onClose()
  }

  // Tutamaçtan sürükleme: satırlar PAPER_LINE yüksekliğinde, alt alta
  const dragRef = useRef(null)
  function startDrag(e, index) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const d = { index, startY: e.clientY, offset: 0, target: index, pointerId: e.pointerId }
    dragRef.current = d
    setDrag(d)
  }
  function moveDrag(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const offset = e.clientY - d.startY
    const target = Math.max(0, Math.min(movable.length - 1, Math.round(d.index + offset / PAPER_LINE)))
    const next = { ...d, offset, target }
    dragRef.current = next
    setDrag(next)
  }
  function endDrag(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    setDrag(null)
    if (d.target !== d.index) move(d.index, d.target)
  }

  if (confirming) {
    const count = counts.get(confirming.id) ?? 0
    return (
      <TornPaperMenu
        visible={visible}
        title={`“${confirming.name}” silinsin mi?`}
        message={
          count > 0 ? `İçindeki ${count} defter ${GENERAL_CATEGORY_NAME}’e taşınır.` : 'Bu kategoride defter yok.'
        }
        options={[
          { label: 'Evet, sil', danger: true, onPress: remove },
          { label: 'Vazgeç', onPress: () => setConfirming(null) },
        ]}
        onClose={() => setConfirming(null)}
      />
    )
  }

  const general = categories.find((c) => c.id === GENERAL_CATEGORY_ID)
  const dropVisible = drag && drag.target !== drag.index
  // Kalemin gireceği yer: aşağı taşınırken hedef satırın altı, yukarı taşınırken üstü
  const dropTop = drag ? (drag.target > drag.index ? (drag.target + 1) * PAPER_LINE : drag.target * PAPER_LINE) : 0

  return (
    <TornPaperMenu
      visible={visible}
      title="Kategoriler"
      message={error ?? (movable.length > 1 ? 'Soldan tutup sürükle, sırası değişsin' : undefined)}
      options={[{ label: 'Tamam', onPress: close }]}
      onClose={close}
    >
      <div className="lib-scroll-y" style={{ maxHeight: window.innerHeight * 0.45, overflowY: drag ? 'hidden' : 'auto' }}>
        {general && (
          <div style={styles.row}>
            <div style={{ ...styles.hand, ...styles.name, ...styles.fixedName }}>{general.name + HAND_TAIL}</div>
            <CountText count={counts.get(general.id) ?? 0} />
            <div style={styles.icon} title={`${GENERAL_CATEGORY_NAME} hep en baştadır, silinemez`}>
              <Icon name="lock-closed-outline" size={17} color={PLACEHOLDER} />
            </div>
          </div>
        )}
        {/* Genel'den sonraki kategoriler: kenar boşluğundaki tutamaçtan basılı tutulup yukarı
            aşağı sürüklenir; bırakılacağı yerde kurşun kalem çizgisi çıkar */}
        <div style={{ position: 'relative' }}>
          {movable.map((category, index) => {
            const lifted = drag?.index === index
            return (
              <div
                key={category.id}
                style={{
                  ...styles.row,
                  ...(lifted ? styles.lifted : null),
                  transform: lifted ? `translateY(${drag.offset}px)` : undefined,
                  opacity: lifted ? 0.9 : 1,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${category.name}, ${index + 2}. sırada — sürükleyerek ya da ok tuşlarıyla taşı`}
                  title="Basılı tutup yukarı aşağı sürükleyerek sırasını değiştir"
                  onPointerDown={(e) => startDrag(e, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' && index > 0) move(index, index - 1)
                    if (e.key === 'ArrowDown' && index < movable.length - 1) move(index, index + 1)
                  }}
                  style={styles.handle}
                >
                  <Icon name="reorder-two" size={20} color={lifted ? notebook.graphite : PLACEHOLDER} />
                </div>
                <input
                  value={drafts[category.id] ?? category.name}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [category.id]: e.target.value }))}
                  onBlur={() => commitRename(category)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  maxLength={MAX_CATEGORY_NAME}
                  aria-label={`${category.name} kategorisinin adı`}
                  style={{ ...styles.hand, ...styles.name, ...styles.input }}
                />
                <CountText count={counts.get(category.id) ?? 0} />
                <button
                  type="button"
                  onClick={() => setConfirming(category)}
                  aria-label={`${category.name} kategorisini sil`}
                  className="lib-paper-icon"
                  style={styles.icon}
                >
                  <Icon name="trash-outline" size={20} color={notebook.graphite} />
                </button>
              </div>
            )
          })}
          <div style={{ ...styles.dropLine, opacity: dropVisible ? 1 : 0, top: dropTop - 1.5 }} />
        </div>
        <div style={styles.row}>
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              if (error) setError(null)
            }}
            // Enter'la eklendikten sonra yazı alanı açık kalır, ardından bir başkası yazılabilir
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="yeni kategori…"
            maxLength={MAX_CATEGORY_NAME}
            aria-label="Yeni kategorinin adı"
            className="lib-hand-input"
            style={{ ...styles.hand, ...styles.name, ...styles.input }}
          />
          <button
            type="button"
            onClick={add}
            disabled={cleanCategoryName(newName) === ''}
            aria-label="Kategoriyi ekle"
            className="lib-paper-icon"
            style={{ ...styles.icon, ...(cleanCategoryName(newName) === '' ? styles.disabled : null) }}
          >
            <Icon name="add-circle-outline" size={24} color={colors.accent} />
          </button>
        </div>
      </div>
    </TornPaperMenu>
  )
}

function CountText({ count }) {
  return <div style={{ ...styles.hand, ...styles.count }}>{(count > 0 ? String(count) : 'boş') + HAND_TAIL}</div>
}

const styles = {
  // Satırlar kâğıdın mavi çizgilerine yazılır
  row: {
    position: 'relative',
    height: PAPER_LINE,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingLeft: PAPER_MARGIN + 12,
    paddingRight: 10,
    borderTop: `1px solid ${notebook.rule}`,
  },
  // Sürüklenen satır kâğıttan kaldırılmış gibi: altındaki satırları örter, gölgesi düşer
  lifted: {
    zIndex: 20,
    backgroundColor: notebook.paper,
    boxShadow: '0 3px 6px rgba(59, 47, 26, 0.22)',
  },
  // Tutamaç kırmızı çizginin solundaki kenar boşluğunu kaplar
  handle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: PAPER_MARGIN,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    touchAction: 'none',
  },
  hand: {
    color: notebook.graphite,
  },
  name: {
    flex: 1,
    minWidth: 0,
    ...fonts.handBold,
    fontSize: NAME_SIZE,
    lineHeight: 1.15,
    paddingBottom: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fixedName: {},
  input: {
    margin: 0,
    padding: '0 0 2px',
    border: 0,
    outline: 'none',
    background: 'transparent',
  },
  count: {
    ...fonts.hand,
    fontSize: COUNT_SIZE,
    lineHeight: 1.2,
    paddingBottom: 6,
  },
  icon: {
    width: 34,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
  },
  disabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  // Bırakılınca kategorinin gireceği yeri gösteren kurşun kalem çizgisi
  dropLine: {
    position: 'absolute',
    left: PAPER_MARGIN + 6,
    right: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: notebook.graphite,
    pointerEvents: 'none',
  },
}
