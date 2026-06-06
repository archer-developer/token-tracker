import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './app/i18n'
import App from './app/App'
import { BrowserWarning } from '@/shared/components/BrowserWarning'
import { checkBrowser } from '@/shared/utils/browserCheck'

const browserCheck = checkBrowser()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <BrowserWarning result={browserCheck} />
      {!browserCheck.critical && <App />}
    </BrowserRouter>
  </StrictMode>,
)
