import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { checkBackendReachable, flushQueue } from '../offlineSync'
import { getPendingCount } from '../offlineQueue'

const Ctx = createContext({ isOnline: true, isBackendUp: true, pendingCount: 0, syncResult: null })

export function OnlineStatusProvider({ children }) {
  const [isOnline,    setIsOnline]    = useState(navigator.onLine)
  const [isBackendUp, setIsBackendUp] = useState(true)
  const [pendingCount, setPendingCount] = useState(getPendingCount)
  const [syncResult,  setSyncResult]  = useState(null)
  const wasUpRef = useRef(true)
  const checkingRef = useRef(false)

  async function check() {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      if (!navigator.onLine) { setIsOnline(false); setIsBackendUp(false); wasUpRef.current = false; return }
      setIsOnline(true)
      const up = await checkBackendReachable()
      setIsBackendUp(up)
      setPendingCount(getPendingCount())

      // Backend just came back — flush the queue
      if (up && !wasUpRef.current) {
        const result = await flushQueue()
        setPendingCount(getPendingCount())
        if (result.synced > 0 || result.errors.length > 0) setSyncResult(result)
      }
      wasUpRef.current = up
    } finally {
      checkingRef.current = false
    }
  }

  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  check() }
    const onOffline = () => { setIsOnline(false); setIsBackendUp(false); wasUpRef.current = false }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    const timer = setInterval(check, 30_000)
    check()
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(timer)
    }
  }, [])

  return (
    <Ctx.Provider value={{ isOnline, isBackendUp, pendingCount, syncResult, refreshPending: () => setPendingCount(getPendingCount()) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useOnlineStatus() { return useContext(Ctx) }
