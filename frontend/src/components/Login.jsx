import { useState, useEffect } from 'react'
import { API_BASE } from '../config'

function Login({ onLogin }) {
  const [step, setStep] = useState(1)
  const [outlets, setOutlets] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginResult, setLoginResult] = useState(null) // { team, role } held until attestation confirmed

  // Load outlets on mount, restore saved outlet + team
  useEffect(() => {
    fetchOutlets()
  }, [])

  const fetchOutlets = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/outlets/`)
      const data = await res.json()
      setOutlets(data)

      // Restore saved outlet and team
      const savedOutlet = localStorage.getItem('selected_outlet')
      const savedTeam = localStorage.getItem('selected_team')
      if (savedOutlet) {
        try {
          const parsedOutlet = JSON.parse(savedOutlet)
          const matchOutlet = data.find(o => o.id === parsedOutlet.id)
          if (matchOutlet) {
            setSelectedOutlet(matchOutlet)
            // Fetch teams for this outlet
            const teamsRes = await fetch(`${API_BASE}/api/outlets/${matchOutlet.id}/teams/`)
            if (teamsRes.ok) {
              const teamsData = await teamsRes.json()
              setTeams(teamsData)

              if (savedTeam) {
                const parsedTeam = JSON.parse(savedTeam)
                const matchTeam = teamsData.find(t => t.id === parsedTeam.id)
                if (matchTeam) {
                  setSelectedTeam(matchTeam)
                  setStep(3) // Skip to PIN entry
                  setLoading(false)
                  return
                }
              }
              setStep(2) // Skip to team selection
              setLoading(false)
              return
            }
          }
        } catch {}
      }
    } catch {
      setError('Failed to load outlets')
    } finally {
      setLoading(false)
    }
  }

  const selectOutlet = async (outlet) => {
    setSelectedOutlet(outlet)
    localStorage.setItem('selected_outlet', JSON.stringify({ id: outlet.id, name: outlet.name }))
    setSelectedTeam(null)
    localStorage.removeItem('selected_team')
    setPin('')
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/outlets/${outlet.id}/teams/`)
      if (res.ok) {
        const data = await res.json()
        setTeams(data)
        setStep(2)
      } else {
        setError('Failed to load teams')
      }
    } catch {
      setError('Network error loading teams')
    } finally {
      setLoading(false)
    }
  }

  const selectTeam = (team) => {
    setSelectedTeam(team)
    localStorage.setItem('selected_team', JSON.stringify({ id: team.id, name: team.name }))
    setPin('')
    setError('')
    setStep(3)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: selectedOutlet.id,
          team_id: selectedTeam.id,
          pin: pin
        })
      })
      const data = await res.json()
      if (data.success) {
        setLoginResult({ team: data.team, role: data.role })
        setStep(4)
      } else {
        setError(data.error || 'Invalid PIN')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const changeOutlet = () => {
    setSelectedOutlet(null)
    setSelectedTeam(null)
    setTeams([])
    setPin('')
    setError('')
    localStorage.removeItem('selected_outlet')
    localStorage.removeItem('selected_team')
    setStep(1)
  }

  const changeTeam = () => {
    setSelectedTeam(null)
    setPin('')
    setError('')
    localStorage.removeItem('selected_team')
    setStep(2)
  }

  // Step 4: Attestation
  if (step === 4 && loginResult) {
    return (
      <div className="login-container">
        <div className="login-card login-card-wide">
          <div className="attestation-icon">&#x1F6E1;&#xFE0F;</div>
          <h2>Attestation</h2>
          <p className="attestation-text">
            Saya konfirmasi checklist ini sudah diisi dengan benar dan semua pekerjaan sudah dilakukan sesuai yang dicatat. Saya paham bahwa laporan palsu adalah pelanggaran serius terhadap kebijakan perusahaan.
          </p>
          <button
            className="btn-login btn-attestation"
            onClick={() => onLogin(loginResult.team, loginResult.role)}
          >
            I Confirm
          </button>
          <button
            className="login-change-link"
            onClick={() => { setLoginResult(null); setPin(''); setStep(3) }}
            style={{ marginTop: '12px', display: 'block', width: '100%' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Select Outlet
  if (step === 1) {
    return (
      <div className="login-container">
        <div className="login-card login-card-wide">
          <h2>Select Outlet</h2>
          {loading ? (
            <div className="login-loading"><div className="loading-spinner" /></div>
          ) : (
            <div className="login-list">
              {outlets.map(outlet => (
                <button
                  key={outlet.id}
                  className="login-option-btn"
                  onClick={() => selectOutlet(outlet)}
                >
                  <span className="login-option-name">{outlet.name}</span>
                  {outlet.location && <span className="login-option-sub">{outlet.location}</span>}
                </button>
              ))}
              {outlets.length === 0 && !loading && (
                <p className="login-empty">No outlets found</p>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  // Step 2: Select Team
  if (step === 2) {
    return (
      <div className="login-container">
        <div className="login-card login-card-wide">
          <div className="login-step-header">
            <button className="login-change-link" onClick={changeOutlet}>Change</button>
            <span className="login-outlet-label">{selectedOutlet.name}</span>
          </div>
          <h2>Select Team</h2>
          {loading ? (
            <div className="login-loading"><div className="loading-spinner" /></div>
          ) : (
            <div className="login-list">
              {teams.map(team => (
                <button
                  key={team.id}
                  className="login-option-btn"
                  onClick={() => selectTeam(team)}
                >
                  <span className="login-option-name">{team.name}</span>
                </button>
              ))}
              {teams.length === 0 && !loading && (
                <p className="login-empty">No teams found for this outlet</p>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  // Step 3: Enter PIN
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-step-header">
          <button className="login-change-link" onClick={changeTeam}>Change</button>
          <span className="login-outlet-label">{selectedOutlet.name} — {selectedTeam.name}</span>
        </div>
        <h2>Enter PIN</h2>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter PIN"
            maxLength={4}
            className="passcode-input"
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button
            type="submit"
            className="btn-login"
            disabled={loading || pin.length !== 4}
          >
            {loading ? '...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
