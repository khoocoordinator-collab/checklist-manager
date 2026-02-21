import { useState, useEffect, lazy, Suspense } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import './App.css'

const ChecklistForm = lazy(() => import('./components/ChecklistForm'))
const SupervisorDashboard = lazy(() => import('./components/SupervisorDashboard'))

function App() {
  const [team, setTeam] = useState(null)
  const [role, setRole] = useState(null)
  const [view, setView] = useState('dashboard')
  const [activeChecklist, setActiveChecklist] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const savedTeam = localStorage.getItem('team')
    const savedRole = localStorage.getItem('role')
    if (savedTeam && savedRole) {
      setTeam(JSON.parse(savedTeam))
      setRole(savedRole)
    }
  }, [])

  const handleLogin = (teamData, loginRole) => {
    setTeam(teamData)
    setRole(loginRole)
    localStorage.setItem('team', JSON.stringify(teamData))
    localStorage.setItem('role', loginRole)
  }

  const handleLogout = () => {
    setTeam(null)
    setRole(null)
    localStorage.removeItem('team')
    localStorage.removeItem('role')
  }

  const openChecklist = (checklist) => {
    setActiveChecklist(checklist)
    setView('checklist')
  }

  const backToDashboard = () => {
    setView('dashboard')
    setActiveChecklist(null)
  }

  if (!team || !role) {
    return <Login onLogin={handleLogin} />
  }

  const isSupervisor = role === 'supervisor'

  return (
    <div className="app">
      <header className="app-header">
        <h1>Checklist Manager</h1>
        <div className="header-actions">
          <span className="team-name">
            {isSupervisor ? '👑' : '👤'} {team.outlet?.name || 'Unknown Outlet'} — {team.name}
          </span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      <Suspense fallback={<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'50vh',fontSize:'1.1rem',color:'#666'}}>Loading...</div>}>
        {isSupervisor ? (
          <SupervisorDashboard team={team} onLogout={handleLogout} />
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard
                team={team}
                onOpenChecklist={openChecklist}
                onPendingCountChange={setPendingCount}
              />
            )}

            {view === 'checklist' && (
              <ChecklistForm
                checklist={activeChecklist}
                team={team}
                onBack={backToDashboard}
              />
            )}
          </>
        )}
      </Suspense>
    </div>
  )
}

export default App
