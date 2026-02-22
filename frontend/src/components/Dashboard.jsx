import { useState, useEffect } from 'react'
import { API_BASE, APP_VERSION, BUILD_TIME } from '../config'

function CountdownTimer({ deadline, isExpired }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [urgency, setUrgency] = useState('normal') // normal | warning | critical | expired

  useEffect(() => {
    if (isExpired) {
      setTimeLeft('Expired')
      setUrgency('expired')
      return
    }

    if (!deadline) {
      setTimeLeft('')
      return
    }

    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const deadlineTime = new Date(deadline).getTime()
      const diff = deadlineTime - now

      if (diff <= 0) {
        setTimeLeft('Expired')
        setUrgency('expired')
        return
      }

      // Calculate urgency based on time remaining
      const hoursLeft = diff / (1000 * 60 * 60)
      if (hoursLeft <= 1) {
        setUrgency('critical')
      } else if (hoursLeft <= 3) {
        setUrgency('warning')
      } else {
        setUrgency('normal')
      }

      // Format time left
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`)
      } else {
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [deadline, isExpired])

  if (!deadline && !isExpired) return null

  return (
    <span className={`countdown-timer countdown-${urgency}`}>
      <span>⏱</span>
      <span>{timeLeft}</span>
    </span>
  )
}

function Dashboard({ team, onOpenChecklist, onPendingCountChange }) {
  const [pending, setPending] = useState([])
  const [completedToday, setCompletedToday] = useState([])
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'completed'
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncErrorDetails, setSyncErrorDetails] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [team.id])

  const loadData = async () => {
    const localPending = JSON.parse(localStorage.getItem(`pending_${team.id}`) || '[]')

    try {
      // Fetch server-side pending + completed/verified/resubmitted in parallel
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      const results = await Promise.allSettled([
        fetch(`${API_BASE}/api/pending/?team=${team.id}`),
        fetch(`${API_BASE}/api/instances/?team=${team.id}&status=completed,verified,resubmitted`)
      ])

      // Handle pending response
      const [pendingResult, completedResult] = results
      if (pendingResult.status === 'fulfilled' && pendingResult.value.ok) {
        const serverPending = await pendingResult.value.json()
        const localIds = new Set(localPending.map(i => i.id))
        const mergedPending = [
          ...localPending,
          ...serverPending.filter(i => !localIds.has(i.id))
        ]
        setPending(mergedPending)
        onPendingCountChange(mergedPending.length)
      } else {
        setPending(localPending)
        onPendingCountChange(localPending.length)
      }

      // Handle completed response
      if (completedResult.status === 'fulfilled' && completedResult.value.ok) {
        const allData = await completedResult.value.json()
        const allCompletedToday = allData
          .filter(instance => instance.date_label === today)
          .sort((a, b) => new Date(b.synced_at || b.created_at) - new Date(a.synced_at || a.created_at))
        setCompletedToday(allCompletedToday)
      }
    } catch (err) {
      console.log('Offline mode - using cached data')
      setPending(localPending)
      onPendingCountChange(localPending.length)
    }

    setLoading(false)
  }

  const syncData = async () => {
    if (pending.length === 0) return

    setSyncing(true)
    setSyncMessage('')

    try {
      const response = await fetch(`${API_BASE}/api/instances/sync/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: team.id,
          instances: pending
        })
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem(`pending_${team.id}`, '[]')
        setSyncMessage(`Synced ${data.synced} checklist(s)`)
        setSyncErrorDetails(null)
        setTimeout(() => setSyncMessage(''), 3000)
        // Reload to fetch updated state from server
        loadData()
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Sync error:', errorData)
        const errorCode = errorData.code || 'UNKNOWN'
        const errorMsg = errorData.error || 'Unknown error'
        setSyncMessage(`Sync failed: [${errorCode}] ${errorMsg}`)
        setSyncErrorDetails(errorData.errors || null)
      }
    } catch (err) {
      console.error('Network error during sync:', err)
      setSyncMessage('Offline. Sync queued.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="loading"><div className="loading-spinner"></div>Loading...</div>

  return (
    <div className="dashboard">
      {syncMessage && (
        <div className={`sync-message ${syncMessage.includes('failed') ? 'error' : ''}`}>
          {syncMessage}
        </div>
      )}

      {syncErrorDetails && (
        <div className="sync-error-details" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', padding: '10px', marginBottom: '10px', borderRadius: '6px', fontSize: '12px', color: '#f87171'}}>
          <strong>Debug Info:</strong>
          <pre style={{overflow: 'auto', maxHeight: '200px', marginTop: '5px', color: '#94a3b8'}}>{JSON.stringify(syncErrorDetails, null, 2)}</pre>
          <button onClick={() => setSyncErrorDetails(null)} style={{marginTop: '5px', fontSize: '11px', color: '#94a3b8', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer'}}>Hide</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          To Do
          {pending.length > 0 && <span className="tab-badge">{pending.length}</span>}
        </button>
        <button
          className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          Completed Today
          {completedToday.length > 0 && <span className="tab-badge">{completedToday.length}</span>}
        </button>
      </div>

      <section className="section">
        {activeTab === 'pending' ? (
          <>
            <div className="section-header">
              <h2 className="section-title">Checklists to Complete</h2>
            </div>

            {pending.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <p>No pending checklists</p>
                <p className="empty-state-sub">All caught up!</p>
              </div>
            ) : (
              <div className="checklist-list">
                {pending.map(checklist => (
                  <div
                    key={checklist.id}
                    className="checklist-card"
                    onClick={() => onOpenChecklist(checklist)}
                  >
                    <div className="checklist-card-inner">
                      <div className="checklist-main">
                        <h3 className="checklist-title">{checklist.template_title}</h3>
                        <div className="checklist-meta">
                          <span>{checklist.date_label}</span>
                        </div>
                      </div>
                      <div className="checklist-status-col">
                        <span className={`badge ${checklist.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
                          {checklist.status === 'rejected' ? 'Rejected' : checklist.status}
                        </span>
                        <CountdownTimer
                          deadline={checklist.deadline}
                          isExpired={checklist.is_expired}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <button
                className="btn-sync"
                onClick={syncData}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : `Sync ${pending.length} Pending`}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="section-header">
              <h2 className="section-title">Completed Today</h2>
            </div>

            {completedToday.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <p>No checklists completed today</p>
                <p className="empty-state-sub">Complete a checklist to see it here</p>
              </div>
            ) : (
              <div className="checklist-list">
                {completedToday.map(checklist => (
                  <div
                    key={checklist.id}
                    className={`checklist-card completed ${checklist.status === 'verified' ? 'verified' : ''}`}
                    onClick={() => onOpenChecklist(checklist)}
                  >
                    <div className="checklist-card-inner">
                      <div className="checklist-main">
                        <h3 className="checklist-title">{checklist.template_title}</h3>
                        <div className="checklist-meta">
                          <span>{checklist.date_label}</span>
                          <span className="checklist-meta-separator">•</span>
                          <span>Completed by {checklist.completed_by || 'Unknown'}</span>
                        </div>
                      </div>
                      <div className="checklist-status-col">
                        <span className={`badge ${
                          checklist.status === 'verified' ? 'badge-verified' :
                          checklist.status === 'resubmitted' ? 'badge-resubmitted' :
                          'badge-pending-verification'
                        }`}>
                          {checklist.status === 'verified' ? '✓ Verified' :
                           checklist.status === 'resubmitted' ? '↩ Resubmitted' :
                           '⏳ Pending Verification'}
                        </span>
                        <span className="view-text">View →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <footer className="version-footer">
        v{APP_VERSION} • {BUILD_TIME}
      </footer>
    </div>
  )
}

export default Dashboard
