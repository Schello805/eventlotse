import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.update())
      .catch(() => undefined)
  })

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('eventlotse-sw-reloaded') === '1') return
    sessionStorage.setItem('eventlotse-sw-reloaded', '1')
    window.location.reload()
  })
}
