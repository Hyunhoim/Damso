import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { EmbedBoundary } from './EmbedBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbedBoundary><App /></EmbedBoundary>
  </StrictMode>,
)
