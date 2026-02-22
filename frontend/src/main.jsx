import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const ReportsApp = lazy(() => import('./reports/ReportsApp.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/reports/*" element={
          <Suspense fallback={<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',fontSize:'1.1rem',color:'#64748b'}}>Loading reports...</div>}>
            <ReportsApp />
          </Suspense>
        } />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
