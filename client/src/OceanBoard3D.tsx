import { useEffect, useRef, useState } from 'react'
import { cellName } from './coordinates'
import { createOceanScene } from './oceanScene'
import type { BattleEvent, GraphicsQuality } from './battlePresentation'
import type { Coordinate, ShipView, ShotHistoryItem } from './types'

export type OceanBoardProps = {
  ships?: ShipView[]
  shots?: ShotHistoryItem[]
  previewCells?: Coordinate[]
  previewInvalid?: boolean
  selectedCell?: Coordinate | null
  onCell?: (cell: Coordinate) => void
  onHover?: (cell: Coordinate | null) => void
  onUnavailable?: () => void
  label: string
  variant?: 'primary' | 'mini'
  quality?: GraphicsQuality
  animate?: boolean
  effect?: BattleEvent
  showWrecks?: boolean
}

export function OceanBoard3D({ ships = [], shots = [], previewCells = [], previewInvalid = false,
  selectedCell, onCell, onHover, onUnavailable, label, variant = 'primary', quality = 'auto', animate = false, effect, showWrecks = false,
}: OceanBoardProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ReturnType<typeof createOceanScene> | null>(null)
  const [cursor, setCursor] = useState<Coordinate>({ x: 0, y: 0 })
  const [rotate, setRotate] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const selected = selectedCell === undefined ? cursor : selectedCell
  const description = `${label}. ${onCell ? `Ô ${cellName(selected ?? cursor)}. Dùng mũi tên để chọn tọa độ, Enter để chọn ô.` : 'Bản đồ quan sát.'}`

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let alive = true
    try {
      const controller = createOceanScene(mount)
      controllerRef.current = controller
      return () => { alive = false; controller.dispose(); controllerRef.current = null }
    } catch {
      queueMicrotask(() => { if (alive) setUnavailable(true) })
      return () => { alive = false }
    }
  }, [attempt])

  // Sync data and event handlers without ever rebuilding the WebGL renderer.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    controller.describe(description)
    controller.sync({ ships, shots, previewCells, previewInvalid, selected, quality, mini: variant === 'mini', rotate, animate, effect, showWrecks,
      onCell: onCell ? (cell) => { setCursor(cell); onCell(cell) } : undefined,
      onHover: onHover ? (cell) => { if (cell) setCursor(cell); onHover(cell) } : undefined,
      onNavigate: setCursor,
      onContext: setUnavailable,
    })
  }, [ships, shots, previewCells, previewInvalid, selected, quality, variant, rotate, animate, effect, onCell, onHover, description, attempt, showWrecks])

  return <div className={`ocean-board ocean-${variant}`}>
    <div className="ocean-tools">
      <span>{rotate ? 'Kéo để đổi góc nhìn' : onCell ? 'Chọn ô trên biển' : 'Toàn cảnh vùng biển'}</span>
      <div><button type="button" aria-label={`Xoay góc nhìn: ${label}`} aria-pressed={rotate} onClick={() => setRotate(!rotate)}>Xoay</button>
        <button type="button" aria-label={`Góc nhìn chuẩn: ${label}`} onClick={() => { controllerRef.current?.resetCamera(); setRotate(false) }}>Góc chuẩn</button></div>
    </div>
    <div className="ocean-viewport">
      <div ref={mountRef} className="ocean-canvas" />
      {onCell && <div className="ocean-readout" aria-live="polite" aria-atomic="true">{selected ? `Đang chọn ${cellName(selected)}` : 'Chọn một tọa độ'}</div>}
      {unavailable && <div className="webgl-fallback" role="alert">
        <span>Đồ họa 3D đang gián đoạn. Bạn có thể thử lại hoặc tiếp tục với bàn cờ 2D.</span>
        <button type="button" onClick={() => { setUnavailable(false); setAttempt((value) => value + 1) }}>Thử lại 3D</button>
        <button type="button" onClick={onUnavailable}>Dùng bàn cờ 2D</button>
      </div>}
    </div>
  </div>
}
