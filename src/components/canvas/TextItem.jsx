// ── Metin kutusu (görünüm + düzenleyici) ─────────────────────────────────────
// Canvas tile ve Timeline ortak. Kutu içeriğiyle uzar, A4 yüksekliğinde durur;
// fazlası kutunun içinde scroll edilir (data-cv-scroll → wheel pan'a dönüşmez).
import { parseMd } from '../../utils/markdownRender'
import { pasteRichTextAsMarkdown } from '../../utils/richTextToMarkdown'
import { a4MaxH } from './canvasUtils'

// defaultBg: bgColor tanımsızken arka plan (düzenleme modunda yarı saydam, duvarda şeffaf)
export function TextItemBox({ item, defaultBg, style }) {
  const st = {
    width: '100%', height: 'auto',
    minHeight: Math.min(item.h || 60, a4MaxH(item.w)), maxHeight: a4MaxH(item.w),
    overflowX: 'hidden', overflowY: 'auto',
    background: item.bgColor !== undefined ? item.bgColor : defaultBg,
    borderRadius: 4, color: item.color || '#e2e8f0', fontSize: item.fontSize || 30,
    padding: 14, boxSizing: 'border-box', wordBreak: 'break-word', userSelect: 'none',
    ...style,
  }
  if (item.markdown && item.content) {
    return <div className="cvmd cv-textbox" data-cv-scroll="1" style={st} dangerouslySetInnerHTML={{ __html: parseMd(item.content) }} />
  }
  return <div className="cv-textbox" data-cv-scroll="1" style={{ ...st, whiteSpace: 'pre-wrap' }}>{item.content}</div>
}

// onHeight(h, { initial }) — initial: yeni (h=0) kutunun ilk ölçümü
// onCommit(value, h) — blur'da kalıcı kayıt; onMarkdown() — biçimli yapıştırma kutuyu markdown'a geçirir
export function TextItemEditor({ item, onHeight, onCommit, onMarkdown }) {
  const maxH = a4MaxH(item.w)
  // height:auto ile ölçüm yaparken textarea bir an çöküyor → tarayıcı scrollTop'u
  // 0'a kırpıyordu (yazarken imleç birinci satıra atlıyordu). Ölçüm öncesi scroll
  // konumunu alıp hemen geri koyuyoruz; senkron olduğu için ekrana yansımıyor.
  const fit = el => {
    const prevTop = el.scrollTop
    el.style.height = 'auto'
    const full = el.scrollHeight
    const newH = Math.min(full, maxH)
    el.style.height = newH + 'px'
    el.style.overflowY = full > maxH ? 'auto' : 'hidden'
    if (el.scrollTop !== prevTop) el.scrollTop = prevTop
    return newH
  }
  const autoH = el => {
    if (!el) return
    const newH = fit(el)
    if (item.h === 0 && newH > 0) onHeight(newH, { initial: true })
  }
  return (
    <textarea autoFocus defaultValue={item.content}
      ref={autoH}
      data-cv-scroll="1"
      placeholder="Metin yazın…"
      style={{ width: '100%', height: 'auto', minHeight: 60, maxHeight: maxH, background: 'rgba(0,0,0,0.6)', border: '1px solid #60a5fa', borderRadius: 4, color: '#fff', fontSize: item.fontSize || 30, padding: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
      onInput={e => onHeight(fit(e.target), { initial: false })}
      onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
      // biçimli metin → Markdown olarak imlece eklenir; kutu markdown moduna geçer (yoksa sözdizimi ham görünür)
      onPaste={e => { if (pasteRichTextAsMarkdown(e) && !item.markdown) onMarkdown() }}
      onBlur={e => onCommit(e.target.value, fit(e.target))}
    />
  )
}
