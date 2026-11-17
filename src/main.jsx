import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import WorldSelect from './pages/WorldSelect.jsx'
import TimelineRoute from './pages/TimelineRoute.jsx'
import CanvasRoute from './pages/CanvasRoute.jsx'
import LibraryPage from './pages/library/LibraryPage.jsx'
import { EditNotebookPage, NewNotebookPage } from './pages/library/NotebookForm.jsx'
import NotebookScreen from './pages/library/NotebookScreen.jsx'
import FavoritesPage from './pages/library/FavoritesPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Ana sayfa: Seyir Defteri kitaplığı (all-books). Dünya seçimi /worlds'te. */}
        <Route path="/" element={<LibraryPage />} />
        <Route path="/new-notebook" element={<NewNotebookPage />} />
        <Route path="/edit-notebook/:id" element={<EditNotebookPage />} />
        <Route path="/notebook" element={<NotebookScreen />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/worlds" element={<WorldSelect />} />
        <Route path="/game" element={<App />} />
        <Route path="/timeline" element={<TimelineRoute />} />
        <Route path="/canvas" element={<CanvasRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
