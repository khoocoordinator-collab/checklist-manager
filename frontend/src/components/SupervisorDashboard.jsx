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
  const [signaturePadMode, setSignaturePadMode] = useState('verify') // 'verify' | 'acknowledge'
  const [acknowledgeFlag, setAcknowledgeFlag] = useState(null) // flag object being acknowledged
  const [acknowledgeName, setAcknowledgeName] = useState('')
  const [acknowledgeMessage, setAcknowledgeMessage] = useState('')
  const [verifyMessage, setVerifyMessage] = useState('')
  const [enlargedPhoto, setEnlargedPhoto] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [team.id])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch awaiting verification
      const response = await fetch(`${API_BASE}/api/pending/?team=${team.id}`)
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
  }

  const closeChecklistDetail = () => {
    setSelectedChecklist(null)
    setSupervisorName('')
    setShowSignaturePad(false)
    setVerifyMessage('')
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

    // verify mode
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
                            <span className="status-badge status-pending">Pending</span>
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
            <span className={`status-badge ${selectedChecklist.status === 'verified' ? 'status-verified' : 'status-pending'}`}>
              {selectedChecklist.status === 'verified' ? 'Verified' : 'Awaiting Verification'}
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

          {/* Checklist Items */}
          {selectedChecklist.items && selectedChecklist.items.length > 0 && (
            <div className="items-panel">
              <h4>Checklist Items</h4>
              <div className="items-list">
                {selectedChecklist.items.map((item) => (
                  <div key={item.id} className={`item-row ${item.response_type === 'photo' ? 'has-photo' : ''}`}>
                    <span className={`item-status ${item.is_checked ? 'checked' : 'unchecked'}`}>
                      {item.is_checked ? '✓' : '✗'}
                    </span>
                    <div className="item-content">
                      <p className="item-text">
                        {item.item_text}
                        {!!item.current_flag && <span style={{ marginLeft: '6px' }}>🚩</span>}
                      </p>
                      <div className="item-tags">
                        {renderItemResponse(item)}
                        {item.current_flag && (
                          <span className="tag" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
                            🚩 {item.current_flag.description || 'Flagged'}
                          </span>
                        )}
                        {item.current_flag?.photo_url && (
                          <img
                            src={item.current_flag.photo_url}
                            alt="Flag evidence"
                            style={{ maxWidth: '80px', maxHeight: '60px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }}
                            onClick={() => openEnlargedPhoto(item.current_flag.photo_url)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Verification Panel - only show for pending checklists */}
          {selectedChecklist.status !== 'verified' && (
            <div className="verification-panel">
              <h4>👑 Supervisor Verification</h4>

              <div className="form-group">
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

              <button
                onClick={handleVerifyClick}
                disabled={!supervisorName.trim()}
                className="btn-verify"
              >
                <span>✍️</span>
                Confirm & Sign
              </button>

              <p className="disclaimer">
                By signing, you confirm this checklist has been physically inspected and verified.
              </p>
            </div>
          )}
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
