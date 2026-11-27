import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Pause decorative CSS motion whenever its surface cannot be seen. */
export function useSurfaceMotion(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const surface = ref.current
    if (!surface) return
    let visible = true
    const sync = () => { surface.dataset.seaPaused = String(document.hidden || !visible) }
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync()
    })
    observer?.observe(surface)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [ref])
}
