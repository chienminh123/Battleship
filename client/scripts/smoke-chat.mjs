import assert from 'node:assert/strict'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const url = process.env.BATTLESHIP_HUB_URL ?? 'http://localhost:8181/hub/game'
const clients = []
const connect = async () => {
  const client = new HubConnectionBuilder().withUrl(url).configureLogging(LogLevel.Error).build()
  clients.push(client)
  await client.start()
  return client
}
function event(client, name) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => { clearTimeout(timer); client.off(name, handler); resolve(payload) }
    const timer = setTimeout(() => { client.off(name, handler); reject(new Error(`Missing ${name}`)) }, 5000)
    client.on(name, handler)
  })
}
const fleet = ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'].map((type, y) => ({ type, start: { x: 0, y }, orientation: 'Horizontal' }))
try {
  const owner = await connect(), guest = await connect(), outsider = await connect(), other = await connect()
  const created = await owner.invoke('CreateRoom')
  await other.invoke('CreateRoom')
  let leaked = false
  outsider.on('ChatMessage', () => { leaked = true })
  other.on('ChatMessage', () => { leaked = true })
  const waiting = await owner.invoke('SendChat', 'waiting', 'Xin chào trước khi có đối thủ')
  assert.equal(waiting.sender, 'One')
  const joined = await guest.invoke('JoinRoom', created.code, null)
  assert.equal(joined.chatMessages[0].content, waiting.content)
  await assert.rejects(outsider.invoke('GetChatHistory'), /NOT_IN_ROOM/)
  await assert.rejects(outsider.invoke('SendChat', 'outside', 'no'), /NOT_IN_ROOM/)

  const received = event(guest, 'ChatMessage')
  const sent = await owner.invoke('SendChat', 'placing', '<b>Chơi vui nhé</b>')
  assert.equal((await received).message.id, sent.id)
  assert.equal((await owner.invoke('SendChat', 'placing', sent.content)).id, sent.id)
  assert.equal((await guest.invoke('GetChatHistory')).length, 2)
  await assert.rejects(owner.invoke('SendChat', 'placing', 'changed'), /CHAT_REQUEST_CONFLICT/)
  await assert.rejects(owner.invoke('SendChat', 'long', 'a'.repeat(301)), /CHAT_TOO_LONG/)

  await guest.stop()
  await owner.invoke('SendChat', 'offline', 'Tin gửi khi đối thủ rớt mạng')
  const resumed = await connect()
  const restored = await resumed.invoke('Reconnect', created.code, joined.playerToken)
  assert.equal(restored.chatMessages.length, 3)

  const takeover = await connect()
  await takeover.invoke('Reconnect', created.code, created.playerToken)
  await assert.rejects(owner.invoke('SendChat', 'revoked', 'no'), /NOT_IN_ROOM/)
  await assert.rejects(owner.invoke('GetChatHistory'), /NOT_IN_ROOM/)
  const takeoverReceipt = event(takeover, 'ChatMessage')
  await resumed.invoke('SendChat', 'reply', 'Đã quay lại')
  assert.equal((await takeoverReceipt).message.sender, 'Two')

  await takeover.invoke('SubmitFleet', fleet)
  await resumed.invoke('SubmitFleet', fleet)
  await takeover.invoke('SendChat', 'playing', 'Bắt đầu!')
  for (let index = 0; index < 100; index++) {
    const shot = await takeover.invoke('Fire', index % 10, Math.floor(index / 10))
    if (shot.status === 'Won') break
    const reply = await resumed.invoke('Fire', index % 10, Math.floor(index / 10))
    if (reply.status === 'Won') break
  }
  const finished = await takeover.invoke('Reconnect', created.code, created.playerToken)
  assert.equal(finished.phase, 'Finished')
  await resumed.invoke('SendChat', 'finished', 'Ván nữa nhé')
  await takeover.invoke('Rematch')
  await resumed.invoke('Rematch')
  const reset = await resumed.invoke('Reconnect', created.code, joined.playerToken)
  assert.equal(reset.phase, 'Placing')
  assert.equal(reset.chatMessages.at(-1).isSystem, true)
  assert.equal(reset.chatMessages.at(-1).round, 2)
  assert.equal(reset.chatMessages.filter((message) => !message.isSystem).length, 6)
  assert.equal(leaked, false)
  for (let i = 0; i < 5; i++) await other.invoke('SendChat', `burst-${i}`, 'burst')
  await assert.rejects(other.invoke('SendChat', 'burst-six', 'burst'), /CHAT_RATE_LIMITED/)
  console.log('Chat smoke passed: waiting/placement/battle/result/rematch, room isolation, validation, idempotent retry, offline history, token takeover and rate limits.')
} finally {
  await Promise.allSettled(clients.map((client) => client.stop()))
}
