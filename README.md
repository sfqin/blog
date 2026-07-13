# dev@home — CRT terminal blog with an admin backend

A retro terminal / CRT-styled personal blog with an interactive 3D "footprint"
globe. Unlike the original PRD (which proposed a static Astro site), this is a
**dynamic Go service backed by SQLite** so that everything you edit in the
admin panel appears on the homepage **instantly — no rebuild, no redeploy**.

The entire frontend (HTML templates, CSS, JS, and geo data) is compiled into a
single Go binary via `//go:embed`, so deploying is just copying one executable.

There are **two ways to run it**, and the same codebase supports both:

- **Static (free, recommended):** run the admin locally, then export a static
  site and push it — Cloudflare Pages serves it for free, reachable from China
  and abroad. See [`DEPLOY.md`](DEPLOY.md).
- **Dynamic (paid VPS):** run the Go service on a server so the live `/admin`
  is reachable anywhere and edits appear instantly. See "Deploying" below.

---

## What it does

- **Public site** (`/`): profile, experiences, thoughts, projects, latest posts,
  and the interactive globe.
- **Post pages** (`/posts/{slug}`): Markdown rendered to HTML.
- **Footprints API** (`/api/footprints`): visited countries/provinces/cities as
  JSON, consumed by the globe.
- **Admin panel** (`/admin`): password-protected CRUD for every piece of page
  data — profile, experiences, thoughts, projects, posts, and footprints. Saves
  land in SQLite and show up on the public site on the next page load.

### Security
- Session cookie (`dh_session`, 7-day TTL) + bcrypt password hashing.
- CSRF protection via double-submit cookie (`dh_csrf` + `csrf_token` form field).
- In production, cookies are `Secure` (set `SECURE_COOKIES=1`).

---

## Run locally

Requires Go 1.23+.

```bash
# First run: ADMIN_PASSWORD sets the admin login. Pick your own.
ADMIN_PASSWORD='choose-a-strong-password' go run .
# → listening on :8080
```

Then open:
- Public site: http://localhost:8080/
- Admin: http://localhost:8080/admin/login  (user `admin`, the password above)

### Configuration (environment variables)

| Var              | Default    | Meaning                                                        |
|------------------|------------|----------------------------------------------------------------|
| `ADDR`           | `:8080`    | Listen address. In production use `127.0.0.1:8080` (loopback). |
| `DB_PATH`        | `blog.db`  | SQLite file path.                                              |
| `ADMIN_USERNAME` | `admin`    | Admin login name.                                             |
| `ADMIN_PASSWORD` | *(empty)*  | Sets/updates the admin password when non-empty. Set on first run, then you can remove it. |
| `SECURE_COOKIES` | *(off)*    | `1` to mark cookies Secure (HTTPS only). Enable in production. |

### Subcommands

```bash
./blogbin serve            # (default) run the admin + public site
./blogbin export [dir]     # render the current DB into a static site (default: ./dist)
```

---

## Static export & free deploy (Cloudflare Pages)

The whole public site is static-renderable: `export` renders the homepage and
every published post to HTML, writes the footprints JSON to `dist/api/footprints`
(the exact path the globe fetches, so the globe needs no changes), and copies
all static assets. The admin runs only locally; the SQLite DB (with your
password hash) never leaves your machine.

```bash
./scripts/publish.sh          # build → export ./dist → git commit → git push
```

Cloudflare Pages, connected to the repo with build command empty and output
dir `dist`, then auto-deploys. Full step-by-step (accounts, Cloudflare setup,
custom domain, China-access notes) is in [`DEPLOY.md`](DEPLOY.md). An optional
GitHub Pages mirror workflow lives at `.github/workflows/pages.yml`.

---

## Regenerating the globe geo data

The committed geo JSON under `web/static/geo/` is pre-built, so you normally
don't need this. To rebuild it (requires network + Node):

```bash
node scripts/gen_geo.mjs
```

Drill scope: CN provinces 北京/湖南/广东/浙江/四川/江苏; JP Tokyo/Osaka;
MY Selangor/Sabah; SG whole country. Only `world.json` (~64KB) loads initially;
region files are lazy-loaded on drill.

---

## Deploying so it works from mainland China AND overseas

**Recommended setup: a Hong Kong (or nearby overseas) VPS + Cloudflare, custom domain.**

Why: an overseas host reachable from the mainland (Hong Kong has low latency to
China and doesn't require ICP备案) plus Cloudflare's global CDN gives good access
from both inside and outside China without the paperwork of mainland hosting.
You can add ICP备案 + a mainland CDN later if you want maximum China performance.

### One-time server setup

1. **Provision the box** — a small VPS (1 vCPU / 1 GB RAM is plenty). On it:
   ```bash
   sudo useradd -r -m -d /opt/s_blog blog          # service user
   sudo mkdir -p /opt/s_blog/data /var/log/caddy
   sudo chown -R blog:blog /opt/s_blog
   ```
2. **Install Caddy** (reverse proxy + automatic HTTPS): see https://caddyserver.com/docs/install
3. **Edit config**:
   - In `Caddyfile`, replace `blog.example.com` with your domain.
   - In `s_blog.service`, set a strong `ADMIN_PASSWORD` (change it after first boot).
4. **Point DNS**: create an A record for your domain → the VPS IP. If using
   Cloudflare, add the site there and enable the orange-cloud proxy.

### Deploy the app

From your laptop (in this repo):

```bash
# Build + upload + restart in one step:
./scripts/deploy.sh push blog@your-server-ip
```

The first time, also install the service files on the server:

```bash
# on the server, after the first push copied them to /opt/s_blog:
sudo cp /opt/s_blog/s_blog.service /etc/systemd/system/
sudo cp /opt/s_blog/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now s_blog
sudo systemctl reload caddy
```

Subsequent deploys are just `./scripts/deploy.sh push blog@your-server-ip`
(builds a fresh binary, uploads it atomically, restarts the service).

To build the Linux binary without deploying: `./scripts/deploy.sh build`
(output: `dist/s_blog`).

---

## Accounts / services you need to sign up for

You currently have GitHub, which is enough to store the code. To put the site
online for both China and overseas visitors, you'll need:

1. **A VPS / cloud server** — recommend a **Hong Kong** region (e.g. from a
   provider that offers HK/Singapore/Japan nodes). ~US$5–10/month.
2. **A domain name** — any registrar (Cloudflare Registrar, Namecheap, Aliyun,
   etc.). If your host is outside mainland China you do **not** need ICP备案.
3. **A Cloudflare account** — free tier is fine; used for DNS + global CDN so
   the site loads well from many regions.
4. **A payment method** (card / Alipay depending on provider) for the VPS and
   domain.

You do **not** need to do anything for the build itself — the code is done and
verified. Your part is: buy the VPS + domain, create the Cloudflare account,
point DNS, then run the deploy command above. Set `ADMIN_PASSWORD` once and log
in at `https://your-domain/admin/login`.

---

## Project layout

```
main.go                     entry point; embeds ./web
internal/
  models/                   content types
  store/                    SQLite access (schema.sql + per-collection files)
  auth/                     bcrypt + token helpers
  render/                   html/template + goldmark (Markdown)
  server/                   routes, middleware (session/CSRF), handlers
web/
  templates/public/         home.html, post.html
  templates/admin/          login, dashboard, and per-collection list/form
  static/css|js/            CRT theme, admin panel, globe.js
  static/geo/               pre-built world + region JSON for the globe
scripts/
  gen_geo.mjs               (re)build geo data (needs network)
  deploy.sh                 build / push to server
Caddyfile                   reverse proxy + TLS
s_blog.service              systemd unit
```

## Tests

```bash
go test ./internal/store/     # store layer
node scripts/globe_logic_test.mjs   # globe pure-logic tests
```
