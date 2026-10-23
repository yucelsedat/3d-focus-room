import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import WorldSelect from './pages/WorldSelect.jsx'
import TimelineRoute from './pages/TimelineRoute.jsx'
import CanvasRoute from './pages/CanvasRoute.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorldSelect />} />
        <Route path="/game" element={<App />} />
        <Route path="/timeline" element={<TimelineRoute />} />
        <Route path="/canvas" element={<CanvasRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
