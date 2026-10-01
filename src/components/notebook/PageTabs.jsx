// Defterin üst kenarına yapıştırılmış kağıt bayrak sekmeler.
// Tıkla: sayfaya git · çift tıkla: adını değiştir · ×: sil (geri alınabilir) · +: yeni sayfa
import { useState } from 'react'
import { NB_LIMITS } from '../../utils/notebookModel'
import { HAND, PENCIL, TAB_COLORS } from './paperStyles'

// Taslak yalnızca düzenleme boyunca yaşar: her açılışta sayfa adıyla başlar
function TabInput({ title, onDone }) {
  const [draft, setDraft] = useState(title)
  return (
    <input
      autoFocus
      value={draft}
      maxLength={NB_LIMITS.title}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') {
          // Overlay'in Esc'i defteri kapatmasın
          e.preventDefault()
          e.stopPropagation()
          onDone(null)
        }
      }}
      aria-label="Sayfa adı"
      style={s.input}
    />
  )
}

export function PageTabs({ pages, activeId, editingId, onSelect, onAdd, onRename, onDelete, onEditStart, onEditEnd }) {
  return (
    <div style={s.strip} role="tablist" aria-label="Defter sayfaları">
      {pages.map((page, i) => {
        const active = page.id === activeId
        const tilt = ((page.seed % 7) - 3) * 0.45
        const editing = editingId === page.id
        return (
          <div
            key={page.id}
            style={{
              ...s.tab,
              background: TAB_COLORS[i % TAB_COLORS.length],
              transform: `translateY(${active ? -7 : 0}px) rotate(${tilt}deg)`,
              zIndex: active ? 2 : 1,
              filter: active ? 'none' : 'brightness(0.88) saturate(0.85)',
            }}
          >
            {editing ? (
              <TabInput
                title={page.title}
                onDone={(value) => {
                  if (value != null) onRename(page.id, value)
                  onEditEnd()
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="nb-tab"
                onClick={() => onSelect(page.id)}
                onDoubleClick={() => onEditStart(page.id)}
                title={`${page.title} — çift tıkla: yeniden adlandır`}
                style={s.tabBtn}
              >
                {page.title}
              </button>
            )}
            {active && !editing && pages.length > 1 && (
              <button
                type="button"
                className="nb-tab"
                onClick={() => onDelete(page.id)}
                aria-label={`${page.title} sayfasını sil`}
                title="Sayfayı sil (geri alınabilir)"
                style={s.del}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      {pages.length < NB_LIMITS.pages && (
        <button type="button" className="nb-tab" onClick={onAdd} aria-label="Yeni sayfa" title="Yeni sayfa" style={s.add}>+</button>
      )}
    </div>
  )
}

const s = {
  strip: {
    position: 'absolute',
    left: 64,
    right: 24,
    top: -40,
    height: 52,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    paddingTop: 9,
    boxSizing: 'border-box',
  },
  tab: {
    position: 'relative',
    flex: '0 1 auto',
    minWidth: 58,
    maxWidth: 160,
    height: 46,
    display: 'flex',
    alignItems: 'flex-start',
    borderRadius: '7px 9px 0 0',
    boxShadow: 'inset 0 -12px 12px -12px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.4)',
    transition: 'transform .18s ease, filter .18s ease',
  },
  tabBtn: {
    flex: '1 1 auto',
    minWidth: 0,
    height: 34,
    padding: '2px 14px 0',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontFamily: HAND,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: '30px',
    color: PENCIL,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  del: {
    flex: '0 0 auto',
    width: 22,
    height: 30,
    marginRight: 4,
    padding: 0,
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontFamily: HAND,
    fontSize: 24,
    lineHeight: '28px',
    color: 'rgba(44,44,52,0.55)',
  },
  input: {
    width: 124,
    height: 28,
    margin: '3px 8px 0',
    padding: '0 4px',
    border: 0,
    borderBottom: '1.5px dashed rgba(44,44,52,0.5)',
    background: 'rgba(255,255,255,0.35)',
    outline: 'none',
    fontFamily: HAND,
    fontSize: 22,
    fontWeight: 700,
    color: PENCIL,
  },
  add: {
    flex: '0 0 auto',
    width: 40,
    height: 36,
    border: '1.5px dashed rgba(247,242,228,0.55)',
    borderBottom: 0,
    borderRadius: '8px 8px 0 0',
    background: 'rgba(247,242,228,0.08)',
    cursor: 'pointer',
    fontFamily: HAND,
    fontSize: 28,
    lineHeight: '30px',
    color: 'rgba(247,242,228,0.8)',
  },
}
