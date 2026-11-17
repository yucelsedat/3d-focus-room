// Mobilde @expo/vector-icons (Ionicons) ile çizilen simgelerin el yapımı SVG karşılıkları.
// Hepsi 24'lük ızgarada, currentColor ile boyanır.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const PATHS = {
  'arrow-back': <path {...STROKE} strokeWidth={2.2} d="M19 12H5M11 5l-7 7 7 7" />,
  add: <path {...STROKE} strokeWidth={2.4} d="M12 5v14M5 12h14" />,
  checkmark: <path {...STROKE} strokeWidth={2.4} d="M5 12.5l4.5 4.5L19 7.5" />,
  search: (
    <>
      <circle {...STROKE} strokeWidth={2.2} cx="10.5" cy="10.5" r="6.5" />
      <path {...STROKE} strokeWidth={2.2} d="M15.5 15.5L21 21" />
    </>
  ),
  'close-circle': (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path stroke="#14213D" strokeWidth={2} strokeLinecap="round" d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  'create-outline': (
    <g {...STROKE}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </g>
  ),
  'pricetags-outline': (
    <g {...STROKE}>
      <path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7l8.5 8.5-8 8L3 11.5z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
      <path d="M14 3l8 8-6.5 6.5" />
    </g>
  ),
  'chevron-back': <path {...STROKE} strokeWidth={2.2} d="M15 5l-7 7 7 7" />,
  'chevron-forward': <path {...STROKE} strokeWidth={2.2} d="M9 5l7 7-7 7" />,
  'lock-closed-outline': (
    <g {...STROKE}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </g>
  ),
  'add-circle-outline': (
    <g {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </g>
  ),
  'trash-outline': (
    <g {...STROKE}>
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l1 13h9l1-13M10.5 10.5v6M13.5 10.5v6" />
    </g>
  ),
  'reorder-two': <path {...STROKE} strokeWidth={2.2} d="M5 9.5h14M5 14.5h14" />,
  checkbox: (
    <g>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#14213D" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  'square-outline': <rect {...STROKE} x="3.5" y="3.5" width="17" height="17" rx="3" />,
  // Alt gezinme: dolu (seçili) ve çizgi (seçili değil) halleri
  library: (
    <g fill="currentColor">
      <rect x="3" y="3" width="4" height="18" rx="1" />
      <rect x="8.5" y="5" width="4" height="16" rx="1" />
      <path d="M13.6 6.4l3.8-1.2 4.4 14.3-3.8 1.2z" />
    </g>
  ),
  'library-outline': (
    <g {...STROKE}>
      <rect x="3.5" y="3.5" width="4" height="17" rx="1" />
      <rect x="9" y="5.5" width="4" height="15" rx="1" />
      <path d="M14.3 6.6l3.4-1.1 4 13.4-3.4 1.1z" />
    </g>
  ),
  calendar: (
    <g>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" fill="currentColor" />
      <path d="M3 9.5h18" stroke="#14213D" strokeWidth={1.6} />
      <path d="M7.5 2.5v4M16.5 2.5v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </g>
  ),
  'calendar-outline': (
    <g {...STROKE}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M7.5 3v4M16.5 3v4" />
    </g>
  ),
  bookmark: <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />,
  'bookmark-outline': <path {...STROKE} d="M6.5 3.5h11v16.5L12 16.5 6.5 20z" />,
  book: (
    <g fill="currentColor">
      <path d="M3 5.5C5.5 4 8.5 4 11.2 5.6V20c-2.7-1.5-5.7-1.5-8.2 0z" />
      <path d="M21 5.5C18.5 4 15.5 4 12.8 5.6V20c2.7-1.5 5.7-1.5 8.2 0z" />
    </g>
  ),
  'book-outline': (
    <g {...STROKE}>
      <path d="M3.5 6C6 4.6 9 4.6 12 6.4V20c-3-1.6-6-1.6-8.5-.2z" />
      <path d="M20.5 6C18 4.6 15 4.6 12 6.4V20c3-1.6 6-1.6 8.5-.2z" />
    </g>
  ),
  // Kitaplıktan 3B odalara (eski ana sayfa)
  'cube-outline': (
    <g {...STROKE}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </g>
  ),
}

export function Icon({ name, size = 24, color = 'currentColor', style, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ color, flexShrink: 0, display: 'block', ...style }}
      className={className}
    >
      {PATHS[name] ?? null}
    </svg>
  )
}

// Panodaki not için el çizimi yapışkan not simgesi (mobil: board/StickyNoteIcon)
export function StickyNoteIcon({ size = 24, color = 'currentColor', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ color, display: 'block' }}>
      <path
        d="M4.5 4.5h15v10l-5 5h-10z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M14.5 19.5v-5h5" fill="none" stroke={filled ? '#14213D' : 'currentColor'} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}
