import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, PlayerId } from './types'
import './RoomChat.css'

type Pending = { id: string; content: string; failed?: string }
type Props = {
  roomCode: string; player: PlayerId; messages: ChatMessage[]; connected: boolean; opponentConnected: boolean
  onSend: (requestId: string, content: string) => Promise<ChatMessage>
}
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`

export function RoomChat({ roomCode, player, messages, connected, opponentConnected, onSend }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [sending, setSending] = useState(false)
  const [lastRead, setLastRead] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const log = useRef<HTMLUListElement>(null)
  const messagesRef = useRef(messages)
  const latestId = messages.at(-1)?.id ?? 0
  const unread = open ? 0 : messages.filter((message) => message.id > lastRead && !message.isSystem && message.sender !== player).length
  const length = Array.from(draft.trim()).length

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    if (!open) return
    input.current?.focus()
  }, [open])
  useEffect(() => {
    if (open) {
      setLastRead(latestId)
      const element = log.current
      if (element) element.scrollTop = element.scrollHeight
    }
  }, [open, latestId, pending])

  const close = () => { setOpen(false); toggle.current?.focus() }
  const send = async (item?: Pending) => {
    if (sending || !connected || (!item && (length === 0 || length > 300))) return
    const message = item ?? { id: requestId(), content: draft.trim() }
    setSending(true)
    if (!item) setDraft('')
    setPending((current) => [...current.filter((value) => value.id !== message.id), { ...message, failed: undefined }])
    try {
      await onSend(message.id, message.content)
      setPending((current) => current.filter((value) => value.id !== message.id))
    } catch (error) {
      const acknowledged = messagesRef.current.some((value) => value.sender === player && value.clientMessageId === message.id)
      setPending((current) => acknowledged ? current.filter((value) => value.id !== message.id)
        : current.map((value) => value.id === message.id ? { ...value, failed: error instanceof Error ? error.message : 'Chưa gửi được. Hãy thử lại.' } : value))
    } finally { setSending(false) }
  }

  return <aside className="room-chat" aria-label="Chat trong phòng" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    {open && <section id="room-chat-panel" className="room-chat-panel" aria-labelledby="room-chat-title">
      <header className="chat-header"><div><h2 id="room-chat-title">Chat trong phòng</h2><p>Phòng {roomCode} · {connected ? opponentConnected ? 'Đối thủ đang online' : 'Đang chờ đối thủ' : 'Đang kết nối lại…'}</p></div>
        <button type="button" onClick={close} aria-label="Đóng chat">Đóng</button></header>
      <ul ref={log} className="chat-log" role="log" aria-label="Tin nhắn trong phòng" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <li className="chat-empty">Gửi lời chào cho đối thủ. Lịch sử giữ 100 tin gần nhất trong phòng.</li>}
        {messages.map((message) => <li key={message.id} className={message.isSystem ? 'chat-system' : `chat-message${message.sender === player ? ' chat-own' : ''}`}>
          {message.isSystem ? message.content : <><div className="chat-meta"><strong>{message.sender === player ? 'Bạn' : 'Đối thủ'}</strong><time dateTime={message.sentAt}>{timeLabel(message.sentAt)}</time></div><p>{message.content}</p></>}
        </li>)}
        {pending.filter((item) => !messages.some((message) => message.sender === player && message.clientMessageId === item.id)).map((item) => <li key={item.id} className="chat-message chat-own chat-pending"><p>{item.content}</p>
          {item.failed ? <><span className="chat-error" role="alert">{item.failed}</span><button type="button" disabled={!connected || sending} onClick={() => void send(item)}>Thử gửi lại</button><button type="button" onClick={() => setPending((current) => current.filter((value) => value.id !== item.id))}>Bỏ tin</button></> : <span role="status">Đang gửi…</span>}
        </li>)}
      </ul>
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <label htmlFor="room-chat-draft">Tin nhắn cho đối thủ</label>
        <textarea ref={input} id="room-chat-draft" value={draft} rows={3} aria-describedby="room-chat-hint" placeholder="Nhập lời nhắn…"
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
          }} />
        <div className="chat-compose-actions"><span id="room-chat-hint" className={length > 300 ? 'chat-error' : ''}>{length}/300 · Shift+Enter xuống dòng</span>
          <button type="submit" disabled={!connected || sending || length === 0 || length > 300}>Gửi tin</button></div>
      </form>
    </section>}
    <button ref={toggle} type="button" className="chat-toggle" aria-expanded={open} aria-controls="room-chat-panel" onClick={() => setOpen((current) => !current)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a7 7 0 0 1-7 7H7l-4 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z" /></svg>
      {open ? 'Ẩn chat' : 'Chat'}{unread > 0 && <span className="chat-unread" aria-label={`${unread} tin chưa đọc`}>{unread}</span>}
    </button>
  </aside>
}
