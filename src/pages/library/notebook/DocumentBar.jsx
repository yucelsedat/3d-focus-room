// Seyir defteri: components/notebook/DocumentBar.tsx — PDF sayfasının alt çubuğu: biçimli yapıştır,
// kalem rengi, fosforlu kalem, başlık, kalın, italik, liste, görev kutusu, kod bloğu, sesle yazma ve
// ek. Düğmeler imlecin olduğu yazıya (seçiliyse seçime) uygulanır; basınca yazının odağı ve seçimi
// gitmez.
import { colors, docPage, fonts, highlightFill, highlighterOf, inkOf } from '../theme.js'

export const BAR_HEIGHT = 46

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

// Ionicons karşılıkları (21 px)
const ICONS = {
  'clipboard-outline': (
    <g {...STROKE}>
      <path d="M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="3.5" rx="1" />
    </g>
  ),
  marker: (
    <g {...STROKE}>
      <path d="M14.5 4.5l5 5-7.5 7.5-5-5z" />
      <path d="M7 12l-2.5 6.5 1 1L12 17" />
      <path d="M4 21h6" />
    </g>
  ),
  list: (
    <g {...STROKE}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="1" fill="currentColor" />
      <circle cx="4.75" cy="12" r="1" fill="currentColor" />
      <circle cx="4.75" cy="17.5" r="1" fill="currentColor" />
    </g>
  ),
  'checkbox-outline': (
    <g {...STROKE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </g>
  ),
  'code-slash': (
    <g {...STROKE}>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />
    </g>
  ),
  'mic-outline': (
    <g {...STROKE}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </g>
  ),
  mic: (
    <g>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path {...STROKE} d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </g>
  ),
  attach: (
    <g {...STROKE}>
      <path d="M16.5 7.5l-7.6 7.6a2 2 0 0 0 2.8 2.8l8.3-8.3a4 4 0 0 0-5.7-5.7l-8.6 8.6a6 6 0 0 0 8.5 8.5L19.5 15" />
    </g>
  ),
}

function Icon({ name, color }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" aria-hidden="true" style={{ color: color ?? docPage.ink, display: 'block' }}>
      {ICONS[name]}
    </svg>
  )
}

export function DocumentBar({
  listening,
  pen,
  onSwatchPress,
  onHighlighterPress,
  onPaste,
  onHeading,
  onBold,
  onItalic,
  onBullet,
  onTask,
  onCode,
  onMicPress,
  onClipPress,
  notice,
}) {
  return (
    <div style={styles.bar}>
      {notice !== null && (
        <div style={styles.notice} role="status">
          <span style={styles.noticeText}>{notice}</span>
        </div>
      )}
      <div className="nb-tool-row" style={styles.row}>
        <Tool label="Biçimli yapıştır" onPress={onPaste} accent>
          <Icon name="clipboard-outline" color={colors.accent} />
        </Tool>
        <Tool label="Kalem rengi" onPress={onSwatchPress}>
          <span
            style={{
              ...styles.swatch,
              backgroundColor: pen.active ? highlighterOf(pen.color).color : inkOf(pen.ink).color,
            }}
          />
        </Tool>
        <Tool
          label={pen.active ? 'Fosforlu kalemi bırak' : 'Fosforlu kalem'}
          onPress={onHighlighterPress}
          selected={pen.active}
          tint={pen.active ? highlightFill(pen.color, 0.35) : undefined}
        >
          <Icon name="marker" />
        </Tool>
        <Tool label="Başlık" onPress={onHeading}>
          <span style={{ ...styles.glyph, ...fonts.displayBold }}>H</span>
        </Tool>
        <Tool label="Kalın" onPress={onBold}>
          <span style={{ ...styles.glyph, ...fonts.bodyBold }}>B</span>
        </Tool>
        <Tool label="İtalik" onPress={onItalic}>
          <span style={{ ...styles.glyph, ...fonts.docItalic, fontSize: 20 }}>I</span>
        </Tool>
        <Tool label="Madde işaretli liste" onPress={onBullet}>
          <Icon name="list" />
        </Tool>
        <Tool label="Görev kutusu" onPress={onTask}>
          <Icon name="checkbox-outline" />
        </Tool>
        <Tool label="Kod bloğu" onPress={onCode}>
          <Icon name="code-slash" />
        </Tool>
        <Tool label={listening ? 'Dinlemeyi durdur' : 'Sesle yaz'} onPress={onMicPress}>
          <Icon name={listening ? 'mic' : 'mic-outline'} color={listening ? colors.accent : undefined} />
        </Tool>
        <Tool label="Ek ekle" onPress={onClipPress}>
          <Icon name="attach" />
        </Tool>
      </div>
    </div>
  )
}

function Tool({ label, onPress, disabled, accent, selected, tint, children }) {
  return (
    <button
      type="button"
      // Basınca yazının odağı ve seçimi yerinde kalsın (mobilde keyboardShouldPersistTaps)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className="nb-tool"
      style={{
        ...styles.tool,
        ...(accent ? styles.toolAccent : null),
        ...(tint !== undefined ? { backgroundColor: tint } : null),
        ...(disabled ? styles.toolDisabled : null),
      }}
    >
      {children}
    </button>
  )
}

const styles = {
  bar: {
    position: 'relative',
    flexShrink: 0,
    backgroundColor: '#F6F5F2',
    borderTop: '1px solid rgba(36, 41, 47, 0.18)',
  },
  row: {
    height: BAR_HEIGHT,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    gap: 2,
    padding: '0 6px',
    overflowX: 'auto',
  },
  tool: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    border: 0,
    backgroundColor: 'transparent',
    color: docPage.ink,
    cursor: 'pointer',
  },
  toolAccent: {
    backgroundColor: 'rgba(200, 85, 61, 0.1)',
  },
  toolDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    border: '1px solid rgba(36, 41, 47, 0.35)',
  },
  glyph: {
    color: docPage.ink,
    fontSize: 19,
    lineHeight: '22px',
  },
  notice: {
    position: 'absolute',
    bottom: BAR_HEIGHT + 8,
    left: 16,
    right: 16,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
  noticeText: {
    padding: '8px 14px',
    borderRadius: 10,
    backgroundColor: 'rgba(36, 41, 47, 0.92)',
    color: '#FFFFFF',
    ...fonts.docBody,
    fontSize: 13,
    textAlign: 'center',
  },
}
