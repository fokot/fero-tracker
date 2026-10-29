import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startTheme } from './lib/theme'
import { startLocalSync } from './lib/sheetbase'
import { startPwa } from './lib/pwa'

const stopTheme = startTheme()
const stopSync = startLocalSync()
const stopPwa = startPwa()
if (import.meta.hot) import.meta.hot.dispose(() => { stopTheme(); stopSync(); stopPwa() })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
