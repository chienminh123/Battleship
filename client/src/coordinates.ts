import type { Coordinate } from './types'

export const letters = 'ABCDEFGHIJ'.split('')
export const cellKey = (cell: Coordinate) => `${cell.x},${cell.y}`
export const cellName = (cell: Coordinate) => `${letters[cell.x]}${cell.y + 1}`
