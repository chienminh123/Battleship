# Deploy on Ubuntu over HTTP

The app keeps room state in memory, so run one container instance. A restart clears active matches.

1. Copy or pull the repository on the server and allow inbound port 80.
2. Install `nginx.conf` as `/etc/nginx/conf.d/battleship.conf`, run `sudo nginx -t`, and reload Nginx.
3. From the repository root, run `docker compose -f deploy/docker-compose.yml up -d --build`.
4. Check `docker compose -f deploy/docker-compose.yml ps` and `curl -fsS http://127.0.0.1/health`. Open `http://SERVER_IP/` in a browser.

Nginx sends `/hub/` through a WebSocket-aware proxy with a longer idle timeout. The container binds only to loopback, so the app is reached through Nginx. HTTP does not encrypt traffic; use HTTPS before handling sensitive data or sharing the service broadly.
