import assert from 'node:assert/strict'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const url = process.env.BATTLESHIP_HUB_URL ?? 'http://localhost:8181/hub/game'
const connections = []
const connect = async () => {
  const client = new HubConnectionBuilder().withUrl(url).configureLogging(LogLevel.Error).build()
  connections.push(client)
  await client.start()
  return client
}
const fleet = ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'].map((type, i) => ({
  type, start: { x: 0, y: i * 2 }, orientation: 'Horizontal',
}))
async function playDifficulty(difficulty) {
  let client = await connect()
  const created = await client.invoke('CreateBotRoomWithDifficulty', difficulty)
  assert.equal(created.isBot, true)
  assert.equal(created.botDifficulty, difficulty)
  assert.equal(created.phase, 'Placing')
  assert.equal(created.opponentFleetSubmitted, true)
  assert.equal(created.ownBoard.ships.length, 0)
  assert.equal(created.result, null)
  const intruder = await connect()
  await assert.rejects(intruder.invoke('JoinRoom', created.code, null), /ROOM_FULL/)
  const invalid = await client.invoke('SubmitFleet', fleet.map((ship) => ({ ...ship, start: { x: 0, y: 0 } })))
  assert.equal(invalid.accepted, false)
  const accepted = await client.invoke('SubmitFleet', fleet)
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.ownBoard.ships.length, 5)
  let result
  const botShots = []
  const attach = () => {
    client.on('IncomingShot', (shot) => { botShots.push(shot) })
    client.on('GameOver', (message) => { result = message })
  }
  attach()
  for (let index = 0; index < 100 && !result; index++) {
    const shot = await client.invoke('Fire', index % 10, Math.floor(index / 10))
    assert.equal(shot.accepted, true)
    if (index === 0) {
      const duplicate = await client.invoke('Fire', 0, 0)
      assert.equal(duplicate.status, 'AlreadyFired')
      assert.equal(botShots.length, 1)
      await client.stop()
      client = await connect()
      attach()
      const resumed = await client.invoke('JoinRoom', created.code, created.playerToken)
      assert.equal(resumed.isBot, true)
      assert.equal(resumed.botDifficulty, difficulty)
      assert.equal(resumed.isYourTurn, true)
      assert.equal(resumed.ownBoard.ships.length, 5)
      assert.equal(resumed.shotsAgainstOpponent.length, 1)
      assert.equal(resumed.shotsAgainstYou.length, 1)
      assert.equal(resumed.result, null)
    }
    if ((index + 1) % 20 === 0) console.log(`${difficulty}: ${index + 1} turns verified`)
  }
  assert.ok(result, `${difficulty}: a complete match must end within 100 turns`)
  assert.equal(result.opponentFleet.length, 5)
  assert.equal(new Set(botShots.map((shot) => `${shot.coordinate.x},${shot.coordinate.y}`)).size, botShots.length)
  for (const ship of result.opponentFleet) {
    assert.equal(ship.cells.length, { Carrier: 5, Battleship: 4, Cruiser: 3, Submarine: 3, Destroyer: 2 }[ship.type])
    assert.ok(ship.cells.every((cell) => cell.x >= 0 && cell.x < 10 && cell.y >= 0 && cell.y < 10))
  }
  const finished = await client.invoke('JoinRoom', created.code, created.playerToken)
  assert.equal(finished.phase, 'Finished')
  await client.invoke('Rematch')
  const reset = await client.invoke('JoinRoom', created.code, created.playerToken)
  assert.equal(reset.phase, 'Placing')
  assert.equal(reset.isBot, true)
  assert.equal(reset.botDifficulty, difficulty)
  assert.equal(reset.shotsAgainstOpponent.length, 0)
  assert.equal(reset.shotsAgainstYou.length, 0)
  assert.equal(reset.ownBoard.ships.length, 0)
  assert.equal(reset.ownFleetSubmitted, false)
  assert.equal(reset.opponentFleetSubmitted, true)
  assert.equal(reset.isYourTurn, false)
  assert.equal((await client.invoke('Fire', 0, 0)).status, 'GameNotReady')
  const nextRound = await client.invoke('SubmitFleet', fleet)
  assert.equal(nextRound.phase, 'Playing')
  const ready = await client.invoke('Reconnect', created.code, created.playerToken)
  assert.equal(ready.botDifficulty, difficulty)
  assert.equal(ready.isYourTurn, true)
  botShots.length = 0
  assert.equal((await client.invoke('Fire', 0, 0)).accepted, true)
  assert.equal(botShots.length, 1)
  console.log(`${difficulty} smoke passed: private fleet, no repeated shots, reconnect, complete match, and a playable rematch with the same level.`)
}
try {
  // Independent rooms share one server; run concurrently to keep the real
  // presentation delay while testing every level within one match duration.
  await Promise.all(['Easy', 'Hard', 'Annihilation'].map(playDifficulty))
} finally {
  await Promise.allSettled(connections.map((client) => client.stop()))
}
