# Deploy on Ubuntu

The app keeps room state in memory, so run one container instance. A restart clears active matches.

1. Copy the repository to the server and replace `battleship.example.com` in `nginx.conf` with the real domain.
2. Point the domain's DNS record at the server and allow inbound ports 80 and 443.
3. Before installing the TLS config, create a temporary HTTP-only Nginx site for the domain with `/.well-known/acme-challenge/` rooted at `/var/www/certbot`. Create that directory, run `nginx -t`, and reload Nginx.
4. Issue the first certificate with `sudo certbot certonly --webroot -w /var/www/certbot -d your.domain`. Install `nginx.conf` as `/etc/nginx/conf.d/battleship.conf`, run `nginx -t`, and reload Nginx.
5. From the repository root, run `docker compose -f deploy/docker-compose.yml up -d --build`.
6. Check `docker compose -f deploy/docker-compose.yml ps` and `curl -fsS https://your.domain/health`. Use `sudo certbot renew --dry-run` to check renewal.

Nginx sends `/hub/` through a WebSocket-aware proxy with a longer idle timeout. The container binds only to loopback, so the app is reached through Nginx and HTTPS.
