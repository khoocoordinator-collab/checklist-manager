import { useRef, useState, useEffect } from 'react'

function SignaturePad({ onSave, onCancel, defaultSignature = null, signedBy = '', title = 'Sign to Confirm' }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [signatureName, setSignatureName] = useState(signedBy)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2  // Retina support
    canvas.height = rect.height * 2
    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)

    // Set up drawing style - white ink on dark canvas
    ctx.strokeStyle = '#f0f4f8'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Load existing signature if provided
    if (defaultSignature) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        setHasDrawing(true)
      }
      img.src = defaultSignature
    }
  }, [defaultSignature])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e)

    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
    setHasDrawing(true)
  }

  const draw = (e) => {
    e.preventDefault()
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e)

    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasDrawing(false)
  }

  const handleSave = () => {
    if (!hasDrawing || !signatureName.trim()) return

    const canvas = canvasRef.current
    const imageData = canvas.toDataURL('image/png')
    onSave({
      image_data: imageData,
      signed_by: signatureName.trim()
    })
  }

  return (
    <div style={{
      background: '#1a2235',
      padding: '24px',
      borderRadius: '16px',
      minWidth: '340px',
      maxWidth: '90vw',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)'
    }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#f0f4f8', letterSpacing: '-0.025em' }}>
        {title}
      </h3>

      <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '13px' }}>
        Please sign below with your finger or mouse
      </p>

      <div style={{
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        background: '#0d1320',
        touchAction: 'none',
        cursor: 'crosshair'
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            width: '100%',
            height: '180px',
            display: 'block',
            borderRadius: '6px'
          }}
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#f0f4f8', fontSize: '13px' }}>
          Your Name:
        </label>
        <input
          type="text"
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
          placeholder="Enter your full name..."
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box',
            background: '#0d1320',
            color: '#f0f4f8'
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        gap: '10px',
        marginTop: '20px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={clear}
          disabled={!hasDrawing}
          style={{
            padding: '10px 16px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            background: '#1a2235',
            color: '#94a3b8',
            cursor: hasDrawing ? 'pointer' : 'not-allowed',
            opacity: hasDrawing ? 1 : 0.5,
            fontSize: '13px'
          }}
        >
          Clear
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 16px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            background: '#1a2235',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!hasDrawing || !signatureName.trim()}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '6px',
            background: hasDrawing && signatureName.trim() ? '#22c55e' : 'rgba(255,255,255,0.1)',
            color: hasDrawing && signatureName.trim() ? 'white' : '#64748b',
            cursor: hasDrawing && signatureName.trim() ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: hasDrawing && signatureName.trim() ? '0 0 16px rgba(34,197,94,0.3)' : 'none',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          Save Signature
        </button>
      </div>
    </div>
  )
}

export default SignaturePad
