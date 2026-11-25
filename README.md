# Battleship

Two players can create or join a private room and play the original 10×10 Battleship rules. The ASP.NET server owns the match state; the React client never sees the opposing fleet before the match ends.

## Run locally

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

Open the Vite URL (normally `http://localhost:5173`) in two browser sessions. Vite proxies SignalR traffic to the server on port 5227.

## Checks

```powershell
npm.cmd run lint --prefix client
npm.cmd run build --prefix client
dotnet test Battleship.slnx
```

The SignalR smoke test covers two connected players, invalid fleets, turn enforcement, reconnect history, victory, and rematch. Start the server as above, then run `npm.cmd run test:smoke --prefix client`. Set `BATTLESHIP_HUB_URL` to test a different server URL.

## Deploy

The app serves the built React client and SignalR hub from one ASP.NET process. See [deploy/README.md](deploy/README.md) for Docker Compose and the Nginx TLS/WebSocket proxy setup. Room state is in memory: run one instance, and note that a restart clears active matches.
