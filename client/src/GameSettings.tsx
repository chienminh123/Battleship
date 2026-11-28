import type { GamePreferences } from './useGamePreferences'
import type { GraphicsQuality } from './battlePresentation'
import { useRef, useState } from 'react'
import { useDismissOutside } from './useDismissOutside'

export function GameSettings({ preferences, onChange }: { preferences: GamePreferences; onChange: (change: Partial<GamePreferences>) => void }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  useDismissOutside(menu, open, () => { if (menu.current) menu.current.open = false; setOpen(false) })
  return <div className="game-settings">
    <button className="sound-toggle" type="button" aria-label={preferences.muted ? 'Bật âm thanh' : 'Tắt âm thanh'} aria-pressed={!preferences.muted} onClick={() => onChange({ muted: !preferences.muted })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 9H8L13 5V19L8 15H4Z" />
        {preferences.muted ? <path d="M17 9L22 15M22 9L17 15" /> : <path d="M17 8C20 10 20 14 17 16M20 5C25 9 25 15 20 19" />}
      </svg><span>{preferences.muted ? 'Tắt tiếng' : 'Âm thanh'}</span>
    </button>
    <details ref={menu} className="settings-menu" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
      </svg><span className="settings-label">Tùy chỉnh</span></summary>
      <div className="settings-panel">
        <label>Chất lượng hình ảnh<select value={preferences.quality} onChange={(event) => onChange({ quality: event.target.value as GraphicsQuality })}>
          <option value="auto">Tự động theo thiết bị</option><option value="low">Thấp · Tiết kiệm pin</option><option value="high">Cao · Nhiều hiệu ứng</option>
        </select></label>
        <label>Âm thanh hiệu ứng <output>{Math.round(preferences.effects * 100)}%</output><input aria-label="Âm lượng hiệu ứng" type="range" min="0" max="1" step=".05" value={preferences.effects} onChange={(event) => onChange({ effects: Number(event.target.value) })} /></label>
        <label>Tiếng sóng biển <output>{Math.round(preferences.sea * 100)}%</output><input aria-label="Âm lượng tiếng sóng biển" type="range" min="0" max="1" step=".01" value={preferences.sea} onChange={(event) => onChange({ sea: Number(event.target.value) })} /></label>
      </div>
    </details>
  </div>
}
