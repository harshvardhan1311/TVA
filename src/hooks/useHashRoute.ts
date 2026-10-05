import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal hash router.
 *
 * TVA ships as a static bundle with a relative base path, so hash routing is
 * the only scheme that survives both `file://` and an arbitrary sub-directory
 * on a static host without server rewrites.
 */
function readHash(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const h = window.location.hash.replace(/^#\/?/, '').trim()
  return h || fallback
}

export function useHashRoute(fallback: string): [string, (next: string) => void] {
  const [route, setRoute] = useState<string>(() => readHash(fallback))

  useEffect(() => {
    const onHash = () => setRoute(readHash(fallback))
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.replace(`#/${fallback}`)
    return () => window.removeEventListener('hashchange', onHash)
  }, [fallback])

  const navigate = useCallback((next: string) => {
    if (window.location.hash === `#/${next}`) return
    window.location.hash = `#/${next}`
  }, [])

  return [route, navigate]
}

export function href(route: string): string {
  return `#/${route}`
}
