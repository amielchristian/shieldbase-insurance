import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ShieldBaseWidget } from './components/shieldbase-widget'
import './widget.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ height: '100%', display: 'flex' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <div style={{ height: 'min(720px, calc(100vh - 32px))' }}>
          <ShieldBaseWidget apiBaseUrl={import.meta.env.VITE_SERVER_URL} />
        </div>
      </div>
    </div>
  </StrictMode>,
)
