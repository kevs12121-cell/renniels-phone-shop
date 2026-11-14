import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../services/api'

/** Fetches `url` with `params`, refetching whenever either changes. Ignores out-of-order responses. */
export function useApi(url, params = {}, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled && url), error: '' })
  const requestId = useRef(0)
  const key = JSON.stringify([url, params])

  const reload = useCallback(async () => {
    if (!enabled || !url) return
    const id = ++requestId.current
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const cleanParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null && value !== false))
      const { data } = await api.get(url, { params: cleanParams })
      if (id === requestId.current) setState({ data, loading: false, error: '' })
      return data
    } catch (error) {
      if (id === requestId.current) setState((current) => ({ ...current, loading: false, error: errorMessage(error) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  useEffect(() => { reload() }, [reload])

  return { ...state, reload }
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}
