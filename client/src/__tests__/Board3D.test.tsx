import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BoardLoadBoundary } from '../Board3D'

function BrokenBoard(): never { throw new Error('Failed to load dynamically imported board') }

describe('3D chunk failure recovery', () => {
  it('offers an accessible 2D fallback when a lazy render fails', () => {
    const fallback = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<BoardLoadBoundary onUnavailable={fallback}><BrokenBoard /></BoardLoadBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('Không tải được bàn cờ 3D')
    fireEvent.click(screen.getByRole('button', { name: 'Dùng bàn cờ 2D' }))
    expect(fallback).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
