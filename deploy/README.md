# Deploy on Ubuntu, public TCP port 5228

Run one container instance. Rooms/chat are in memory; a restart clears active rooms and marks unfinished persisted matches Interrupted without rating changes. Accounts, completed history, friends and Elo are stored in SQLite on the accounts-data volume.

1. Copy or pull the repository on the server and allow inbound TCP port 5228 in the OS and hosting provider's firewall (`sudo ufw allow 5228/tcp` if UFW is enabled).
2. Install `nginx.conf` as `/etc/nginx/conf.d/battleship.conf`, run `sudo nginx -t`, and reload Nginx.
3. From the repository root, run `docker compose -f deploy/docker-compose.yml up -d --build`.
4. Check `docker compose -f deploy/docker-compose.yml ps` and `curl -fsS http://127.0.0.1:5228/health`. Open `http://SERVER_IP:5228/` in a browser.

Nginx listens on public port 5228 and sends both the page and `/hub/` to `127.0.0.1:5227` (container port 8080). The hub uses a WebSocket-aware proxy with a longer idle timeout. Only public TCP port 5228 is needed. The browser uses `/hub/game` at the same address as the page, with no dependency on the player's localhost or VS Code port forwarding.

The container starts with `--urls http://0.0.0.0:8080` to override the native deployment's `Urls` setting (5228). Keep the Compose `command` override when updating existing installations. An `ASPNETCORE_URLS` host setting alone can be overridden by the app's `Urls` setting.

Replace the old Battleship Nginx configuration instead of enabling a second copy. From the repository root on the server:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
sudo install -m 644 deploy/nginx.conf /etc/nginx/conf.d/battleship.conf
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:5228/health
```

If the server is behind a home router, forward external TCP 5228 to internal TCP 5228 at the **server's LAN IP**. A VPS with a public IP does not use your home router's forwarding rules.

## Native .NET alternative (without Docker or Nginx)

With Node.js 24 and the .NET 8 SDK installed, run from the repository root:

```bash
npm ci --prefix client
npm run build --prefix client
dotnet publish server/Battleship.Server/Battleship.Server.csproj -c Release -o artifacts/battleship
mkdir -p artifacts/battleship/wwwroot
cp -a client/dist/. artifacts/battleship/wwwroot/
cd artifacts/battleship
ASPNETCORE_ENVIRONMENT=Production ASPNETCORE_URLS=http://0.0.0.0:5228 dotnet Battleship.Server.dll
```

Keep the process running with your server's service manager. Do not run this alternative alongside Nginx on the same port. Update any existing service's URL override to `http://0.0.0.0:5228`. The default app configuration also listens on all IPv4 interfaces at port 5228. The published `wwwroot` must contain the frontend build.

Open TCP 5228 in the OS and provider firewall, check `http://SERVER_IP:5228/health`, and create/join a room from two browsers.

## Persistent accounts and backup

Compose mounts the named `accounts-data` volume at `/app/data` and sets `Storage__Directory=/app/data`. Both `battleship.db` and the `keys/` Data Protection directory must survive updates; preserving only the database loses existing cookie authentication. Keep this volume when rebuilding. Do not use `docker compose down -v` during an update.

Before the first database release, create a backup and test a restore on an isolated instance using the same application/schema version. A schema downgrade has not been verified. For a consistent filesystem backup, stop the application while copying the entire storage directory/volume; do not copy only a live SQLite `.db` file and omit its WAL. An online backup must use SQLite's backup API and include the Data Protection keys separately.

A stopped-container backup from the repository root can be made with:

```bash
mkdir -p backups
docker compose -f deploy/docker-compose.yml stop battleship
docker compose -f deploy/docker-compose.yml run --rm --no-deps --entrypoint tar battleship -C /app/data -czf - . > backups/battleship-data.tgz
docker compose -f deploy/docker-compose.yml start battleship
```

Check the command exit status and archive contents before relying on the backup. Restore into a fresh isolated storage volume/directory, run the same schema version, and verify login cookies, account/history counts, rating changes and `/health` before replacing live storage. Keep the original volume until the restored instance is accepted. The current local verification used SQLite backup plus copied keys with native .NET; Docker-volume backup/restore and production Nginx acceptance are still pending.

For native hosting, set `Storage__Directory` to a stable absolute directory outside the versioned publish folder, and back up that entire directory including `keys/`.

The current deployment intentionally supports HTTP: cookie Secure policy follows the request scheme and HTTP sessions expire within one day. Keep Identity password hashing, CSRF, SameSite/HttpOnly and server-side session checks enabled. No email recovery or voice service is configured.
