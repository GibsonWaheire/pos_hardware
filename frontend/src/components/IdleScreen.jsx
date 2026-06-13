import { useState, useEffect } from 'react'

export default function IdleScreen({ storeName, onDismiss }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div
      className="pos-attract"
      onClick={onDismiss}
      onKeyDown={onDismiss}
      tabIndex={0}
    >
      <div className="pos-attract-time">{timeStr}</div>
      <div className="pos-attract-date">{dateStr}</div>
      <div className="pos-attract-store">{storeName || 'Hardware Store'}</div>
      <div className="pos-attract-tap">Tap anywhere to continue</div>
    </div>
  )
}
