import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startTheme } from './lib/theme'

const stopTheme = startTheme()
if (import.meta.hot) import.meta.hot.dispose(stopTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
