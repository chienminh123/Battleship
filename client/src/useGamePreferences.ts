import { useState } from 'react'
import type { GraphicsQuality } from './battlePresentation'

export type GamePreferences = { muted: boolean; effects: number; sea: number; quality: GraphicsQuality }
const defaults: GamePreferences = { muted: false, effects: .65, sea: .18, quality: 'auto' }

export function useGamePreferences() {
  const [preferences, setPreferences] = useState<GamePreferences>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('battleship-preferences') ?? '{}')
      return {
        muted: typeof value.muted === 'boolean' ? value.muted : defaults.muted,
        effects: typeof value.effects === 'number' && value.effects >= 0 && value.effects <= 1 ? value.effects : defaults.effects,
        sea: typeof value.sea === 'number' && value.sea >= 0 && value.sea <= 1 ? value.sea : defaults.sea,
        quality: ['auto', 'low', 'high'].includes(value.quality) ? value.quality : defaults.quality,
      }
    } catch { return defaults }
  })
  const update = (change: Partial<GamePreferences>) => setPreferences((current) => {
    const next = { ...current, ...change }
    try { localStorage.setItem('battleship-preferences', JSON.stringify(next)) } catch { /* Session settings still work. */ }
    return next
  })
  return { preferences, update }
}
