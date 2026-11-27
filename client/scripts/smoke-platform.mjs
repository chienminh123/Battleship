import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const base = (process.env.BATTLESHIP_API_URL ?? 'http://127.0.0.1:18182').replace(/\/$/, '')
const stateFile = fileURLToPath(new URL('../../artifacts/platform-smoke/state.json', import.meta.url))
const connections = []
function browser(cookies = []) {
  const jar = new Map(cookies)
  const cookieHeader = () => [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  const fetchJson = async (path, body, expected = 200, csrf = true) => {
    let token
    if (body !== undefined && csrf) token = (await fetchJson('/api/session')).csrfToken
    const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookieHeader(), Origin: base, ...(body === undefined ? {} : { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-TOKEN': token } : {}) }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(';')[0], equals = part.indexOf('=')
      jar.set(part.slice(0, equals), part.slice(equals + 1))
      if (part.startsWith('battleship-account=') && body !== undefined && response.ok && !path.endsWith('/logout')) {
        assert.match(cookie, /httponly/i)
        assert.match(cookie, /samesite=strict/i)
        if (base.startsWith('http:')) assert.doesNotMatch(cookie, /;\s*secure\b/i)
      }
    }
    const text = await response.text()
    assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : undefined
  }
  return { fetch: fetchJson, jar, async connect() {
    const client = new HubConnectionBuilder().withUrl(`${base}/hub/game`, { headers: { Cookie: cookieHeader(), Origin: base } }).configureLogging(LogLevel.Error).build()
    connections.push(client); await client.start(); return client
  } }
}
async function until(read, accept, label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read()
    if (accept(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out: ${label}`)
}
const fleet = ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'].map((type, y) => ({ type, start: { x: 0, y }, orientation: 'Horizontal' }))

try {
  if (process.argv.includes('--verify-restart')) {
    const saved = JSON.parse(await readFile(stateFile, 'utf8'))
    for (const entry of saved.accounts) {
      const person = browser(entry.cookies)
      const current = await person.fetch('/api/session')
      assert.equal(current.user?.id, entry.id, 'The persistent cookie must authenticate after a server restart')
      assert.equal(current.user.rating, entry.rating)
      assert.equal(current.user.rankedGames, 1)
      const profile = await person.fetch('/api/profile')
      assert.ok(profile.history.some((match) => match.mode === 'Ranked' && match.state === 'Finished'))
      assert.ok(profile.ratingChanges.some((change) => change.before === 1000 && change.after === entry.rating), 'Profile includes the persisted before/after Elo')
      if (entry.interrupted) assert.ok(profile.history.some((match) => match.id === entry.interrupted && match.state === 'Interrupted'))
    }
    console.log('Platform restart passed: accounts, protected cookies, results and Elo persist; unfinished matches become Interrupted without rating changes.')
  } else {
    const one = browser(), two = browser(), anonymous = browser()
    assert.equal((await anonymous.fetch('/api/session')).enabled, true, 'Accounts must be enabled over HTTP in Production')
    await anonymous.fetch('/api/profile', undefined, 401)
    const suffix = Date.now().toString(36)
    const first = await one.fetch('/api/account/register', { userName: `qa_a_${suffix}`, displayName: 'Kiểm thử A', password: 'Fleet_test_2026!' })
    const second = await two.fetch('/api/account/register', { userName: `qa_b_${suffix}`, displayName: 'Kiểm thử B', password: 'Fleet_test_2026!' })
    assert.equal((await one.fetch('/api/session')).user.id, first.id)
    await one.fetch('/api/account/profile', { displayName: 'must not change' }, 400, false)
    assert.equal((await one.fetch('/api/session')).user.displayName, 'Kiểm thử A')
    const clientOne = await one.connect(), clientTwo = await two.connect()
    await one.fetch('/api/community/friends', { playerCode: second.playerCode, action: 'request' })
    const pending = await two.fetch('/api/community')
    assert.equal(pending.friends[0].incoming, true)
    await two.fetch('/api/community/friends', { playerCode: first.playerCode, action: 'accept' })
    await one.fetch('/api/community/invites', { id: second.playerCode, action: 'send' })
    const invitation = (await two.fetch('/api/community')).invites[0]
    assert.match(invitation.expiresUtc, /Z$/, 'SQLite timestamps must remain UTC on the wire')
    await two.fetch('/api/community/invites', { id: invitation.id, action: 'accept' })
    await two.fetch('/api/community/invites', { id: invitation.id, action: 'accept' })
    const a = (await one.fetch('/api/community')).activeRoom, b = (await two.fetch('/api/community')).activeRoom
    assert.equal(a.code, b.code)
    const snapA = await clientOne.invoke('Reconnect', a.code, a.playerToken)
    const snapB = await clientTwo.invoke('Reconnect', b.code, b.playerToken)
    assert.notEqual(snapA.player, snapB.player)
    assert.equal(snapA.mode, 'Friendly')
    const outsider = await anonymous.connect()
    await assert.rejects(outsider.invoke('JoinRoom', a.code, null), /ROOM_FULL/)
    await assert.rejects(outsider.invoke('Reconnect', a.code, a.playerToken), /ACCOUNT_REQUIRED/)
    await clientOne.invoke('SubmitFleet', fleet); await clientTwo.invoke('SubmitFleet', fleet)
    await clientOne.invoke('Surrender')
    assert.equal((await one.fetch('/api/session')).user.rankedGames, 0)
    assert.equal((await two.fetch('/api/session')).user.rating, 1000)
    await clientOne.invoke('LeaveRoom'); await clientTwo.invoke('LeaveRoom')

    await one.fetch('/api/community/queue', { action: 'join' }); await two.fetch('/api/community/queue', { action: 'join' })
    const match = await until(() => one.fetch('/api/community'), (state) => state.pairing, 'ranked pairing')
    await one.fetch('/api/community/queue', { action: 'accept', pairingId: match.pairing.id })
    await two.fetch('/api/community/queue', { action: 'accept', pairingId: match.pairing.id })
    const rankedA = (await one.fetch('/api/community')).activeRoom, rankedB = (await two.fetch('/api/community')).activeRoom
    assert.equal(rankedA.code, rankedB.code)
    const rankedSnapshot = await clientOne.invoke('Reconnect', rankedA.code, rankedA.playerToken)
    await clientTwo.invoke('Reconnect', rankedB.code, rankedB.playerToken)
    assert.equal(rankedSnapshot.mode, 'Ranked')
    assert.ok(rankedSnapshot.placementDeadlineUtc)
    await clientOne.invoke('SubmitFleet', fleet); await clientTwo.invoke('SubmitFleet', fleet)
    await clientOne.invoke('Surrender')
    await assert.rejects(clientOne.invoke('Surrender'), /GAME_NOT_PLAYING/)
    await clientOne.invoke('Reconnect', rankedA.code, rankedA.playerToken)
    const ratedOne = (await one.fetch('/api/session')).user, ratedTwo = (await two.fetch('/api/session')).user
    assert.equal(ratedOne.rating, 984); assert.equal(ratedTwo.rating, 1016)
    assert.equal(ratedOne.rankedGames, 1); assert.equal(ratedTwo.rankedGames, 1)
    await clientOne.invoke('Rematch'); await clientTwo.invoke('Rematch')
    const next = await clientOne.invoke('Reconnect', rankedA.code, rankedA.playerToken)
    assert.equal(next.mode, 'Friendly'); assert.notEqual(next.matchId, rankedSnapshot.matchId)
    await clientOne.invoke('SubmitFleet', fleet); await clientTwo.invoke('SubmitFleet', fleet)
    await clientOne.invoke('Surrender')
    assert.equal((await one.fetch('/api/session')).user.rating, 984)
    const profile = await one.fetch('/api/profile')
    assert.equal(profile.stats.find((stats) => stats.mode === 'Ranked').losses, 1)
    assert.equal(profile.stats.find((stats) => stats.mode === 'Friendly').losses, 2)
    await clientOne.invoke('LeaveRoom'); await clientTwo.invoke('LeaveRoom')
    const unfinished = await clientOne.invoke('CreateRoom')
    const unfinishedSnapshot = await clientOne.invoke('Reconnect', unfinished.code, unfinished.playerToken)
    await mkdir(dirname(stateFile), { recursive: true })
    await writeFile(stateFile, JSON.stringify({ accounts: [
      { id: first.id, cookies: [...one.jar], rating: 984, interrupted: unfinishedSnapshot.matchId },
      { id: second.id, cookies: [...two.jar], rating: 1016 },
    ] }), 'utf8')
    console.log('HTTP Production platform smoke passed: registration/cookies, CSRF rejection, friends, idempotent invitation, reserved-seat privacy, matchmaking, surrender, exactly-once Elo and unrated rematch. Restart verification is ready.')
  }
} finally {
  await Promise.allSettled(connections.map((connection) => connection.stop()))
}
