# Self-hosting

The site ships as a single Docker container: a Node build stage generates
`site/data.js` and the `site/content/` lesson bundle, then Caddy serves the
static result with automatic HTTPS.

## First-time setup

Prerequisites on the server: Docker with the compose plugin, ports 80 and
443 open, and a DNS A record pointing your domain at the server.

```bash
git clone <your-repo-url> systemaops-site
cd systemaops-site
echo "DOMAIN=yourdomain.com" > .env
docker compose up -d --build
```

That's it. Caddy provisions and renews the Let's Encrypt certificate
automatically (certificates persist in the `caddy_data` volume).

To run without a domain (local testing, or behind another reverse proxy),
omit the `.env` file — Caddy serves plain HTTP on port 80.

## Deploying updates

```bash
./deploy/deploy.sh
```

Pulls the latest main, rebuilds the image (which re-runs the site build),
and restarts the container. Zero configuration drift: everything the old
Vercel setup did (clean URLs, cache headers, build-on-deploy) lives in
[`deploy/Caddyfile`](Caddyfile) and the [`Dockerfile`](../Dockerfile).

Optional: auto-deploy on push by running deploy.sh from a cron job, or
trigger it from a GitHub Actions workflow over SSH.

## Smoke test after deploy

```bash
curl -fsS https://yourdomain.com/ | grep -q "AI Engineering" && echo home-ok
curl -fsS https://yourdomain.com/plan | grep -q "Learning Plan" && echo plan-ok
curl -fsS https://yourdomain.com/content/phases/00-setup-and-tooling/01-dev-environment/manifest.json > /dev/null && echo content-ok
```

## Where the license gate goes

When license-key checkout launches, enforcement is added in
[`deploy/Caddyfile`](Caddyfile): the `/content/*` matcher gains a
`forward_auth` (or rewrite-to-validator) rule so lesson content requires a
validated key instead of being publicly fetchable. The page-level lock UI
already exists in the site; this server-side rule is the part that makes
it real.
