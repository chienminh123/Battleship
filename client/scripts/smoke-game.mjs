import assert from 'node:assert/strict'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const serverUrl = process.env.BATTLESHIP_HUB_URL ?? 'http://localhost:8181/hub/game'
const clients = []

function connect() {
  const client = new HubConnectionBuilder()
    .withUrl(serverUrl)
    .configureLogging(LogLevel.Error)
    .build()
  clients.push(client)
  return client
}

function expectEvent(client, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(eventName, handler)
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, 5000)
    const handler = (payload) => {
      clearTimeout(timer)
      client.off(eventName, handler)
      resolve(payload)
    }
    client.on(eventName, handler)
  })
}

function makeFleet() {
  return [
    { type: 'Carrier', start: { x: 0, y: 0 }, orientation: 'Horizontal' },
    { type: 'Battleship', start: { x: 0, y: 1 }, orientation: 'Horizontal' },
    { type: 'Cruiser', start: { x: 0, y: 2 }, orientation: 'Horizontal' },
    { type: 'Submarine', start: { x: 0, y: 3 }, orientation: 'Horizontal' },
    { type: 'Destroyer', start: { x: 0, y: 4 }, orientation: 'Horizontal' },
  ]
}

function makeSecondFleet() {
  return [
    { type: 'Carrier', start: { x: 9, y: 0 }, orientation: 'Vertical' },
    { type: 'Battleship', start: { x: 8, y: 0 }, orientation: 'Vertical' },
    { type: 'Cruiser', start: { x: 7, y: 0 }, orientation: 'Vertical' },
    { type: 'Submarine', start: { x: 6, y: 0 }, orientation: 'Vertical' },
    { type: 'Destroyer', start: { x: 5, y: 0 }, orientation: 'Vertical' },
  ]
}

function fleetCells(fleet) {
  const lengths = { Carrier: 5, Battleship: 4, Cruiser: 3, Submarine: 3, Destroyer: 2 }
  return fleet.flatMap((ship) => Array.from({ length: lengths[ship.type] }, (_, offset) => ({
    x: ship.start.x + (ship.orientation === 'Horizontal' ? offset : 0),
    y: ship.start.y + (ship.orientation === 'Vertical' ? offset : 0),
  })))
}

try {
  const firstFleet = makeFleet()
  const secondFleet = makeSecondFleet()
  const first = connect()
  const second = connect()
  await Promise.all([first.start(), second.start()])

  const created = await first.invoke('CreateRoom')
  const joined = await second.invoke('JoinRoom', created.code, null)
  assert.equal(joined.player, 'Two')
  assert.equal(joined.phase, 'Placing')

  const invalidFleet = firstFleet.map((ship) => ({ ...ship }))
  invalidFleet[1] = { ...invalidFleet[1], start: { ...invalidFleet[0].start } }
  const rejected = await first.invoke('SubmitFleet', invalidFleet)
  assert.equal(rejected.accepted, false)

  const ready = await first.invoke('SubmitFleet', firstFleet)
  assert.equal(ready.accepted, true)
  const started = await second.invoke('SubmitFleet', secondFleet)
  assert.equal(started.phase, 'Playing')

  const outOfTurn = await second.invoke('Fire', 9, 9)
  assert.equal(outOfTurn.status, 'NotYourTurn')

  const firstIncoming = expectEvent(second, 'IncomingShot')
  const firstResult = expectEvent(first, 'ShotResult')
  const openingMiss = await first.invoke('Fire', 9, 9)
  assert.equal(openingMiss.status, 'Miss')
  assert.equal((await firstResult).status, 'Miss')
  assert.equal((await firstIncoming).coordinate.x, 9)

  const secondIncoming = expectEvent(first, 'IncomingShot')
  const secondResult = expectEvent(second, 'ShotResult')
  const returnMiss = await second.invoke('Fire', 9, 8)
  assert.equal(returnMiss.status, 'Miss')
  assert.equal((await secondResult).status, 'Miss')
  await secondIncoming

  await first.stop()
  const resumedClient = connect()
  await resumedClient.start()
  const resumed = await resumedClient.invoke('JoinRoom', created.code, created.playerToken)
  assert.equal(resumed.player, 'One')
  assert.equal(resumed.isYourTurn, true)
  assert.equal(resumed.shotsAgainstYou.length, 1)
  assert.equal(resumed.shotsAgainstYou[0].coordinate.y, 8)
  assert.equal('opponentFleet' in resumed, false)
  assert.ok(resumed.ownBoard.ships.every((ship) => ship.cells.every((cell) => cell.x < 5)))

  const allCells = fleetCells(secondFleet)
  for (let index = 0; index < allCells.length; index += 1) {
    const coordinate = allCells[index]
    const incoming = expectEvent(second, 'IncomingShot')
    const result = expectEvent(resumedClient, 'ShotResult')
    const fire = await resumedClient.invoke('Fire', coordinate.x, coordinate.y)
    assert.ok(['Hit', 'Sunk', 'Won'].includes(fire.status))
    const event = await result
    assert.equal(event.status, fire.status)
    await incoming
    if (fire.status === 'Won') break

    const returnShot = expectEvent(resumedClient, 'IncomingShot')
    const opponentResult = expectEvent(second, 'ShotResult')
    const reply = await second.invoke('Fire', index % 10, 9 - Math.floor(index / 10))
    assert.equal(reply.status, 'Miss')
    assert.equal((await opponentResult).status, 'Miss')
    await returnShot
  }

  const final = await resumedClient.invoke('JoinRoom', created.code, created.playerToken)
  assert.equal(final.phase, 'Finished')
  assert.equal(final.result.winner, 'One')
  assert.equal(final.result.opponentFleet.length, 5)
  assert.ok(final.result.opponentFleet.every((ship) => ship.cells.every((cell) => cell.x >= 5)))
  assert.equal(final.shotsAgainstYou.length, 17)

  const firstRematch = expectEvent(second, 'RematchRequested')
  await resumedClient.invoke('Rematch')
  await firstRematch
  const startedForFirst = expectEvent(resumedClient, 'RematchStarted')
  const startedForSecond = expectEvent(second, 'RematchStarted')
  await second.invoke('Rematch')
  await Promise.all([startedForFirst, startedForSecond])

  const resetFirst = await resumedClient.invoke('JoinRoom', created.code, created.playerToken)
  const resetSecond = await second.invoke('JoinRoom', created.code, joined.playerToken)
  assert.equal(resetFirst.phase, 'Placing')
  assert.equal(resetSecond.phase, 'Placing')
  assert.equal(resetFirst.shotsAgainstOpponent.length, 0)
  assert.equal(resetFirst.shotsAgainstYou.length, 0)
  assert.equal(resetFirst.ownFleetSubmitted, false)
  assert.equal(resetSecond.ownFleetSubmitted, false)
  assert.equal(resetFirst.ownBoard.ships.length, 0)
  assert.equal((await resumedClient.invoke('Fire', 0, 0)).status, 'GameNotReady')
  const gameStartedForFirst = expectEvent(resumedClient, 'GameStarted')
  const gameStartedForSecond = expectEvent(second, 'GameStarted')
  await resumedClient.invoke('SubmitFleet', firstFleet)
  await second.invoke('SubmitFleet', secondFleet)
  assert.equal((await gameStartedForFirst).isYourTurn, true)
  assert.equal((await gameStartedForSecond).isYourTurn, false)

  console.log('SignalR smoke test passed: room, fleet validation, turn enforcement, shot events, reconnect, victory, and rematch.')
} finally {
  await Promise.allSettled(clients.map((client) => client.stop()))
}
