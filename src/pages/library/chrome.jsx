// Kitaplık ekranlarının ortak parçaları: kategori sekmeleri, alt gezinme çubuğu, "+" düğmesi
// (seyir defteri: CategoryTabs.tsx, BottomNav.tsx, AddButton.tsx).
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { Icon, StickyNoteIcon } from './icons.jsx'
import { getLastNotebook } from './state.js'
import { colors, fonts, type } from './theme.js'

// Kitaplığın başlığının altındaki sekmeler: her kategori kendi raflarını gösterir. Sekmeler yana
// kayar; ayar simgesi sağda sabit durur.
export function CategoryTabs({ categories, activeId, counts, onSelect, onManage }) {
  const scrollRef = useRef(null)
  const tabRefs = useRef(new Map())

  // Seçilen sekme görünür alanın ortasına kaydırılır
  useEffect(() => {
    const tab = tabRefs.current.get(activeId)
    const bar = scrollRef.current
    if (!tab || !bar) return
    const x = Math.max(0, tab.offsetLeft + tab.offsetWidth / 2 - bar.clientWidth / 2)
    bar.scrollTo({ left: x, behavior: 'smooth' })
  }, [activeId, categories])

  return (
    <div style={tabStyles.bar}>
      <div ref={scrollRef} className="lib-scroll-x" style={tabStyles.scroll} role="tablist">
        <div style={tabStyles.tabs}>
          {categories.map((category) => {
            const selected = category.id === activeId
            const count = counts.get(category.id) ?? 0
            return (
              <button
                type="button"
                key={category.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(category.id, el)
                  else tabRefs.current.delete(category.id)
                }}
                onClick={() => onSelect(category.id)}
                role="tab"
                aria-selected={selected}
                aria-label={`${category.name}, ${count} defter`}
                className="lib-press"
                style={tabStyles.tab}
              >
                <span style={{ ...tabStyles.tabText, ...(selected ? tabStyles.tabTextSelected : null) }}>
                  {category.name}
                </span>
                <span style={{ ...tabStyles.indicator, ...(selected ? tabStyles.indicatorOn : null) }} />
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onManage}
        aria-label="Kategorileri düzenle"
        title="Kategori ekle, adını değiştir ya da sil"
        className="lib-press"
        style={tabStyles.manage}
      >
        <Icon name="pricetags-outline" size={20} color={colors.onInk} />
      </button>
    </div>
  )
}

const tabStyles = {
  bar: {
    height: 44,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.ink,
    borderBottom: '1px solid rgba(244, 239, 230, 0.18)',
  },
  scroll: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  tabs: {
    display: 'flex',
    height: '100%',
    padding: '0 10px',
    gap: 4,
    width: 'max-content',
  },
  tab: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    border: 0,
    borderRadius: 10,
    background: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabText: {
    ...fonts.bodyThin,
    fontSize: type.body,
    letterSpacing: 0.3,
    color: colors.onInk,
  },
  tabTextSelected: {
    ...fonts.bodyBold,
  },
  // Seçili sekmenin altında kapaktaki lastik bant gibi kiremit bir şerit
  indicator: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: 'transparent',
  },
  indicatorOn: {
    backgroundColor: colors.accent,
  },
  manage: {
    width: 48,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 0,
    borderLeft: '1px solid rgba(244, 239, 230, 0.18)',
    background: 'transparent',
    cursor: 'pointer',
  },
}

// Kitaplıkta yeni defter açan yuvarlak buton; alanın sağ alt köşesinde durur
export function AddButton({ label, hint, onPress }) {
  return (
    <button type="button" onClick={onPress} aria-label={label} title={hint} className="lib-fab" style={fabStyle}>
      <Icon name="add" size={30} color={colors.onInk} />
    </button>
  )
}

const fabStyle = {
  position: 'absolute',
  right: 20,
  bottom: 20,
  width: 60,
  height: 60,
  borderRadius: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  backgroundColor: colors.accent,
  boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.5)',
  cursor: 'pointer',
  zIndex: 5,
}

// Not sayfası dışındaki ekranların altındaki gezinme çubuğu. Pano, takvim ve ayraçlar sonraki
// fazlarda gelir (şimdilik kapalı). Defter, en son açılan defteri kaldığı sayfadan açar; rafta
// defter yoksa oluşturma ekranını.
export function BottomNav({ active, onReselect }) {
  const navigate = useNavigate()

  function goToLibrary() {
    if (active === 'library') onReselect?.()
    else navigate('/')
  }

  async function openLastNotebook() {
    const notebook = await getLastNotebook().catch(() => null)
    if (notebook) navigate(`/notebook?id=${notebook.id}`)
    else navigate('/new-notebook')
  }

  return (
    <nav style={navStyles.bar} aria-label="Gezinme">
      <NavItem icon="library" label="Kitaplık" hint="Defterlerin durduğu rafları göster" selected={active === 'library'} onPress={goToLibrary} />
      <NavItem icon="sticky" label="Pano" hint="Yakında" disabled />
      <NavItem icon="calendar" label="Takvim" hint="Yakında" disabled />
      <NavItem icon="bookmark" label="Ayraçlar" hint="Yakında" disabled />
      <NavItem icon="book" label="Defter" hint="En son açtığın defteri kaldığın sayfadan aç" onPress={openLastNotebook} />
    </nav>
  )
}

function NavItem({ icon, label, hint, selected = false, disabled = false, onPress }) {
  const dim = selected ? null : { opacity: disabled ? 0.3 : 0.55 }
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      role="tab"
      aria-selected={selected}
      aria-label={label}
      title={hint}
      className="lib-press"
      style={{ ...navStyles.item, cursor: disabled ? 'default' : 'pointer' }}
    >
      <span style={{ ...navStyles.indicator, ...(selected ? navStyles.indicatorOn : null) }} />
      <span style={dim}>
        {icon === 'sticky' ? (
          <StickyNoteIcon size={24} color={colors.onInk} filled={selected} />
        ) : (
          <Icon name={selected ? icon : `${icon}-outline`} size={24} color={colors.onInk} />
        )}
      </span>
      <span style={{ ...navStyles.label, ...(selected ? navStyles.labelOn : dim) }}>{label}</span>
    </button>
  )
}

const navStyles = {
  bar: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    padding: '0 8px 6px',
    backgroundColor: colors.ink,
  },
  // Geniş ekranda sekmeler ortada, telefondaki aralıklarla durur
  item: {
    flex: 1,
    minWidth: 0,
    maxWidth: 112,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '0 0 4px',
    border: 0,
    borderRadius: 12,
    background: 'transparent',
  },
  indicator: {
    width: 28,
    height: 3,
    marginBottom: 5,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  indicatorOn: {
    backgroundColor: colors.accent,
  },
  label: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 0.5,
    color: colors.onInk,
    whiteSpace: 'nowrap',
  },
  labelOn: {
    ...fonts.bodyBold,
  },
}
