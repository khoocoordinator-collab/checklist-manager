import { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ChecklistForm from './components/ChecklistForm'
import SupervisorDashboard from './components/SupervisorDashboard'
import './App.css'

function App() {
  const [team, setTeam] = useState(null)
  const [view, setView] = useState('dashboard')
  const [activeChecklist, setActiveChecklist] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const savedTeam = localStorage.getItem('team')
    if (savedTeam) {
      setTeam(JSON.parse(savedTeam))
    }
  }, [])

  const handleLogin = (teamData) => {
    setTeam(teamData)
    localStorage.setItem('team', JSON.stringify(teamData))
  }

  const handleLogout = () => {
    setTeam(null)
    localStorage.removeItem('team')
  }

  const openChecklist = (checklist) => {
    setActiveChecklist(checklist)
    setView('checklist')
  }

  const backToDashboard = () => {
    setView('dashboard')
    setActiveChecklist(null)
  }

  if (!team) {
    return <Login onLogin={handleLogin} />
  }

  const isSupervisor = team.team_type === 'supervisor'

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
    </div>
  )
}

export default App
