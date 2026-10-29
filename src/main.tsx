import { PwaUpdateNotice } from './components/PwaUpdateNotice'
import { subscribeLocale, startLocale } from './i18n/locale';
import { t } from './i18n/messages'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startTheme } from './lib/theme'
import { startLocalSync } from './lib/sheetbase'
import { startPwa } from './lib/pwa'

const stopLocale = startLocale()
const updateMetadata = () => document.querySelector('meta[name="description"]')?.setAttribute('content', t('login.description'))
updateMetadata()
const stopMetadata = subscribeLocale(updateMetadata)
const stopTheme = startTheme()
const stopSync = startLocalSync()
const stopPwa = startPwa()
if (import.meta.hot) import.meta.hot.dispose(() => { stopTheme(); stopSync(); stopPwa(); stopLocale(); stopMetadata() })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PwaUpdateNotice />
    <App />
  </React.StrictMode>,
)
