import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import SignaturePad from './SignaturePad'

function ChecklistForm({ checklist, team, onBack }) {
  const [items, setItems] = useState(checklist?.items || [])
  const [saved, setSaved] = useState(false)
  const [activeFlagItem, setActiveFlagItem] = useState(null)
  const [flagDescription, setFlagDescription] = useState('')
  const [completedBy, setCompletedBy] = useState(checklist?.completed_by || '')
  const [signatureData, setSignatureData] = useState(checklist?.signature_data || null)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(null)
  const [uploadingFlagPhoto, setUploadingFlagPhoto] = useState(null)
  const fileInputRefs = useRef({})
  const flagPhotoInputRefs = useRef({})

  const isExpired = checklist?.status === 'expired' || checklist?.is_expired
  const isReadOnly = isExpired || checklist?.status === 'completed' || checklist?.status === 'verified' || checklist?.status === 'resubmitted'

  // Client-side image compression
  const compressImage = (file, maxWidth = 800, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width))
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob((blob) => {
            resolve(blob)
          }, 'image/jpeg', quality)
        }
        img.onerror = reject
        img.src = e.target.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Upload photo to server
  const uploadPhoto = async (itemId, file) => {
    setUploadingPhoto(itemId)
    try {
      const compressedBlob = await compressImage(file, 800, 0.8)
      const formData = new FormData()
      formData.append('item_id', itemId)
      formData.append('photo', compressedBlob, 'photo.jpg')

      const response = await fetch(`${API_BASE}/api/upload-photo/`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setItems(prev => prev.map(item => {
          if (item.id === itemId) {
            return {
              ...item,
              photo_url: data.photo_url,
              photo_uploaded_at: data.photo_uploaded_at,
              is_checked: true,
              checked_at: new Date().toISOString()
            }
          }
          return item
        }))
        setSaved(false)
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Network error uploading photo')
    } finally {
      setUploadingPhoto(null)
    }
  }

  // Handle file input change
  const handlePhotoCapture = (itemId, event) => {
    const file = event.target.files[0]
    if (file) {
      uploadPhoto(itemId, file)
    }
    event.target.value = ''
  }

  // Clear photo from item
  const clearPhoto = (itemId) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          photo_url: null,
          photo_uploaded_at: null,
          is_checked: false,
          checked_at: null
        }
      }
      return item
    }))
    setSaved(false)
  }

  useEffect(() => {
    if (checklist?.items) {
      setItems(checklist.items)
    }
    if (checklist?.completed_by) {
      setCompletedBy(checklist.completed_by)
    }
    if (checklist?.signature_data) {
      setSignatureData(checklist.signature_data)
    }
  }, [checklist])

  const isItemComplete = (item) => {
    if (item.response_type === 'yes_no') {
      return item.response_value === 'yes' || item.response_value === 'no' || item.response_value === 'na'
    }
    if (item.response_type === 'photo') {
      return !!item.photo_url
    }
    return item.response_value && item.response_value.trim().length > 0
  }

  const setYesNoValue = (itemId, value) => {
    if (isReadOnly) return
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          response_value: value,
          is_checked: true,
          checked_at: new Date().toISOString()
        }
      }
      return item
    }))
    setSaved(false)
  }

  const updateResponseValue = (itemId, value) => {
    if (isReadOnly) return
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const hasValue = value && value.trim().length > 0
        return {
          ...item,
          response_value: value,
          is_checked: hasValue,
          checked_at: hasValue ? new Date().toISOString() : null
        }
      }
      return item
    }))
    setSaved(false)
  }

  const handleSignatureSave = (sigData) => {
    setSignatureData({
      ...sigData,
      signed_at: new Date().toISOString()
    })
    setCompletedBy(sigData.signed_by)
    setShowSignaturePad(false)
    setSaved(false)
  }

  const handleSignatureCancel = () => {
    setShowSignaturePad(false)
  }

  const clearSignature = () => {
    setSignatureData(null)
    setSaved(false)
  }

  const saveChecklist = () => {
    const allComplete = items.every(isItemComplete)
    const updatedChecklist = {
      ...checklist,
      items,
      completed_by: completedBy,
      signature_data: allComplete ? signatureData : null,
      status: allComplete && signatureData ? 'completed' : 'draft'
    }

    const pending = JSON.parse(localStorage.getItem(`pending_${team.id}`) || '[]')
    const existingIndex = pending.findIndex(p => p.id === checklist.id)

    if (existingIndex >= 0) {
      pending[existingIndex] = updatedChecklist
    } else {
      pending.push(updatedChecklist)
    }

    localStorage.setItem(`pending_${team.id}`, JSON.stringify(pending))
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onBack()
    }, 800)
  }

  const completedCount = items.filter(isItemComplete).length
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0
  const allComplete = progress === 100

  const openFlagPopup = (item) => {
    setActiveFlagItem(item.id)
    setFlagDescription(item.current_flag?.description || '')
  }

  const closeFlagPopup = () => {
    setActiveFlagItem(null)
    setFlagDescription('')
  }

  // Save flag (description) via API
  const saveFlagDescription = async () => {
    if (!activeFlagItem) return
    try {
      const response = await fetch(`${API_BASE}/api/flag-item/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: activeFlagItem, description: flagDescription })
      })
      const data = await response.json()
      if (data.flag_id) {
        setItems(prev => prev.map(item => {
          if (item.id === activeFlagItem) {
            return {
              ...item,
              current_flag: {
                id: data.flag_id,
                description: data.description,
                flagged_at: data.flagged_at,
                photo_url: data.photo_url,
                photo_uploaded_at: item.current_flag?.photo_uploaded_at || null,
                resolved_at: null,
              }
            }
          }
          return item
        }))
      }
    } catch (err) {
      console.error('Flag save error:', err)
      alert('Network error saving flag')
    }
    closeFlagPopup()
  }

  // Upload flag photo via API
  const uploadFlagPhoto = async (itemId, file) => {
    setUploadingFlagPhoto(itemId)
    try {
      const compressedBlob = await compressImage(file, 800, 0.8)
      const formData = new FormData()
      formData.append('item_id', itemId)
      formData.append('photo', compressedBlob, 'flag_photo.jpg')

      const response = await fetch(`${API_BASE}/api/upload-flag-photo/`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setItems(prev => prev.map(item => {
          if (item.id === itemId) {
            const existingFlag = item.current_flag || {}
            return {
              ...item,
              current_flag: {
                ...existingFlag,
                id: data.flag_id,
                photo_url: data.flag_photo_url,
                photo_uploaded_at: data.flag_photo_uploaded_at,
                resolved_at: null,
              }
            }
          }
          return item
        }))
      } else {
        alert('Flag photo upload failed: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Flag photo upload error:', err)
      alert('Network error uploading flag photo')
    } finally {
      setUploadingFlagPhoto(null)
    }
  }

  const handleFlagPhotoCapture = (itemId, event) => {
    const file = event.target.files[0]
    if (file) {
      uploadFlagPhoto(itemId, file)
    }
    event.target.value = ''
  }

const activeFlagItemData = items.find(i => i.id === activeFlagItem)

  const renderFlagButton = (item) => {
    if (isReadOnly && !item.current_flag) return null
    const flagStatus = item.current_flag?.status
    const flagColor = flagStatus === 'acknowledged' ? '#22c55e' : flagStatus === 'active' ? '#ef4444' : undefined
    return (
      <button
        type="button"
        onClick={() => openFlagPopup(item)}
        title={item.current_flag ? (flagStatus === 'acknowledged' ? 'Acknowledged flag' : 'View flag') : 'Flag this item'}
        className={`btn-note ${item.current_flag ? 'has-note' : ''}`}
        style={{ marginLeft: '4px', color: flagColor }}
      >
        🚩
      </button>
    )
  }

  const renderResponseInput = (item, index) => {
    const isComplete = isItemComplete(item)

    if (item.response_type === 'yes_no') {
      return (
        <div className="item-controls">
          <button
            onClick={() => setYesNoValue(item.id, 'yes')}
            disabled={isReadOnly}
            className={`btn-response yes ${item.response_value === 'yes' ? 'selected' : ''}`}
          >
            ✓ Yes
          </button>
          <button
            onClick={() => setYesNoValue(item.id, 'no')}
            disabled={isReadOnly}
            className={`btn-response no ${item.response_value === 'no' ? 'selected' : ''}`}
          >
            ✗ No
          </button>
          <button
            onClick={() => setYesNoValue(item.id, 'na')}
            disabled={isReadOnly}
            className={`btn-response na ${item.response_value === 'na' ? 'selected' : ''}`}
          >
            N/A
          </button>
          {renderFlagButton(item)}
        </div>
      )
    }

    if (item.response_type === 'number') {
      return (
        <div className="item-controls">
          <input
            type="number"
            value={item.response_value || ''}
            onChange={(e) => updateResponseValue(item.id, e.target.value)}
            placeholder="Enter number..."
            disabled={isReadOnly}
            className={`item-input ${isComplete ? 'complete' : ''}`}
          />
          {renderFlagButton(item)}
        </div>
      )
    }

    if (item.response_type === 'text') {
      return (
        <div className="item-controls">
          <input
            type="text"
            value={item.response_value || ''}
            onChange={(e) => updateResponseValue(item.id, e.target.value)}
            placeholder="Enter value..."
            disabled={isReadOnly}
            className={`item-input ${isComplete ? 'complete' : ''}`}
          />
          {renderFlagButton(item)}
        </div>
      )
    }

    if (item.response_type === 'photo') {
      return (
        <div className="item-controls photo-controls">
          <input
            type="file"
            ref={el => fileInputRefs.current[item.id] = el}
            accept="image/*"
            capture="environment"
            onChange={(e) => handlePhotoCapture(item.id, e)}
            disabled={isReadOnly || uploadingPhoto === item.id}
            style={{ display: 'none' }}
          />
          {item.photo_url ? (
            <div className="photo-preview-inline">
              <img src={item.photo_url} alt="Captured" />
              {!isReadOnly && (
                <button
                  onClick={() => fileInputRefs.current[item.id]?.click()}
                  disabled={uploadingPhoto === item.id}
                  className="btn-photo-retake"
                >
                  {uploadingPhoto === item.id ? '⏳' : '📷 Retake'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileInputRefs.current[item.id]?.click()}
              disabled={isReadOnly || uploadingPhoto === item.id}
              className="btn-photo-capture"
            >
              {uploadingPhoto === item.id ? '⏳ Uploading...' : '📷 Take Photo'}
            </button>
          )}
          {renderFlagButton(item)}
        </div>
      )
    }

    return null
  }

  const formatDeadline = (deadline) => {
    if (!deadline) return null
    const date = new Date(deadline)
    return date.toLocaleString()
  }

  const getTimeLeft = (deadline) => {
    if (!deadline) return null
    const now = new Date()
    const end = new Date(deadline)
    const diff = end - now
    if (diff <= 0) return 'Expired'
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    if (hours > 0) return `${hours}h ${minutes}m left`
    return `${minutes}m left`
  }

  return (
    <div className="checklist-form">
      {/* Header */}
      <div className="form-header">
        <button onClick={onBack} className="btn-back">← Back</button>
        <div className="form-header-title">
          <h2>{checklist.template_title}</h2>
          <p className="date-label">{checklist.date_label}</p>
        </div>
      </div>

      {/* Expired Banner */}
      {isExpired && (
        <div className="deadline-banner expired">
          <div className="deadline-row">
            <div className="deadline-main">
              <span>⚠️</span>
              <span>Checklist Expired</span>
            </div>
          </div>
          <p className="deadline-sub">
            This checklist can no longer be completed.
            {checklist.deadline && <span> Deadline was {formatDeadline(checklist.deadline)}</span>}
          </p>
        </div>
      )}

      {/* Rejection Banner */}
      {checklist?.status === 'rejected' && (
        <div className="deadline-banner expired">
          <div className="deadline-row">
            <div className="deadline-main">
              <span>⚠️</span>
              <span>Checklist Rejected</span>
            </div>
          </div>
          <p className="deadline-sub">
            This checklist was rejected. Please review the supervisor comments below and resubmit.
          </p>
        </div>
      )}

      {/* Deadline Info (if not expired) */}
      {!isExpired && checklist.deadline && checklist.status !== 'completed' && checklist.status !== 'verified' && (
        <div className="deadline-banner">
          <div className="deadline-row">
            <div className="deadline-main">
              <span>⏰</span>
              <span>Deadline: {formatDeadline(checklist.deadline)}</span>
            </div>
            <span className="deadline-time">{getTimeLeft(checklist.deadline)}</span>
          </div>
          <p className="deadline-sub">Validity: {checklist.template_validity_hours || 3} hours from scheduled time</p>
        </div>
      )}

      {/* Progress */}
      <div className="progress-section">
        <div className="progress-header">
          <div className="progress-label">
            <span>{allComplete ? '✅' : '📝'}</span>
            <span>{allComplete ? 'All items complete' : 'Checklist Progress'}</span>
          </div>
          <div className={`progress-percent ${allComplete ? 'complete' : ''}`}>
            {Math.round(progress)}%
          </div>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${allComplete ? 'complete' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="progress-footer">
          <span>{completedCount} of {items.length} items</span>
          <span>{items.length - completedCount} remaining</span>
        </div>
        {allComplete && !signatureData && (
          <div className="progress-hint">
            <span>👇</span>
            <span>Sign below to complete</span>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="items-list">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`item-row ${isItemComplete(item) ? 'complete' : ''}`}
          >
            <div className="item-main">
              <span className="item-number">{index + 1}</span>
              <p className="item-text">
                {item.item_text}
                {!!item.current_flag && <span style={{ marginLeft: '6px' }}>🚩</span>}
              </p>
            </div>
            {renderResponseInput(item, index)}
            {item.supervisor_confirmed === false && item.supervisor_comment && (
              <div style={{
                margin: '6px 0 2px',
                padding: '6px 10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#ef4444'
              }}>
                ⚠ Supervisor: {item.supervisor_comment}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Flag Modal */}
      {activeFlagItemData && (
        <div className="modal-overlay" onClick={closeFlagPopup}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🚩 Flag Item</h3>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>{activeFlagItemData.item_text}</p>
            <textarea
              value={flagDescription}
              onChange={(e) => setFlagDescription(e.target.value)}
              placeholder="Describe the issue..."
              autoFocus
              readOnly={isReadOnly}
              style={isReadOnly ? { background: '#f5f5f5', color: '#555' } : {}}
            />

            {/* Flag photo section */}
            <div style={{ marginTop: '12px' }}>
              {!isReadOnly && (
                <input
                  type="file"
                  ref={el => flagPhotoInputRefs.current[activeFlagItemData.id] = el}
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleFlagPhotoCapture(activeFlagItemData.id, e)}
                  disabled={uploadingFlagPhoto === activeFlagItemData.id}
                  style={{ display: 'none' }}
                />
              )}
              {activeFlagItemData.current_flag?.photo_url ? (
                <div style={{ marginBottom: '8px' }}>
                  <img
                    src={activeFlagItemData.current_flag.photo_url}
                    alt="Flag evidence"
                    style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '6px' }}
                  />
                  {!isReadOnly && (
                    <button
                      onClick={() => flagPhotoInputRefs.current[activeFlagItemData.id]?.click()}
                      disabled={uploadingFlagPhoto === activeFlagItemData.id}
                      className="btn-secondary"
                      style={{ marginTop: '6px', width: '100%' }}
                    >
                      {uploadingFlagPhoto === activeFlagItemData.id ? '⏳ Uploading...' : '📷 Retake Photo'}
                    </button>
                  )}
                </div>
              ) : (
                !isReadOnly && (
                  <button
                    onClick={() => flagPhotoInputRefs.current[activeFlagItemData.id]?.click()}
                    disabled={uploadingFlagPhoto === activeFlagItemData.id}
                    className="btn-secondary"
                    style={{ width: '100%', marginBottom: '8px' }}
                  >
                    {uploadingFlagPhoto === activeFlagItemData.id ? '⏳ Uploading...' : '📷 Add Photo Evidence'}
                  </button>
                )
              )}
            </div>

            {isReadOnly && activeFlagItemData.current_flag?.status === 'acknowledged' && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', color: '#16a34a' }}>
                Acknowledged by <strong>{activeFlagItemData.current_flag.acknowledged_by}</strong>
                {activeFlagItemData.current_flag.acknowledged_at && (
                  <span> on {new Date(activeFlagItemData.current_flag.acknowledged_at).toLocaleString()}</span>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={closeFlagPopup} className="btn-secondary">Close</button>
              {!isReadOnly && (
                <button
                  onClick={saveFlagDescription}
                  className="btn-save"
                  style={{ width: 'auto', padding: '8px 20px' }}
                >
                  Save Flag
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signature Section */}
      {allComplete && !isReadOnly && (
        <div className="signature-section">
          <h3>✍️ Sign Off</h3>
          <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0' }}>
            All items complete. Please sign to confirm completion.
          </p>

          {!signatureData ? (
            <button onClick={() => setShowSignaturePad(true)} className="btn-signature">
              <span>✍️</span>
              <span>Tap to Sign</span>
            </button>
          ) : (
            <div>
              <div className="signature-preview">
                <img src={signatureData.image_data} alt="Signature" />
                <div className="signature-meta">
                  Signed by: <strong>{signatureData.signed_by}</strong>
                  {signatureData.signed_at && (
                    <span> on {new Date(signatureData.signed_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <div className="signature-actions">
                <button onClick={() => setShowSignaturePad(true)} className="btn-secondary">Edit</button>
                <button onClick={clearSignature} className="btn-secondary btn-danger">Clear</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="modal-overlay">
          <SignaturePad
            onSave={handleSignatureSave}
            onCancel={handleSignatureCancel}
            defaultSignature={signatureData?.image_data}
            signedBy={signatureData?.signed_by || completedBy}
          />
        </div>
      )}

      {/* Save Button */}
      {!isReadOnly && (
        <div className="form-actions">
          <button
            onClick={saveChecklist}
            className={`btn-save ${saved ? 'saved' : ''}`}
          >
            {saved ? '✓ Saved!' : 'Save Checklist'}
          </button>
        </div>
      )}
    </div>
  )
}

export default ChecklistForm
