import { Suspense, lazy } from 'react'

// Canvas sayfası ayrı chunk: oyun ve oda seçimi açılışında indirilmez
const CanvasPage = lazy(() => import('./CanvasPage.jsx'))

export default function CanvasRoute() {
  return <Suspense fallback={null}><CanvasPage /></Suspense>
}
