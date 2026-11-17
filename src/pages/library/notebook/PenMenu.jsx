// Seyir defteri: components/notebook/PenMenu.tsx — kalem rengi: yırtık kâğıda yazılmış "A" harfleri.
// Üstte her biri başka renk kalemle yazılmış, altta her birinin üstünden başka renk fosforlu kalem
// geçmiş. Yazı kalemi seçilince fosforlu kalem bırakılır; fosforlu kalem seçilince o renkle açılır.
import { TornPaperMenu } from '../TornPaperMenu.jsx'
import { fonts, HAND_TAIL, highlighters, inks, notebook } from '../theme.js'
import { HandDrawing } from './HandIcon.jsx'
import { HighlightStroke } from './HighlightStroke.jsx'

const SIZE = 56
const LETTER_SIZE = 42

// pen: { ink, active, color }
export function PenMenu({ visible, pen, onChange, onClose }) {
  function choose(next) {
    onChange(next)
    onClose()
  }

  return (
    <TornPaperMenu visible={visible} title="Kalem rengi" onClose={onClose}>
      <div style={styles.section}>{'Yazı kalemi' + HAND_TAIL}</div>
      <div style={styles.samples} role="radiogroup" aria-label="Yazı kalemi">
        {inks.map((ink) => (
          <Sample
            key={ink.key}
            name={ink.name}
            letterColor={ink.color}
            selected={pen.ink === ink.key}
            onPress={() => choose({ ...pen, ink: ink.key, active: false })}
          />
        ))}
      </div>

      <div style={styles.section}>{'Fosforlu kalem' + HAND_TAIL}</div>
      <div style={styles.samples} role="radiogroup" aria-label="Fosforlu kalem">
        {highlighters.map((highlighter, i) => (
          <Sample
            key={highlighter.key}
            name={`${highlighter.name} fosforlu kalem`}
            strokeColor={highlighter.color}
            seed={i * 31 + 7}
            selected={pen.active && pen.color === highlighter.key}
            onPress={() => choose({ ...pen, active: true, color: highlighter.key })}
          />
        ))}
      </div>
    </TornPaperMenu>
  )
}

// Seçili örneğin çevresine elle halka çizilir
function Sample({ name, letterColor = notebook.graphite, strokeColor, seed = 0, selected, onPress }) {
  return (
    <button
      type="button"
      onClick={onPress}
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      className="lib-paper-icon"
      style={styles.sample}
    >
      {strokeColor && (
        <HighlightStroke width={38} height={24} color={strokeColor} strength={0.6} seed={seed} style={styles.stroke} />
      )}
      <span style={{ ...styles.letter, color: letterColor }}>{'A' + HAND_TAIL}</span>
      {selected && (
        <span style={styles.ring}>
          <HandDrawing shape="ring" size={SIZE} />
        </span>
      )}
    </button>
  )
}

const styles = {
  // Kâğıdın kırmızı kenar çizgisinin sağından başlar (bkz. TornPaperMenu)
  section: {
    marginLeft: 42,
    ...fonts.hand,
    fontSize: 20,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  samples: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    padding: '0 12px 6px 42px',
  },
  sample: {
    position: 'relative',
    width: SIZE,
    height: SIZE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: SIZE / 2,
    background: 'transparent',
    cursor: 'pointer',
  },
  // Harfin alt yarısından geçen kalem
  stroke: {
    top: 26,
    left: (SIZE - 38) / 2,
  },
  letter: {
    position: 'relative',
    ...fonts.handBold,
    fontSize: LETTER_SIZE,
    lineHeight: '50px',
  },
  ring: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
}
