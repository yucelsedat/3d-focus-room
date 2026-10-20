import { Suspense, lazy } from 'react'

// Timeline ayrı chunk: oyun ve oda seçimi açılışında indirilmez
const TimelinePage = lazy(() => import('./TimelinePage.jsx'))

export default function TimelineRoute() {
  return <Suspense fallback={null}><TimelinePage /></Suspense>
}
