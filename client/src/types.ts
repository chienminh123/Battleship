export type PlayerId = 'One' | 'Two'
export type BotDifficulty = 'Easy' | 'Hard' | 'Annihilation'
export type GamePhase = 'WaitingForOpponent' | 'Placing' | 'Playing' | 'Finished'
export type ShipType = 'Carrier' | 'Battleship' | 'Cruiser' | 'Submarine' | 'Destroyer'
export type Orientation = 'Horizontal' | 'Vertical'
export type GameShotStatus =
  | 'Miss'
  | 'Hit'
  | 'Sunk'
  | 'Won'
  | 'NotYourTurn'
  | 'GameNotReady'
  | 'GameFinished'
  | 'OutOfBounds'
  | 'AlreadyFired'

export type Coordinate = { x: number; y: number }
export type ChatMessage = {
  id: number; clientMessageId?: string | null; sender?: PlayerId | null; content: string
  sentAt: string; round: number; isSystem: boolean
}
export type ChatEnvelope = { roomCode: string; message: ChatMessage }
export type FleetPlacement = { type: ShipType; start: Coordinate; orientation: Orientation }
export type FleetPlacementDto = FleetPlacement

export type ShipView = {
  type: ShipType
  cells: Coordinate[]
  hits: Coordinate[]
  isSunk: boolean
}

export type BoardView = { ships: ShipView[]; incomingShots: Coordinate[] }
export type ShotHistoryItem = { coordinate: Coordinate; status: GameShotStatus; sunkShip?: ShipType; sunkCells?: Coordinate[] }

export type CreateRoomResponse = { code: string; playerToken: string; player: PlayerId }
export type JoinRoomResponse = {
  isBot: boolean
  botDifficulty?: BotDifficulty | null
  chatMessages?: ChatMessage[] | null
  matchId?: string
  mode?: 'Bot' | 'Friendly' | 'Ranked'
  turnDeadlineUtc?: string | null
  placementDeadlineUtc?: string | null
  code: string
  playerToken: string
  player: PlayerId
  phase: GamePhase
  currentPlayer?: PlayerId
  isYourTurn: boolean
  opponentConnected: boolean
  ownFleetSubmitted: boolean
  opponentFleetSubmitted: boolean
  ownBoard: BoardView
  shotsAgainstOpponent: ShotHistoryItem[]
  shotsAgainstYou: ShotHistoryItem[]
  result?: GameOverMessage
}
export type SubmitFleetResponse = {
  ownBoard?: BoardView
  accepted: boolean
  phase: GamePhase
  error?: string
  errors?: { code: string; shipType?: ShipType; coordinate?: Coordinate }[]
}
export type FireResponse = {
  accepted: boolean
  status: GameShotStatus
  coordinate: Coordinate
  sunkShip?: ShipType
  winner?: PlayerId
  sunkCells?: Coordinate[]
}
export type GameOverMessage = { winner: PlayerId; opponentFleet: ShipView[]; reason?: string | null }

export const fleetSpecs: { type: ShipType; length: number; mark: string }[] = [
  { type: 'Carrier', length: 5, mark: 'CV' },
  { type: 'Battleship', length: 4, mark: 'BS' },
  { type: 'Cruiser', length: 3, mark: 'CR' },
  { type: 'Submarine', length: 3, mark: 'SU' },
  { type: 'Destroyer', length: 2, mark: 'DE' },
]

export const shipLength = (type: ShipType) => fleetSpecs.find((ship) => ship.type === type)?.length ?? 0

export const makeDefaultFleet = (): FleetPlacement[] => [
  { type: 'Carrier', start: { x: 0, y: 0 }, orientation: 'Horizontal' },
  { type: 'Battleship', start: { x: 0, y: 2 }, orientation: 'Horizontal' },
  { type: 'Cruiser', start: { x: 0, y: 4 }, orientation: 'Horizontal' },
  { type: 'Submarine', start: { x: 0, y: 6 }, orientation: 'Horizontal' },
  { type: 'Destroyer', start: { x: 0, y: 8 }, orientation: 'Horizontal' },
]

export const sameCoordinate = (a: Coordinate, b: Coordinate) => a.x === b.x && a.y === b.y
