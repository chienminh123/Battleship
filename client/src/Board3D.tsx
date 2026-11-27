import { Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import type { OceanBoardProps } from './OceanBoard3D'

const LazyBoard = lazy(() => import('./OceanBoard3D').then((module) => ({ default: module.OceanBoard3D })))

export class BoardLoadBoundary extends Component<{ children: ReactNode; onUnavailable?: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return <div className="webgl-fallback" role="alert">
      <span>Không tải được bàn cờ 3D. Bạn có thể tiếp tục với bàn cờ 2D.</span>
      {this.props.onUnavailable && <button type="button" onClick={this.props.onUnavailable}>Dùng bàn cờ 2D</button>}
    </div>
    return this.props.children
  }
}

export function OceanBoard3D(props: OceanBoardProps) {
  return <BoardLoadBoundary onUnavailable={props.onUnavailable}>
    <Suspense fallback={<div className="ocean-loading" role="status">Đang chuẩn bị vùng biển 3D…</div>}>
      <LazyBoard {...props} />
    </Suspense>
  </BoardLoadBoundary>
}
