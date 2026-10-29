import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startTheme } from './lib/theme'
import { startLocalSync } from './lib/sheetbase'

const stopTheme = startTheme()
const stopSync = startLocalSync()
if (import.meta.hot) import.meta.hot.dispose(() => { stopTheme(); stopSync() })
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
