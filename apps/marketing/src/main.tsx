import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { mount as mountWidget } from 'widget'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const widgetShellId = 'shieldbase-widget-shell'
const widgetHostId = 'shieldbase-widget-host'
const widgetToggleId = 'shieldbase-widget-toggle'

const existingShell = document.getElementById(widgetShellId)
const existingToggle = document.getElementById(widgetToggleId)

if (!existingShell && !existingToggle) {
  const shell = document.createElement('section')
  shell.id = widgetShellId
  shell.className = 'shieldbase-widget-shell'
  shell.hidden = true
  shell.setAttribute('aria-label', 'ShieldBase support chat')

  const minimizeButton = document.createElement('button')
  minimizeButton.type = 'button'
  minimizeButton.className = 'shieldbase-widget-minimize'
  minimizeButton.textContent = '✖︎'
  minimizeButton.title = 'Minimize chat'
  minimizeButton.setAttribute('aria-label', 'Minimize support chat')

  const host = document.createElement('div')
  host.id = widgetHostId
  host.className = 'shieldbase-widget-host'

  shell.append(minimizeButton, host)
  document.body.appendChild(shell)

  const toggleButton = document.createElement('button')
  toggleButton.id = widgetToggleId
  toggleButton.type = 'button'
  toggleButton.className = 'shieldbase-widget-toggle'
  toggleButton.setAttribute('aria-controls', widgetShellId)
  toggleButton.setAttribute('aria-expanded', 'false')
  toggleButton.setAttribute('aria-label', 'Open support chat')

  const toggleBadge = document.createElement('span')
  toggleBadge.className = 'shieldbase-widget-toggle-badge'
  toggleBadge.setAttribute('aria-hidden', 'true')
  const toggleIcon = document.createElement('img')
  toggleIcon.src = '/favicon.svg'
  toggleIcon.alt = ''
  toggleIcon.className = 'shieldbase-widget-toggle-icon'
  toggleBadge.appendChild(toggleIcon)

  const toggleText = document.createElement('span')
  toggleText.textContent = 'Chat with ShieldBase'

  toggleButton.append(toggleBadge, toggleText)
  document.body.appendChild(toggleButton)

  const openWidget = () => {
    shell.hidden = false
    toggleButton.hidden = true
    toggleButton.setAttribute('aria-expanded', 'true')
    minimizeButton.focus()
  }

  const closeWidget = () => {
    shell.hidden = true
    toggleButton.hidden = false
    toggleButton.setAttribute('aria-expanded', 'false')
    toggleButton.focus()
  }

  toggleButton.addEventListener('click', openWidget)
  minimizeButton.addEventListener('click', closeWidget)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shell.hidden) {
      closeWidget()
    }
  })

  mountWidget(host, {
    apiBaseUrl: import.meta.env.VITE_SERVER_URL,
    brandIconUrl: '/favicon.svg',
  })
}

