import { useState } from 'react'
import { API_BASE } from '../config'

function Login({ onLogin }) {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      })

      const data = await response.json()

      if (data.success) {
        onLogin(data.team)
      } else {
        setError(data.error || 'Invalid passcode')
      }
    } catch (err) {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Enter Passcode</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••"
            maxLength={6}
            className="passcode-input"
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button 
            type="submit" 
            className="btn-login"
            disabled={loading || passcode.length < 4}
          >
            {loading ? '...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
