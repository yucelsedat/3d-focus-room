import React from 'react'
import { useStore } from '../store/useStore'

export function Crosshair() {
  const hoveredTile = useStore((state) => state.hoveredTile)

  return (
    <div style={styles.wrapper}>
      <div style={styles.crosshair}>+</div>
      {hoveredTile && (
        <div style={styles.hint}>
          <span style={styles.key}>P</span>
          <span style={styles.hintText}>Düzenle</span>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 2147483647,
  },
  crosshair: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '22px',
    fontWeight: '300',
    fontFamily: 'monospace',
    lineHeight: 1,
    textShadow: '0 0 6px rgba(0,242,255,0.5)',
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '4px 10px',
    borderRadius: '6px',
    marginTop: '4px',
  },
  key: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    padding: '1px 6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#00f2ff',
    fontWeight: '700',
  },
  hintText: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'system-ui, sans-serif',
  },
}
