import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/app.css'
import './styles/components.css'
import './styles/finish.css'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('TVA: #root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
