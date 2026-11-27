# Battleship

Two players can create or join a private room and play the original 10×10 Battleship rules. The ASP.NET server owns the match state; the React client never sees the opposing fleet before the match ends.

The Vietnamese interface also supports playing against a computer. Choose **Dễ** (uniform random shots), **Khó** (random search, then follow hits along a ship's likely direction), or **Hủy diệt** (score legal placements of remaining ships, then pursue hits). All levels use only their own shot history and revealed sunk cells, never the human fleet, to choose targets. They place a legal random fleet and never fire at the same cell twice. The level is retained on reconnect and rematch; rematches return the human player to fleet placement. Ships may touch, so the bot keeps alternative directions and does not rule out cells beside a wreck.

Fleet silhouettes stay visible on your own board; the larger board switches with each turn, with manual controls and an option to disable automatic switching. Shot colors and symbols distinguish untried cells, misses, hits, and sunk ships.

The interface includes a lazy-loaded Three.js board, ship models, splash/explosion/sinking effects, and synthesized sound with quality and volume controls. Select a target, then press **Bắn**. Mobile uses one board with tabs; desktop also shows a secondary board. 2D remains available, including when WebGL is unavailable. See [CONTEXT_3D.md](CONTEXT_3D.md) for device-testing notes and [DESIGN.md](DESIGN.md) for the interface direction.

Room text chat is available between human players, with bounded reconnect history and idempotent retries. Optional accounts add profiles, match history, friends, invitations and Elo matchmaking; guest and bot play still work without signing in. Accounts run over the agreed HTTP deployment with Identity password hashing, HttpOnly/SameSite cookies, CSRF checks and server-side session validation. HTTP sessions last at most one day. This release has no email password recovery or voice chat.

Only Ranked matches change Elo. Matchmaking requires two signed-in accounts to confirm before fleet placement; surrender and server deadlines decide forfeits. Rematches become Friendly. Match history and rating changes persist in SQLite, while rooms and room chat stay in RAM. After restart, unfinished persisted matches become Interrupted without Elo changes. See [ROADMAP.md](ROADMAP.md) for acceptance still outstanding and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for actual verification.

## Run on a server (port 5228)

The production server serves the built React client and `/hub/game` at the same address. Players open `http://SERVER_IP:5228`; the browser connects to that server automatically.

See [deploy/README.md](deploy/README.md) for deployment and firewall commands.

## Development only

Start the server from the repository root:

```powershell
dotnet run --project server/Battleship.Server/Battleship.Server.csproj --launch-profile http
```

In another terminal, start the client:

```powershell
cd client
npm ci
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`) in two browser sessions. Vite proxies SignalR traffic to the development server on port 8181. These development commands are not the production deployment.

## Checks

```powershell
npm.cmd run lint --prefix client
npm.cmd test --prefix client
npm.cmd run build --prefix client
dotnet test Battleship.slnx
```

The SignalR smoke test covers two connected players, invalid fleets, turn enforcement, reconnect history, victory, and rematch. Start the server as above, then run `npm.cmd run test:smoke --prefix client`. Set `BATTLESHIP_HUB_URL` to test a different server URL.

Run `npm.cmd run test:bot --prefix client` against the same server for complete human/computer matches at all three levels, private bot rooms, placement validation, reconnect, target uniqueness, and playable rematches with the original difficulty. The three independent matches run concurrently and can take about three minutes because the computer waits briefly between turns. Use a fresh test server (or wait for the room-creation quota to reset) when combining smoke runs.

Run `npm.cmd run test:chat --prefix client` with `BATTLESHIP_HUB_URL` for room chat isolation, permissions, retries, reconnect and rematch.

For the platform test use a **dedicated disposable test backend** in Production mode and set `BATTLESHIP_API_URL` (default `http://127.0.0.1:18182`). `npm.cmd run test:platform --prefix client` creates two QA accounts and tests friends, invitations, reserved seats, Ranked, surrender and exactly-once Elo. It saves test cookies under ignored `artifacts/platform-smoke/`. Restart that same backend with the same storage directory, then run `npm.cmd run test:platform --prefix client -- --verify-restart` to verify accounts, cookies, results, rating history and interrupted matches. Do not point this script at production. Reset the test server's in-memory room quota between independent smoke groups; the CI workflow does this automatically.

## Deploy

The app serves the built React client, account/community APIs and SignalR hub from one ASP.NET process. See [deploy/README.md](deploy/README.md) for Docker Compose, the HTTP/WebSocket Nginx proxy and database backup notes. Run one instance. Keep the accounts-data volume (database plus Data Protection keys) across updates; a restart clears active rooms, not completed history or accounts.
