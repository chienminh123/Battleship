import { useEffect, useRef } from 'react'

export function MatchExitDialog({ surrender, playing, onCancel, onConfirm }: {
  surrender: boolean; playing: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={dialog} className="match-exit-dialog" aria-labelledby="match-exit-title"
    aria-describedby="match-exit-description" onCancel={(event) => { event.preventDefault(); onCancel() }}>
    <h2 id="match-exit-title">{surrender ? 'Đầu hàng?' : 'Rời trận?'}</h2>
    <p id="match-exit-description">{surrender ? 'Bạn sẽ nhận kết quả thua ván này.' : playing
      ? 'Rời trận lúc này sẽ tính là đầu hàng.' : 'Bạn sẽ trở về sảnh.'}</p>
    <div className="match-exit-actions">
      <button className="secondary-action" autoFocus onClick={onCancel}>Ở lại</button>
      <button className="primary-action" onClick={onConfirm}>{surrender ? 'Đầu hàng' : 'Rời trận'}</button>
    </div>
  </dialog>
}
