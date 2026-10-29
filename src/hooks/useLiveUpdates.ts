import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../lib/api.ts'

export type LiveChange = {
  id: number
  action: string
  summary: string
  actor: string | null
}

type Options = {
  token: string
  currentEmail: string
  onChange: () => void
}

// Subscribes to the API's change stream. Every change triggers a (debounced)
// reload; changes made by other people also raise a notification.
export function useLiveUpdates({ token, currentEmail, onChange }: Options) {
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState<LiveChange[]>([])
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const source = new EventSource(`${API_URL}/events?token=${encodeURIComponent(token)}`)
    let reloadTimer = 0
    let nextId = 0

    source.addEventListener('ready', () => setConnected(true))
    source.onerror = () => setConnected(false)

    source.addEventListener('change', (event) => {
      const change = JSON.parse((event as MessageEvent<string>).data) as Omit<LiveChange, 'id'>

      window.clearTimeout(reloadTimer)
      reloadTimer = window.setTimeout(() => onChangeRef.current(), 300)

      if (change.actor === currentEmail) return

      const id = ++nextId
      setNotifications((current) => [...current.slice(-3), { ...change, id }])
      window.setTimeout(() => {
        setNotifications((current) => current.filter((item) => item.id !== id))
      }, 6000)
    })

    return () => {
      window.clearTimeout(reloadTimer)
      source.close()
    }
  }, [token, currentEmail])

  const dismiss = (id: number) => setNotifications((current) => current.filter((item) => item.id !== id))

  return { connected, notifications, dismiss }
}
