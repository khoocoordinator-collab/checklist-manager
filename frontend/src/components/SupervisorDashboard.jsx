import { useState, useEffect } from 'react'
import { API_BASE, APP_VERSION, BUILD_TIME } from '../config'
import SignaturePad from './SignaturePad'
import './SupervisorDashboard.css'

function CountdownTimer({ deadline, isExpired, label = 'Time' }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [urgency, setUrgency] = useState('normal')

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

      const hoursLeft = diff / (1000 * 60 * 60)
      if (hoursLeft <= 1) {
        setUrgency('critical')
      } else if (hoursLeft <= 2) {
        setUrgency('warning')
      } else {
        setUrgency('normal')
      }

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
      <span>{label}: {timeLeft}</span>
    </span>
  )
}

function SupervisorDashboard({ team, onLogout }) {
  const [awaitingVerification, setAwaitingVerification] = useState([])
  const [verifiedToday, setVerifiedToday] = useState([])
  const [flaggedItems, setFlaggedItems] = useState([])
  const [activeTab, setActiveTab] = useState('awaiting') // 'awaiting' | 'verified' | 'reports'
  const [loading, setLoading] = useState(true)
  const [selectedChecklist, setSelectedChecklist] = useState(null)
  const [supervisorName, setSupervisorName] = useState('')
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signaturePadMode, setSignaturePadMode] = useState('verify') // 'verify' | 'acknowledge' | 'review'
  const [acknowledgeFlag, setAcknowledgeFlag] = useState(null) // flag object being acknowledged
  const [acknowledgeName, setAcknowledgeName] = useState('')
  const [acknowledgeMessage, setAcknowledgeMessage] = useState('')
  const [verifyMessage, setVerifyMessage] = useState('')
  const [enlargedPhoto, setEnlargedPhoto] = useState(null)
  const [supervisorReview, setSupervisorReview] = useState({}) // item_id → { confirmed: bool|null, comment: string }
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [team.id])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch awaiting verification (pass role=supervisor so backend returns outlet-wide pending)
      const response = await fetch(`${API_BASE}/api/pending/?team=${team.id}&role=supervisor`)
      if (response.ok) {
        const data = await response.json()
        setAwaitingVerification(data)
      } else {
        console.error('Failed to load awaiting checklists')
      }

      // Fetch verified today (filter by supervisor_team)
      const today = new Date().toISOString().split('T')[0]
      const verifiedResponse = await fetch(`${API_BASE}/api/instances/?status=verified&supervisor_team=${team.id}`)
      if (verifiedResponse.ok) {
        const allVerified = await verifiedResponse.json()
        const todaysVerified = allVerified.filter(instance => {
          if (instance.supervisor_signed_at) {
            const signedDate = instance.supervisor_signed_at.split('T')[0]
            return signedDate === today
          }
          return instance.date_label === today
        })
        setVerifiedToday(todaysVerified)
      }

      // Fetch active flags for this outlet
      const flagsResponse = await fetch(`${API_BASE}/api/flags/?team=${team.id}`)
      if (flagsResponse.ok) {
        const flagsData = await flagsResponse.json()
        setFlaggedItems(flagsData)
      }
    } catch (err) {
      console.error('Network error:', err)
    } finally {
      setLoading(false)
    }
  }

  const openChecklistDetail = (checklist) => {
    setSelectedChecklist(checklist)
    setVerifyMessage('')
    setReviewError('')
    // Initialize item review state
    if (checklist.status === 'completed' || checklist.status === 'resubmitted') {
      const initialReview = {}
      checklist.items?.forEach(item => {
        initialReview[item.id] = { confirmed: null, comment: '' }
      })
      setSupervisorReview(initialReview)
    }
  }

  const closeChecklistDetail = () => {
    setSelectedChecklist(null)
    setSupervisorName('')
    setShowSignaturePad(false)
    setVerifyMessage('')
    setSupervisorReview({})
    setReviewError('')
  }

  const handleSignatureSave = async (sigData) => {
    setShowSignaturePad(false)

    if (signaturePadMode === 'acknowledge') {
      try {
        const response = await fetch(`${API_BASE}/api/acknowledge-flag/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flag_id: acknowledgeFlag.flag_id,
            acknowledged_by: acknowledgeName,
            acknowledgement_signature: sigData.image_data
          })
        })

        if (response.ok) {
          setAcknowledgeMessage('✅ Flag acknowledged')
          setAcknowledgeFlag(null)
          setAcknowledgeName('')
          setTimeout(() => {
            setAcknowledgeMessage('')
            loadData()
          }, 1500)
        } else {
          const error = await response.json()
          setAcknowledgeMessage(`❌ Error: ${error.error || 'Acknowledge failed'}`)
        }
      } catch (err) {
        console.error('Acknowledge error:', err)
        setAcknowledgeMessage('❌ Network error. Please try again.')
      }
      return
    }

    if (signaturePadMode === 'review') {
      try {
        const items = selectedChecklist.items.map(item => ({
          item_id: item.id,
          supervisor_confirmed: supervisorReview[item.id]?.confirmed,
          supervisor_comment: supervisorReview[item.id]?.comment || ''
        }))

        const response = await fetch(`${API_BASE}/api/supervisor/review/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instance_id: selectedChecklist.id,
            supervisor_team_id: team.id,
            supervisor_name: supervisorName,
            supervisor_signature: sigData.image_data,
            items
          })
        })

        if (response.ok) {
          const data = await response.json()
          const msg = data.status === 'verified'
            ? '✅ Checklist verified — all items confirmed!'
            : '✅ Checklist rejected and returned to staff for correction.'
          setVerifyMessage(msg)
          setTimeout(() => {
            closeChecklistDetail()
            loadData()
          }, 2000)
        } else {
          const error = await response.json()
          setVerifyMessage(`❌ Error: ${error.error || 'Review failed'}`)
        }
      } catch (err) {
        console.error('Review error:', err)
        setVerifyMessage('❌ Network error. Please try again.')
      }
      return
    }

    // verify mode (legacy, kept for backwards compatibility)
    try {
      const response = await fetch(`${API_BASE}/api/supervisor/verify/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: selectedChecklist.id,
          supervisor_team_id: team.id,
          supervisor_name: supervisorName,
          supervisor_signature: sigData.image_data
        })
      })

      if (response.ok) {
        setVerifyMessage('✅ Checklist verified successfully!')
        setTimeout(() => {
          closeChecklistDetail()
          loadData()
        }, 1500)
      } else {
        const error = await response.json()
        setVerifyMessage(`❌ Error: ${error.error || 'Verification failed'}`)
      }
    } catch (err) {
      console.error('Verification error:', err)
      setVerifyMessage('❌ Network error. Please try again.')
    }
  }

  const handleSignatureCancel = () => {
    setShowSignaturePad(false)
  }

  const openAcknowledgeModal = (flag) => {
    setAcknowledgeFlag(flag)
    setAcknowledgeName('')
    setAcknowledgeMessage('')
  }

  const closeAcknowledgeModal = () => {
    setAcknowledgeFlag(null)
    setAcknowledgeName('')
    setAcknowledgeMessage('')
  }

  const handleAcknowledgeSign = () => {
    if (!acknowledgeName.trim()) {
      setAcknowledgeMessage('Please enter your name before signing')
      return
    }
    setSignaturePadMode('acknowledge')
    setShowSignaturePad(true)
  }

  const handleVerifyClick = () => {
    if (!supervisorName.trim()) {
      setVerifyMessage('Please enter your name before signing')
      return
    }
    setSignaturePadMode('verify')
    setShowSignaturePad(true)
  }

  const handleSignOff = () => {
    if (!supervisorName.trim()) {
      setReviewError('Please enter your name before signing')
      return
    }
    setReviewError('')
    setSignaturePadMode('review')
    setShowSignaturePad(true)
  }

  const handleSendForRework = async () => {
    if (!supervisorName.trim()) {
      setReviewError('Please enter your name')
      return
    }
    const missingComments = selectedChecklist?.items?.some(item =>
      supervisorReview[item.id]?.confirmed === false &&
      !supervisorReview[item.id]?.comment?.trim()
    )
    if (missingComments) {
      setReviewError('Please add a comment for all rejected items')
      return
    }
    setReviewError('')

    try {
      const items = selectedChecklist.items.map(item => ({
        item_id: item.id,
        supervisor_confirmed: supervisorReview[item.id]?.confirmed,
        supervisor_comment: supervisorReview[item.id]?.comment || ''
      }))

      const response = await fetch(`${API_BASE}/api/supervisor/rework/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: selectedChecklist.id,
          supervisor_team_id: team.id,
          supervisor_name: supervisorName,
          items
        })
      })

      if (response.ok) {
        setVerifyMessage('✅ Checklist sent back for rework.')
        setTimeout(() => {
          closeChecklistDetail()
          loadData()
        }, 1500)
      } else {
        const error = await response.json()
        setVerifyMessage(`❌ Error: ${error.error || 'Rework failed'}`)
      }
    } catch (err) {
      console.error('Rework error:', err)
      setVerifyMessage('❌ Network error. Please try again.')
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const openEnlargedPhoto = (photoUrl) => {
    setEnlargedPhoto(photoUrl)
  }

  const closeEnlargedPhoto = () => {
    setEnlargedPhoto(null)
  }

  const renderItemResponse = (item) => {
    if (item.response_type === 'photo' && item.photo_url) {
      return (
        <div className="item-photo-response">
          <span className="tag tag-photo">📷 Photo</span>
          <img
            src={item.photo_url}
            alt="Evidence"
            className="item-photo-thumbnail"
            onClick={() => openEnlargedPhoto(item.photo_url)}
          />
        </div>
      )
    }

    const value = item.response_value
    if (item.response_type === 'yes_no') {
      if (value === 'yes' || value === 'true' || value === true) return <span className="tag tag-yes">✓ Yes</span>
      if (value === 'no' || value === 'false' || value === false) return <span className="tag tag-no">✗ No</span>
      if (value === 'na' || value === 'n/a') return <span className="tag tag-na">N/A</span>
      return <span className="tag tag-empty">No response</span>
    }

    if (item.response_type === 'number') {
      return value ? <span className="tag tag-number">{value}</span> : <span className="tag tag-empty">No value</span>
    }

    if (item.response_type === 'text') {
      return value ? <span className="tag tag-text">{value}</span> : <span className="tag tag-empty">No text</span>
    }

    return <span className="tag tag-empty">{value || 'No response'}</span>
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <div className="supervisor-dashboard">
      <div className="supervisor-header">
        <h2>👑 Supervisor Dashboard</h2>
        <p>{team.outlet?.name || 'Unknown Outlet'} — {team.name}</p>
      </div>

      {verifyMessage && (
        <div className={`alert ${verifyMessage.includes('✅') ? 'alert-success' : 'alert-error'}`}>
          {verifyMessage}
        </div>
      )}

      {!selectedChecklist ? (
        <>
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'awaiting' ? 'active' : ''}`}
              onClick={() => setActiveTab('awaiting')}
            >
              Awaiting Verification
              {awaitingVerification.length > 0 && <span className="tab-badge">{awaitingVerification.length}</span>}
            </button>
            <button
              className={`tab ${activeTab === 'verified' ? 'active' : ''}`}
              onClick={() => setActiveTab('verified')}
            >
              Verified Today
              {verifiedToday.length > 0 && <span className="tab-badge">{verifiedToday.length}</span>}
            </button>
            <button
              className={`tab ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              🚩 Flags
              {flaggedItems.filter(f => f.status === 'active').length > 0 && (
                <span className="tab-badge">{flaggedItems.filter(f => f.status === 'active').length}</span>
              )}
            </button>
          </div>

          <section>
            {activeTab === 'awaiting' ? (
              <>
                <div className="section-header">
                  <h2>Awaiting Verification</h2>
                </div>

                {awaitingVerification.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">✅</div>
                    <p>No checklists awaiting verification</p>
                    <p className="empty-state-sub">All completed checklists have been verified</p>
                  </div>
                ) : (
                  <div className="checklist-list">
                    {awaitingVerification.map(checklist => (
                      <div
                        key={checklist.id}
                        className="checklist-card"
                        onClick={() => openChecklistDetail(checklist)}
                      >
                        <div className="checklist-card-inner">
                          <div className="checklist-main">
                            <h3 className="checklist-title">{checklist.template_title}</h3>
                            <div className="checklist-meta">
                              <span>📅 {checklist.date_label}</span>
                              <span>👤 {checklist.completed_by || 'Unknown'}</span>
                              <span>🏢 {checklist.team_name || 'Unknown'}</span>
                            </div>
                          </div>
                          <div className="checklist-status-col">
                            <span className={`status-badge ${checklist.status === 'resubmitted' ? 'status-resubmitted' : 'status-pending'}`}>
                              {checklist.status === 'resubmitted' ? 'Resubmitted' : 'Pending'}
                            </span>
                            <CountdownTimer
                              deadline={checklist.supervisor_deadline}
                              isExpired={checklist.is_supervisor_expired}
                              label="Verify"
                            />
                            {checklist.signature_data && (
                              <div className="signature-info">
                                <span>✍️</span>
                                <span>Signed by {checklist.signature_data.signed_by}</span>
                              </div>
                            )}
                            <button className="btn-primary">Review →</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : activeTab === 'verified' ? (
              <>
                <div className="section-header">
                  <h2>Verified Today</h2>
                </div>

                {verifiedToday.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">👑</div>
                    <p>No checklists verified today</p>
                    <p className="empty-state-sub">Your verified checklists will appear here</p>
                  </div>
                ) : (
                  <div className="checklist-list">
                    {verifiedToday.map(checklist => (
                      <div
                        key={checklist.id}
                        className="checklist-card verified"
                        onClick={() => openChecklistDetail(checklist)}
                      >
                        <div className="checklist-card-inner">
                          <div className="checklist-main">
                            <h3 className="checklist-title">{checklist.template_title}</h3>
                            <div className="checklist-meta">
                              <span>📅 {checklist.date_label}</span>
                              <span>👤 {checklist.completed_by || 'Unknown'}</span>
                              <span>🏢 {checklist.team_name || 'Unknown'}</span>
                            </div>
                          </div>
                          <div className="checklist-status-col">
                            <span className="status-badge status-verified">Verified</span>
                            {checklist.supervisor_signed_at && (
                              <span className="verified-time">
                                {new Date(checklist.supervisor_signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            <span className="view-text">View →</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="section-header">
                  <h2>🚩 Flags</h2>
                </div>

                {acknowledgeMessage && (
                  <div className={`alert ${acknowledgeMessage.includes('✅') ? 'alert-success' : 'alert-error'}`}>
                    {acknowledgeMessage}
                  </div>
                )}

                {flaggedItems.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">✅</div>
                    <p>No active flags</p>
                    <p className="empty-state-sub">All items are clear</p>
                  </div>
                ) : (
                  <div className="checklist-list">
                    {flaggedItems.map(flag => {
                      const isAcknowledged = flag.status === 'acknowledged'
                      const borderColor = isAcknowledged ? '#22c55e' : '#ef4444'
                      const badgeBg = isAcknowledged ? '#f0fdf4' : '#fef2f2'
                      const badgeColor = isAcknowledged ? '#16a34a' : '#ef4444'
                      const badgeBorder = isAcknowledged ? '#bbf7d0' : '#fecaca'
                      return (
                        <div key={flag.flag_id} className="checklist-card" style={{ borderLeft: `4px solid ${borderColor}` }}>
                          <div className="checklist-card-inner">
                            <div className="checklist-main">
                              <h3 className="checklist-title" style={{ color: borderColor }}>🚩 {flag.item_text}</h3>
                              <div className="checklist-meta">
                                <span>📋 {flag.checklist_title}</span>
                                <span>📅 {flag.date_label}</span>
                                <span>🏢 {flag.team_name}</span>
                              </div>
                              {flag.description && (
                                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#555' }}>
                                  {flag.description}
                                </p>
                              )}
                              {flag.photo_url && (
                                <div style={{ marginTop: '8px' }}>
                                  <img
                                    src={flag.photo_url}
                                    alt="Flag evidence"
                                    style={{ maxWidth: '120px', maxHeight: '90px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                                    onClick={() => openEnlargedPhoto(flag.photo_url)}
                                  />
                                </div>
                              )}
                              {isAcknowledged && (
                                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#16a34a' }}>
                                  Acknowledged by <strong>{flag.acknowledged_by}</strong> on {formatDate(flag.acknowledged_at)}
                                </p>
                              )}
                            </div>
                            <div className="checklist-status-col">
                              <span className="status-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
                                {isAcknowledged ? 'Acknowledged' : 'Active'}
                              </span>
                              <span style={{ fontSize: '11px', color: '#888' }}>
                                {formatDate(flag.flagged_at)}
                              </span>
                              {!isAcknowledged && (
                                <button
                                  className="btn-primary"
                                  style={{ marginTop: '6px', fontSize: '12px', padding: '6px 10px' }}
                                  onClick={() => openAcknowledgeModal(flag)}
                                >
                                  Acknowledge
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Acknowledge Modal */}
                {acknowledgeFlag && (
                  <div className="modal-overlay" onClick={closeAcknowledgeModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                      <h3>Acknowledge Flag</h3>
                      <p style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>{acknowledgeFlag.item_text}</p>
                      {acknowledgeFlag.description && (
                        <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px', fontStyle: 'italic' }}>"{acknowledgeFlag.description}"</p>
                      )}
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600 }}>Your Name</label>
                        <input
                          type="text"
                          value={acknowledgeName}
                          onChange={(e) => setAcknowledgeName(e.target.value)}
                          placeholder="Enter your full name"
                          className="form-input"
                          style={{ marginTop: '6px' }}
                        />
                      </div>
                      {acknowledgeMessage && (
                        <p style={{ fontSize: '13px', color: '#ef4444', marginBottom: '8px' }}>{acknowledgeMessage}</p>
                      )}
                      <div className="modal-actions">
                        <button onClick={closeAcknowledgeModal} className="btn-secondary">Cancel</button>
                        <button
                          onClick={handleAcknowledgeSign}
                          disabled={!acknowledgeName.trim()}
                          className="btn-save"
                          style={{ width: 'auto', padding: '8px 20px' }}
                        >
                          ✍️ Sign & Acknowledge
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <div className="verification-detail">
          <div className="detail-header">
            <button onClick={closeChecklistDetail} className="btn-back">
              ← Back to List
            </button>
            <span className={`status-badge ${
              selectedChecklist.status === 'verified' ? 'status-verified' :
              selectedChecklist.status === 'rejected' ? 'status-rejected' :
              selectedChecklist.status === 'resubmitted' ? 'status-resubmitted' :
              'status-pending'
            }`}>
              {selectedChecklist.status === 'verified' ? 'Verified' :
               selectedChecklist.status === 'rejected' ? 'Rejected' :
               selectedChecklist.status === 'resubmitted' ? 'Resubmitted' :
               'Awaiting Verification'}
            </span>
          </div>

          <div className="info-panel">
            <h3>{selectedChecklist.template_title}</h3>
            <div className="info-row">
              <span>📅</span>
              <span>{selectedChecklist.date_label}</span>
            </div>
            <div className="info-row">
              <span>🏢</span>
              <span>Team: <strong>{selectedChecklist.team_name || 'Unknown'}</strong></span>
            </div>
            <div className="info-row">
              <span>👤</span>
              <span>Completed by: <strong>{selectedChecklist.completed_by || 'Unknown'}</strong></span>
            </div>
            {selectedChecklist.signature_data?.signed_at && (
              <div className="info-row">
                <span>🕐</span>
                <span>Signed at: {formatDate(selectedChecklist.signature_data.signed_at)}</span>
              </div>
            )}
          </div>

          {/* Enlarged Photo Modal */}
          {enlargedPhoto && (
            <div className="modal-overlay" onClick={closeEnlargedPhoto}>
              <div className="photo-modal" onClick={e => e.stopPropagation()}>
                <button className="photo-modal-close" onClick={closeEnlargedPhoto}>✕</button>
                <img src={enlargedPhoto} alt="Full size" />
                <p className="photo-modal-hint">Click anywhere to close</p>
              </div>
            </div>
          )}

          {/* Items (read-only for verified/rejected checklists) */}
          {selectedChecklist.status === 'verified' && selectedChecklist.items?.length > 0 && (
            <div className="review-items-readonly">
              <h4>Checklist Items</h4>
              {selectedChecklist.items.map((item) => (
                <div key={item.id} className="review-item-row">
                  <div className="review-item-main">
                    <p className="review-item-text">{item.item_text}</p>
                    <div className="review-item-response">{renderItemResponse(item)}</div>
                  </div>
                  {item.supervisor_confirmed !== null && (
                    <span className={`tag ${item.supervisor_confirmed ? 'tag-yes' : 'tag-no'}`}>
                      {item.supervisor_confirmed ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Staff Signature */}
          {selectedChecklist.signature_data && (
            <div className="signature-display">
              <h4>✍️ Staff Signature</h4>
              <img
                src={selectedChecklist.signature_data.image_data}
                alt="Staff Signature"
              />
              <p>
                Signed by: <strong>{selectedChecklist.signature_data.signed_by}</strong>
                {selectedChecklist.signature_data.signed_at && (
                  <span> on {formatDate(selectedChecklist.signature_data.signed_at)}</span>
                )}
              </p>
            </div>
          )}

          {/* Supervisor Signature (if already verified) */}
          {selectedChecklist.supervisor_signature_data && (
            <div className="signature-display">
              <h4>👑 Supervisor Signature</h4>
              <img
                src={selectedChecklist.supervisor_signature_data.image_data}
                alt="Supervisor Signature"
              />
              <p>
                Signed by: <strong>{selectedChecklist.supervisor_signature_data.signed_by}</strong>
                {selectedChecklist.supervisor_signature_data.signed_at && (
                  <span> on {formatDate(selectedChecklist.supervisor_signature_data.signed_at)}</span>
                )}
              </p>
            </div>
          )}

          {/* Review Panel - item-by-item review for completed/resubmitted checklists */}
          {(selectedChecklist.status === 'completed' || selectedChecklist.status === 'resubmitted') && (() => {
            const allActioned = selectedChecklist.items?.every(item =>
              supervisorReview[item.id]?.confirmed !== null &&
              supervisorReview[item.id]?.confirmed !== undefined
            )
            const allConfirmed = allActioned && selectedChecklist.items?.every(item =>
              supervisorReview[item.id]?.confirmed === true
            )
            const anyRejected = allActioned && selectedChecklist.items?.some(item =>
              supervisorReview[item.id]?.confirmed === false
            )
            return (
              <div className="verification-panel">
                <h4>👑 Supervisor Review</h4>
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 16px' }}>
                  Review each item and confirm or reject it. Rejected items require a comment.
                </p>

                <div className="review-items">
                  {selectedChecklist.items?.map((item) => {
                    const review = supervisorReview[item.id] || { confirmed: null, comment: '' }
                    const borderColor = review.confirmed === true ? '#22c55e' : review.confirmed === false ? '#ef4444' : '#e5e7eb'
                    return (
                      <div key={item.id} style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '10px', marginBottom: '14px', transition: 'border-color 0.15s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 500 }}>{item.item_text}</p>
                            <div style={{ fontSize: '12px' }}>{renderItemResponse(item)}</div>
                            {item.supervisor_comment && selectedChecklist.status === 'resubmitted' && (
                              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#b45309', background: '#fffbeb', padding: '3px 6px', borderRadius: '3px', display: 'inline-block' }}>
                                Previous: {item.supervisor_comment}
                              </p>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button
                              onClick={() => setSupervisorReview(prev => ({ ...prev, [item.id]: { ...prev[item.id], confirmed: true } }))}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                                background: review.confirmed === true ? '#22c55e' : '#f0fdf4',
                                color: review.confirmed === true ? 'white' : '#16a34a',
                                border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer'
                              }}
                            >
                              ✓ Confirm
                            </button>
                            <button
                              onClick={() => setSupervisorReview(prev => ({ ...prev, [item.id]: { ...prev[item.id], confirmed: false } }))}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                                background: review.confirmed === false ? '#ef4444' : '#fef2f2',
                                color: review.confirmed === false ? 'white' : '#ef4444',
                                border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer'
                              }}
                            >
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                        {review.confirmed === false && (
                          <textarea
                            value={review.comment}
                            onChange={(e) => setSupervisorReview(prev => ({ ...prev, [item.id]: { ...prev[item.id], comment: e.target.value } }))}
                            placeholder="Comment required for rejection..."
                            style={{
                              marginTop: '8px', width: '100%', padding: '6px 8px',
                              border: '1px solid #fecaca', borderRadius: '4px',
                              fontSize: '12px', resize: 'vertical', minHeight: '60px',
                              boxSizing: 'border-box'
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="supervisor-name">Your Name</label>
                  <input
                    id="supervisor-name"
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="Enter your full name"
                    className="form-input"
                  />
                </div>

                {reviewError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 10px' }}>{reviewError}</p>
                )}

                {allConfirmed && (
                  <button
                    onClick={handleSignOff}
                    disabled={!supervisorName.trim()}
                    className="btn-verify"
                  >
                    <span>✍️</span>
                    Sign Off
                  </button>
                )}

                {anyRejected && (
                  <button
                    onClick={handleSendForRework}
                    disabled={!supervisorName.trim()}
                    className="btn-verify"
                    style={{ background: '#ef4444', borderColor: '#dc2626' }}
                  >
                    <span>↩</span>
                    Send for Rework
                  </button>
                )}

                {allConfirmed && (
                  <p className="disclaimer">
                    By signing, you confirm all items have been inspected and approved.
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {showSignaturePad && (
        <div className="modal-overlay">
          <SignaturePad
            onSave={handleSignatureSave}
            onCancel={handleSignatureCancel}
            signedBy={supervisorName}
            title="Supervisor Signature"
          />
        </div>
      )}

      <footer className="version-footer">
        v{APP_VERSION} • {BUILD_TIME}
      </footer>
    </div>
  )
}

export default SupervisorDashboard
