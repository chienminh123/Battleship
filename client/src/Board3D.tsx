import { lazy, Suspense } from 'react'
import type { OceanBoardProps } from './OceanBoard3D'

const LazyBoard = lazy(() => import('./OceanBoard3D').then((module) => ({ default: module.OceanBoard3D })))

export function OceanBoard3D(props: OceanBoardProps) {
  return <Suspense fallback={<div className="ocean-loading" role="status">Đang chuẩn bị vùng biển 3D…</div>}>
    <LazyBoard {...props} />
  </Suspense>
}
