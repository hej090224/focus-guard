import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BlockedApp } from './BlockedApp'
import './blocked.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BlockedApp />
  </StrictMode>,
)
