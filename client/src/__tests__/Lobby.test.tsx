import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Lobby } from '../screens/Lobby'

const props = () => ({
  connected: true, busy: false, joinCode: '', setJoinCode: vi.fn(),
  threeDimensional: false, quality: 'low' as const, onBoardMode: vi.fn(),
  onCreate: vi.fn(), onBot: vi.fn(), onJoin: vi.fn(),
})

describe('bot difficulty selection', () => {
  it.each([
    ['Easy', 'Dễ'], ['Hard', 'Khó'], ['Annihilation', 'Hủy diệt'],
  ])('selects %s inside the combined play control without starting early', (value, label) => {
    const options = props()
    render(<Lobby {...options} />)
    const select = screen.getByRole('combobox', { name: 'Mức độ máy' })
    fireEvent.change(select, { target: { value } })
    expect(options.onBot).not.toHaveBeenCalled()
    expect(select.closest('.bot-setup')?.querySelector('button')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Chơi với máy ${label}` }))
    expect(options.onBot).toHaveBeenCalledExactlyOnceWith(value)
    expect(options.onCreate).not.toHaveBeenCalled()
    expect(options.onJoin).not.toHaveBeenCalled()
  })

  it.each([{ busy: true, connected: true }, { busy: false, connected: false }])(
    'disables starting and changing level while unavailable: %j', (state) => {
      const options = { ...props(), ...state }
      render(<Lobby {...options} />)
      expect((screen.getByRole('combobox', { name: 'Mức độ máy' }) as HTMLSelectElement).disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Chơi với máy Dễ' }))
      expect(options.onBot).not.toHaveBeenCalled()
    },
  )
})
