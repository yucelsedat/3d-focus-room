// Seyir defteri: components/notebook/PageFilterMenu.tsx — defterde hangi tür sayfaların
// çevrileceği, yırtık kâğıda el çizimi kutularla işaretlenir.
import { useState } from 'react'

import { TornPaperMenu } from '../TornPaperMenu.jsx'

const LABELS = {
  'month-goals': 'Ay hedefleri',
  goals: 'Hafta hedefleri',
  day: 'Haftanın günleri',
  review: 'Hafta değerlendirmeleri',
  'month-review': 'Ay değerlendirmeleri',
  habits: 'Alışkanlık takibi',
  page: 'Sayfalar',
}

// available: defterde bulunan sayfa türleri; kinds: filtrelenen türler (kapalıysa null);
// onApply: seçilen türlerde yazılı sayfa yoksa false döner ve menü açık kalır
export function PageFilterMenu({ visible, available, kinds, onApply, onClose }) {
  const [checked, setChecked] = useState(kinds ?? [])
  const [empty, setEmpty] = useState(false)

  // Her açılışta kutular o anki filtreden başlar
  const [wasVisible, setWasVisible] = useState(visible)
  if (wasVisible !== visible) {
    setWasVisible(visible)
    if (visible) {
      setChecked(kinds ?? [])
      setEmpty(false)
    }
  }

  function toggle(kind) {
    setEmpty(false)
    setChecked((prev) => available.filter((k) => (k === kind ? !prev.includes(k) : prev.includes(k))))
  }

  // Hiçbir kutu işaretlenmemişse filtre kalkar
  async function apply() {
    if (await onApply(checked.length > 0 ? checked : null)) onClose()
    else setEmpty(true)
  }

  const options = [
    ...available.map((kind) => ({ label: LABELS[kind], checked: checked.includes(kind), onPress: () => toggle(kind) })),
    { label: 'Filtrele', onPress: apply },
    ...(kinds
      ? [
          {
            label: 'Filtreyi kaldır',
            onPress: () => {
              onApply(null)
              onClose()
            },
          },
        ]
      : []),
  ]

  return (
    <TornPaperMenu
      visible={visible}
      title="Sayfaları filtrele"
      message={empty ? 'Seçilen sayfalarda henüz yazı yok.' : 'Görünecek sayfaları işaretle'}
      options={options}
      onClose={onClose}
    />
  )
}
