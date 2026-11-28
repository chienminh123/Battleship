import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GameSettings } from '../GameSettings'

it('dismisses settings outside or with Escape while keeping inner controls usable', async () => {
  const onChange = vi.fn()
  render(<GameSettings preferences={{ muted: false, effects: .65, sea: .18, quality: 'auto' }} onChange={onChange} />)
  const summary = screen.getByText('Tùy chỉnh'), menu = summary.closest('details')!
  fireEvent.click(summary)
  await waitFor(() => expect(menu.open).toBe(true))
  fireEvent.pointerDown(screen.getByRole('slider', { name: 'Âm lượng tiếng sóng biển' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Âm lượng tiếng sóng biển' }), { target: { value: '.3' } })
  expect(onChange).toHaveBeenCalledWith({ sea: .3 })
  expect(menu.open).toBe(true)
  fireEvent.pointerDown(document.body)
  await waitFor(() => expect(menu.open).toBe(false))
  fireEvent.click(summary)
  await waitFor(() => expect(menu.open).toBe(true))
  fireEvent.keyDown(document.body, { key: 'Escape' })
  await waitFor(() => expect(menu.open).toBe(false))
})
