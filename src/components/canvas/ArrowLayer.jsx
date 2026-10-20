// ── Çizgi / ok katmanı ───────────────────────────────────────────────────────
// Canvas tile ve Timeline ortak. SVG kutusu okların sınır kutusuna oturtulur:
// timeline'da dünya koordinatları on binlerce px ve negatif olabildiğinden sabit
// (0,0)-(8000,8000) kutu yetmez; kutu dışındaki çizimin hit-test'ine de güvenilmez.
import { stopEvt } from './canvasUtils'

const PAD = 60

export function ArrowLayer({
  items, selectedIds, hoveredArrowId, editMode, markerId, drawingLine, drawMode,
  onHover, onItemMouseDown, onDelete, onHandleMouseDown,
}) {
  const arrows = items.filter(it => it.type === 'arrow')
  const lines = drawingLine ? [...arrows, drawingLine] : arrows
  if (!lines.length) return null
  const xs = lines.flatMap(l => [l.x1, l.x2]), ys = lines.flatMap(l => [l.y1, l.y2])
  const left = Math.min(...xs) - PAD, top = Math.min(...ys) - PAD
  const width = Math.max(...xs) + PAD - left, height = Math.max(...ys) + PAD - top
  const markerIdPre = `${markerId}-pre`

  return (
    <svg style={{ position: 'absolute', left, top, width, height, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#e2e8f0" />
        </marker>
        <marker id={markerIdPre} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="rgba(96,165,250,0.9)" />
        </marker>
      </defs>
      <g transform={`translate(${-left} ${-top})`}>
        {arrows.map(item => {
          const isSel = selectedIds.has(item.id)
          const isHov = editMode && (hoveredArrowId === item.id || isSel)
          return (
            <g key={item.id} style={{ pointerEvents: editMode ? 'auto' : 'none' }}
              onMouseEnter={() => editMode && onHover(item.id)}
              onMouseLeave={() => onHover(null)}
              onMouseDown={e => { if (editMode) onItemMouseDown(e, item) }}
            >
              <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={28} style={{ cursor: 'move' }} />
              <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2}
                stroke={isHov ? '#60a5fa' : (item.color || '#e2e8f0')} strokeWidth={item.strokeWidth || 4}
                markerEnd={item.hasArrow ? `url(#${isHov ? markerIdPre : markerId})` : undefined} style={{ pointerEvents: 'none' }} />
              {isHov && (() => {
                const mx = (item.x1 + item.x2) / 2, my = (item.y1 + item.y2) / 2
                return (
                  <>
                    <foreignObject x={mx - 22} y={my - 22} width={44} height={44} style={{ overflow: 'visible' }}>
                      <button onMouseDown={stopEvt} onClick={() => onDelete(item.id)}
                        style={{ width: 44, height: 44, background: '#ef4444', border: '2px solid #fff', borderRadius: '50%', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'auto' }}>×</button>
                    </foreignObject>

                    <foreignObject x={item.x1 - 12} y={item.y1 - 12} width={24} height={24} style={{ overflow: 'visible' }}>
                      <div onMouseDown={e => onHandleMouseDown(e, item, 'start')}
                        style={{ width: 24, height: 24, background: '#fff', border: '3px solid #60a5fa', borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
                    </foreignObject>

                    <foreignObject x={item.x2 - 12} y={item.y2 - 12} width={24} height={24} style={{ overflow: 'visible' }}>
                      <div onMouseDown={e => onHandleMouseDown(e, item, 'end')}
                        style={{ width: 24, height: 24, background: '#fff', border: '3px solid #60a5fa', borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
                    </foreignObject>
                  </>
                )
              })()}
            </g>
          )
        })}
        {drawingLine && (
          <line x1={drawingLine.x1} y1={drawingLine.y1} x2={drawingLine.x2} y2={drawingLine.y2}
            stroke="rgba(96,165,250,0.85)" strokeWidth={4} strokeDasharray="10 5"
            markerEnd={drawMode === 'arrow' ? `url(#${markerIdPre})` : undefined} style={{ pointerEvents: 'none' }} />
        )}
      </g>
    </svg>
  )
}
