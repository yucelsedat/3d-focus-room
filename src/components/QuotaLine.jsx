// Aşama 8 — session tile'larında kota görünürlüğü.
//
// Sunucu her `result` olayına `quota` (server/quotaLedger.js tur kaydı) iliştirir.
// Bu satır, eski "ödenen ≈" satırının yerini alır: o satır API fiyatına göre
// kurulmuştu ve çıktı token'larını (kotanın en pahalı türü) hiç saymıyordu.
//
// Değerler TAHMİN: Ultra planın haftalık sayacının yüzdesi, üçüncü taraf ağırlıklarla
// (Max ≈ ×2, Pro ≈ ×10). Amaç kesin fatura değil, turlar ve modeller arası kıyas.

import { fmtQuota } from '../utils/quotaFormat'

const TITLE =
  'Tahmini kota: Ultra planın haftalık sayacının yüzdesi (Max ≈ ×2, Pro ≈ ×10). ' +
  'Üçüncü taraf ağırlıklar (atlas-ade); kesin değil, karşılaştırma için. ' +
  'Çıktı token\'ı kotanın en pahalı türüdür. ❄ soğuk = önbellek yeniden yazıldı (uzun ara, yeni süreç).'

export default function QuotaLine({ turn, session }) {
  if (!turn) return null
  const p = turn.points || 0
  const color = p < 0.002 ? '#4ade80' : p < 0.01 ? '#fbbf24' : '#f87171'
  return (
    <div
      title={TITLE}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}
    >
      <span style={{ color }}>
        bu tur %{fmtQuota(p)}
        {turn.cold ? <span style={{ color: '#93c5fd' }}> · ❄ soğuk</span> : <span style={{ color: '#4a6a8a' }}> · sıcak</span>}
      </span>
      <span style={{ color: '#7a9ac0' }}>
        oturum %{fmtQuota(session)}
        {turn.family ? <span style={{ color: '#4a6a8a' }}> · {turn.family}</span> : null}
      </span>
    </div>
  )
}
