# Battleship

Two players can create or join a private room and play the original 10×10 Battleship rules. The ASP.NET server owns the match state; the React client never sees the opposing fleet before the match ends.

The Vietnamese interface also supports playing against a computer. The server generates a valid random fleet and chooses random targets without repeats. Fleet silhouettes stay visible on your own board; the larger board switches with each turn, with manual controls and an option to disable automatic switching. Shot colors and symbols distinguish untried cells, misses, hits, and sunk ships.

The `feature/3d-interface` work adds a lazy-loaded Three.js board, ship models, splash/explosion/sinking effects, and synthesized sound with quality and volume controls. Select a target, then press **Bắn**. Mobile uses one board with tabs; desktop also shows a secondary board. 2D remains available, including when WebGL is unavailable. See [CONTEXT_3D.md](CONTEXT_3D.md) for verification and remaining device-testing notes, and [DESIGN.md](DESIGN.md) for the interface direction.

The `feature/3d-interface` working tree adds a lazy-loaded Three.js board, separate camera rotation, water/explosion/sinking effects, and synthesized audio with volume and quality settings. Select a target, then press **Bắn** to fire. Mobile uses one board with tabs; desktop shows a secondary board. The 2D option remains available, including when WebGL is unavailable. See [CONTEXT_3D.md](CONTEXT_3D.md) for current verification and limitations and [DESIGN.md](DESIGN.md) for the agreed interaction design.

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
npm.cmd run build --prefix client
dotnet test Battleship.slnx
```

The SignalR smoke test covers two connected players, invalid fleets, turn enforcement, reconnect history, victory, and rematch. Start the server as above, then run `npm.cmd run test:smoke --prefix client`. Set `BATTLESHIP_HUB_URL` to test a different server URL.

Run `npm.cmd run test:bot --prefix client` against the same server for a complete human/computer match, private bot rooms, placement validation, reconnect, target uniqueness, and rematch. This test can take about three minutes because the computer waits briefly between turns.

## Deploy

The app serves the built React client and SignalR hub from one ASP.NET process. See [deploy/README.md](deploy/README.md) for Docker Compose and the Nginx TLS/WebSocket proxy setup. Room state is in memory: run one instance, and note that a restart clears active matches.
