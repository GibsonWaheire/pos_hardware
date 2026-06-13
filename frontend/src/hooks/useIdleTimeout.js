import { useEffect, useRef, useCallback } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']

/**
 * useIdleTimeout — detects user inactivity and calls onIdle/onActive.
 *
 * @param {number}   timeoutMs   - idle threshold in milliseconds (e.g. 10 * 60 * 1000)
 * @param {Function} onIdle      - called when user goes idle
 * @param {Function} onActive    - called when user returns from idle
 * @param {boolean}  enabled     - set false to disable (e.g. on login screen)
 */
export function useIdleTimeout({ timeoutMs, onIdle, onActive, enabled = true }) {
  const timerRef    = useRef(null)
  const isIdleRef   = useRef(false)
  const onIdleRef   = useRef(onIdle)
  const onActiveRef = useRef(onActive)

  // Keep refs current so closures stay fresh
  useEffect(() => { onIdleRef.current = onIdle }, [onIdle])
  useEffect(() => { onActiveRef.current = onActive }, [onActive])

  const resetTimer = useCallback(() => {
    if (!enabled) return

    if (isIdleRef.current) {
      isIdleRef.current = false
      onActiveRef.current?.()
    }

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true
      onIdleRef.current?.()
    }, timeoutMs)
  }, [timeoutMs, enabled])

  useEffect(() => {
    if (!enabled) return

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [resetTimer, enabled])
}
