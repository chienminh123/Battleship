import { useEffect, useState } from 'react'
import { effectDuration } from './battlePresentation'
import type { BattleEvent } from './battlePresentation'
import { battleSound } from './battleSound'

// Both players may fire quickly. Present network events in order so a sinking
// ship finishes before the camera switches to the return shot.
export function useBattleTimeline(events: BattleEvent[]) {
  const [completed, setCompleted] = useState(0)
  const [active, setActive] = useState<BattleEvent | null>(null)
  const next = events.find((event) => event.id > completed)
  useEffect(() => {
    if (!next) return
    const start = window.setTimeout(() => { setActive(next); battleSound.shot(next.shot.status) }, 0)
    const finish = window.setTimeout(() => { setActive(null); setCompleted(next.id) }, effectDuration(next.shot))
    return () => { clearTimeout(start); clearTimeout(finish) }
  }, [next])
  return { activeEvent: active && events.includes(active) ? active : undefined, presenting: Boolean(next) }
}
