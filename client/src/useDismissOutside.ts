import { useEffect, useEffectEvent } from 'react'
import type { RefObject } from 'react'

export function useDismissOutside(ref: RefObject<HTMLElement | null>, active: boolean, dismiss: () => void) {
  const close = useEffectEvent(dismiss)
  useEffect(() => {
    if (!active) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [active, ref])
}
