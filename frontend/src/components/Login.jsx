import { useState, useEffect } from 'react'
import { API_BASE } from '../config'

function Login({ onLogin }) {
  const [step, setStep] = useState(1)
  const [outlets, setOutlets] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Load outlets on mount, restore saved outlet
  useEffect(() => {
    fetchOutlets()
  }, [])

  const fetchOutlets = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/outlets/`)
      const data = await res.json()
      setOutlets(data)

      // Restore saved outlet
      const saved = localStorage.getItem('selected_outlet')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          const match = data.find(o => o.id === parsed.id)
          if (match) {
            setSelectedOutlet(match)
            setStep(2)
            return
          }
        } catch {}
      }
    } catch {
      setError('Failed to load outlets')
    } finally {
      setLoading(false)
    }
  }

  const selectOutlet = (outlet) => {
    setSelectedOutlet(outlet)
    localStorage.setItem('selected_outlet', JSON.stringify({ id: outlet.id, name: outlet.name }))
    setStep(2)
    setPin('')
    setError('')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlet_id: selectedOutlet.id, passcode: pin })
      })
      const data = await res.json()
      if (data.success) {
        onLogin(data.team)
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
    setPin('')
    setError('')
    localStorage.removeItem('selected_outlet')
    setStep(1)
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

  // Step 2: Enter PIN
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-step-header">
          <button className="login-change-link" onClick={changeOutlet}>Change</button>
          <span className="login-outlet-label">{selectedOutlet.name}</span>
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
