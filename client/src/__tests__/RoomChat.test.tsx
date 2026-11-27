import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoomChat } from '../RoomChat'
import type { ChatMessage } from '../types'

const receipt: ChatMessage = { id: 1, clientMessageId: 'request', sender: 'Two', content: 'Xin chào', sentAt: '2026-11-27T00:00:00Z', round: 1, isSystem: false }
const props = () => ({ roomCode: 'ABC234', player: 'One' as const, messages: [] as ChatMessage[], connected: true, opponentConnected: true, onSend: vi.fn().mockResolvedValue(receipt) })
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Chat' }))

describe('room chat panel', () => {
  it('shows unread only for opponent messages and clears it on open', () => {
    const options = props()
    const view = render(<RoomChat {...options} />)
    view.rerender(<RoomChat {...options} messages={[receipt, { ...receipt, id: 2, sender: 'One' }]} />)
    expect(screen.getByLabelText('1 tin chưa đọc')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    expect(screen.queryByLabelText('1 tin chưa đọc')).toBeNull()
    expect(screen.getByLabelText('Tin nhắn cho đối thủ')).toBe(document.activeElement)
    fireEvent.keyDown(screen.getByLabelText('Tin nhắn cho đối thủ'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-expanded')).toBe('false')
  })
  it('sends Enter, keeps Shift+Enter as a newline, and does not submit during composition', async () => {
    const options = props()
    render(<RoomChat {...options} />)
    open()
    const input = screen.getByLabelText('Tin nhắn cho đối thủ')
    fireEvent.change(input, { target: { value: ' chào bạn ' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(options.onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(options.onSend).toHaveBeenCalledOnce())
    expect(options.onSend.mock.calls[0][1]).toBe('chào bạn')
  })
  it('retries the same request id after an error and keeps a new draft', async () => {
    const options = props()
    options.onSend.mockRejectedValueOnce(new Error('Mất mạng')).mockResolvedValue(receipt)
    render(<RoomChat {...options} />)
    open()
    const input = screen.getByLabelText('Tin nhắn cho đối thủ')
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin' }))
    await screen.findByText('Mất mạng')
    const id = options.onSend.mock.calls[0][0]
    fireEvent.change(input, { target: { value: 'second draft' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Thử gửi lại' })) })
    expect(options.onSend).toHaveBeenLastCalledWith(id, 'first')
    expect((input as HTMLTextAreaElement).value).toBe('second draft')
  })
  it('renders text safely, disables oversized and offline sends, and keeps a draft when hidden', () => {
    const options = props()
    const view = render(<RoomChat {...options} messages={[{ ...receipt, content: '<img src=x onerror=alert(1)>' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('.chat-log img')).toBeNull()
    fireEvent.change(screen.getByLabelText('Tin nhắn cho đối thủ'), { target: { value: 'a'.repeat(301) } })
    expect((screen.getByRole('button', { name: 'Gửi tin' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Tin nhắn cho đối thủ'), { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chat' }))
    open()
    expect((screen.getByLabelText('Tin nhắn cho đối thủ') as HTMLTextAreaElement).value).toBe('draft')
    view.rerender(<RoomChat {...options} connected={false} />)
    expect((screen.getByRole('button', { name: 'Gửi tin' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
