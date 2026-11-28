import { useEffect, useRef, useState } from 'react'
import { effectDuration } from './battlePresentation'
import type { BattleEvent } from './battlePresentation'
import { battleSound } from './battleSound'

// Both players may fire quickly. Present network events in order so a sinking
// ship finishes before the camera switches to the return shot.
// With `holdMs`, each non-final shot keeps its board on screen a little longer
// after the effect (`heldEvent`), so a single-board (phone) layout does not swap
// boards the instant the effect ends; the next event waits for the hold.
export function useBattleTimeline(events: BattleEvent[], holdMs = 0) {
  const [completed, setCompleted] = useState(0)
  const [active, setActive] = useState<BattleEvent | null>(null)
  const [held, setHeld] = useState<BattleEvent | null>(null)
  // Read at event start so rotating the phone mid-shot does not replay it.
  const hold = useRef(holdMs)
  useEffect(() => { hold.current = holdMs }, [holdMs])
  const next = events.find((event) => event.id > completed)
  useEffect(() => {
    if (!next) return
    const effect = effectDuration(next.shot)
    const pause = next.shot.status === 'Won' ? 0 : hold.current
    const start = window.setTimeout(() => { setActive(next); battleSound.shot(next.shot.status) }, 0)
    const linger = pause ? window.setTimeout(() => { setActive(null); setHeld(next) }, effect) : undefined
    const finish = window.setTimeout(() => { setActive(null); setHeld(null); setCompleted(next.id) }, effect + pause)
    return () => { clearTimeout(start); clearTimeout(linger); clearTimeout(finish) }
  }, [next])
  return {
    activeEvent: active && events.includes(active) ? active : undefined,
    heldEvent: held && events.includes(held) ? held : undefined,
    presenting: Boolean(next),
  }
}
