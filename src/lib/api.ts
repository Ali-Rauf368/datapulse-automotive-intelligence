// Production builds without VITE_API_URL call the API on the same origin
// (the single-service Render deployment).
export const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api')
).replace(/\/$/, '')

export class SessionExpiredError extends Error {}

const networkErrorMessage = `Cannot reach the DataPulse API at ${API_URL}. Check that the backend is running.`

// fetch() rejects with a browser-specific TypeError when the API is
// unreachable; turn that into a message people can act on.
export async function sendRequest(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(networkErrorMessage, { cause: error })
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null
    // Server errors carry a reference that matches the API's log line.
    const reference = response.status >= 500 ? response.headers.get('X-Request-Id') : null
    throw new Error(
      `${message || `The API responded with HTTP ${response.status}.`}${reference ? ` (reference ${reference.slice(0, 8)})` : ''}`,
    )
  }

  if (data === null) {
    throw new Error('The API returned an unexpected response.')
  }

  return data as T
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
