# infra-sandbox

A Docker-based infrastructure sandbox for running a small multi-service stack on a VPS or locally. The stack includes a shared PostgreSQL database, Drupal CMS, FreshRSS feed reader, a static RSS server for tests, and a Go blog application.

**[Русская версия →](README.ru.md)**

---

## What is this?

This repository is both:

1. **A deployable stack** — ready-to-run Docker Compose projects you can install on a DigitalOcean VPS (4 GB RAM recommended).
2. **An integration test suite** — Playwright end-to-end tests that verify all services work together.

All services share one PostgreSQL instance and communicate over a single Docker network (`projects-net`).

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker network: projects-net                  │
│                                                                   │
│  ┌──────────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐ │
│  │ shared-      │   │ Drupal  │   │ FreshRSS │   │ go-blog  │ │
│  │ postgres     │◄──│ :8080   │   │ :8081    │   │ :8083    │ │
│  │              │◄──┤         │   │          │   │          │ │
│  │ drupal DB    │◄──┤         │   │          │   │          │ │
│  │ freshrss DB  │   └─────────┘   └────┬─────┘   └──────────┘ │
│  │ goblog DB    │                      │                         │
│  └──────────────┘                      │ subscribes to          │
│         ▲                              ▼                         │
│         │                      ┌──────────────┐                   │
│         │                      │ static-server│                   │
│         │                      │ (nginx)      │                   │
│         │                      │ :8082        │                   │
│         └──────────────────────┴──────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Services and default ports

| Service        | Container name   | Port | Description                                      |
|----------------|------------------|------|--------------------------------------------------|
| PostgreSQL     | `shared-postgres`| —    | Shared database for Drupal, FreshRSS, and go-blog |
| Drupal         | `drupal`         | 8080 | Drupal 10 CMS with automatic install             |
| FreshRSS       | `freshrss`       | 8081 | Self-hosted RSS reader                           |
| Static server  | `static-server`  | 8082 | Nginx serving test RSS feeds                     |
| Go Blog        | `go-blog`        | 8083 | Simple blog app written in Go (Gin + GORM)       |

Ports can be changed via environment variables (see [Configuration](#configuration)).

---

## Prerequisites

- **Docker** and **Docker Compose** (v2 plugin)
- **Node.js** 18+ and **npm** (for running tests locally)
- For VPS deployment: Ubuntu or Debian, root/sudo access, ~4 GB RAM

---

## Quick start (local development)

### 1. Clone the repository

```bash
git clone https://github.com/sigmaray/infra-sandbox.git
cd infra-sandbox
```

### 2. Install test dependencies

```bash
npm ci
npx playwright install --with-deps chromium
```

### 3. Start the stack

```bash
npm run stack:up
```

This script:

- Writes test `.env` files with known passwords
- Creates the `projects-net` Docker network
- Starts services in the correct order (PostgreSQL first, then the rest)
- Waits until containers are healthy

### 4. Open the services

| Service   | URL                        | Default credentials      |
|-----------|----------------------------|--------------------------|
| Drupal    | http://127.0.0.1:8080      | `admin` / `test-admin`   |
| FreshRSS  | http://127.0.0.1:8081      | `admin` / `test-admin`   |
| Go Blog   | http://127.0.0.1:8083      | `admin` / `admin`        |
| RSS feeds | http://127.0.0.1:8082/feeds/ | — (no auth)            |

### 5. Run tests

```bash
npm test
```

Or run the full cycle (tear down, start, test, tear down):

```bash
npm run test:infra
```

### 6. Stop the stack

```bash
npm run stack:down
```

This removes containers **and volumes**, giving you a clean state for the next run.

---

## VPS deployment

Designed for a DigitalOcean droplet with 4 GB RAM. The setup script also creates a 2 GB swap file.

### 1. Clone on the server

```bash
git clone git@github.com:sigmaray/infra-sandbox.git ~/infra-sandbox
cd ~/infra-sandbox
```

### 2. Run the setup script (as root)

```bash
sudo REPO_DIR=~/infra-sandbox ./scripts/setup-vps.sh
```

The script will:

- Install Docker (Ubuntu/Debian)
- Create a 2 GB swap file
- Copy project files to `/opt/projects/`
- Create the `projects-net` Docker network
- Generate `.env` files from `.env.example` templates
- Add your user to the `docker` group

**Important:** After setup, edit `.env` files in `/opt/projects/*/` and set strong passwords before going to production.

### 3. Start services (in order)

```bash
cd /opt/projects/postgresql && docker compose up -d
cd /opt/projects/drupal     && docker compose up -d
cd /opt/projects/freshrss   && docker compose up -d
cd /opt/projects/static-server && docker compose up -d
cd /opt/projects/go-blog    && docker compose up -d
```

### 4. Update after code changes

```bash
REPO_DIR=~/infra-sandbox ./scripts/update-projects.sh
```

This pulls the latest code, syncs files to `/opt/projects/`, and restarts only the services that changed.

Useful flags:

| Variable          | Effect                                      |
|-------------------|---------------------------------------------|
| `FORCE_RESTART=1` | Restart all services                        |
| `PULL_IMAGES=1`   | Pull latest upstream images before restart  |
| `SKIP_GIT_PULL=1` | Sync and restart without `git pull`         |
| `SKIP_RESTART=1`  | Sync files only, do not restart containers  |
| `DRY_RUN=1`       | Show what would happen without doing it     |
| `PROJECTS="drupal go-blog"` | Update only selected projects   |

---

## Configuration

Each service has its own directory with `docker-compose.yml` and `.env.example`. Copy `.env.example` to `.env` and edit values.

### PostgreSQL (`postgresql/.env`)

Creates three databases on first start: `drupal`, `freshrss`, `goblog`. Each has a dedicated user.

### Drupal (`drupal/.env`)

- Site name, admin credentials, database connection
- `DRUPAL_HTTP_PORT` — host port (default `8080`)
- Drupal installs automatically on first container start via Drush

### FreshRSS (`freshrss/.env`)

- `FRESHRSS_BASE_URL` — public URL of your FreshRSS instance (required for production)
- Admin credentials and API password
- `FRESHRSS_HTTP_PORT` — host port (default `8081`)

### Go Blog (`go-blog/.env`)

- Database connection (uses `shared-postgres` by default)
- `GO_BLOG_HTTP_PORT` — host port (default `8083`)

### Static server (`static-server/`)

- `STATIC_SERVER_HTTP_PORT` — host port (default `8082`)
- RSS feed files live in `static-server/content/feeds/`
- `content/manifest.json` describes feeds for automated tests

### Setup script variables

| Variable        | Default          | Description                          |
|-----------------|------------------|--------------------------------------|
| `REPO_DIR`      | repo root        | Path to this git checkout            |
| `DEPLOY_ROOT`   | `/opt/projects`  | Where services are deployed on VPS   |
| `DOCKER_NETWORK`| `projects-net`   | Shared Docker network name           |
| `SWAP_SIZE_GB`  | `2`              | Swap file size during VPS setup      |
| `SKIP_SWAP=1`   | —                | Skip swap creation (used in CI)      |

---

## Project structure

```
infra-sandbox/
├── scripts/
│   ├── setup-vps.sh        # Initial VPS setup (Docker, directories, network)
│   ├── stack-up.sh         # Start full stack for local/CI testing
│   ├── stack-down.sh       # Stop stack and remove volumes
│   └── update-projects.sh  # Git pull + sync + restart changed services
├── postgresql/             # Shared PostgreSQL 16
├── drupal/                 # Drupal 10 + Apache, auto-install
├── freshrss/               # FreshRSS feed reader
├── static-server/          # Nginx with test RSS feeds
├── go-blog/                # Go blog (Gin, GORM, Goose migrations)
├── tests/                  # Playwright end-to-end tests
├── .github/workflows/ci.yml
├── package.json
└── playwright.config.ts
```

---

## Tests

Tests use [Playwright](https://playwright.dev/) and run against the live Docker stack.

| Test file            | What it checks                                           |
|----------------------|----------------------------------------------------------|
| `infra.spec.ts`      | PostgreSQL health, Drupal homepage, static RSS feeds     |
| `freshrss.spec.ts`   | FreshRSS login, RSS feed import from static server       |
| `drupal-blog.spec.ts`| Drupal blog setup, posts, pagination, tag filtering      |
| `go-blog.spec.ts`    | Go blog login, posts, pagination, tag filtering        |

In CI, the stack is started before tests (`SKIP_STACK_SETUP=1` tells Playwright not to start it again). Locally, `global-setup.ts` runs `stack-up.sh` automatically unless you set `SKIP_STACK_SETUP=1`.

```bash
# Run all tests (starts stack automatically)
npm test

# Run a specific test file
npx playwright test tests/freshrss.spec.ts

# Interactive test UI
npm run test:ui
```

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. Installs Node.js dependencies and Playwright
2. Runs `setup-vps.sh` (with `SKIP_SWAP=1`)
3. Starts the Docker stack
4. Runs Playwright tests
5. Uploads the HTML report on failure
6. Stops the stack

---

## Troubleshooting

**"Docker network 'projects-net' not found"**

```bash
docker network create projects-net
```

**PostgreSQL not healthy**

Check logs: `docker logs shared-postgres`. On first start, init scripts create databases — wait up to 2 minutes.

**Drupal still installing**

First start runs `drush site:install`. Check progress: `docker logs -f drupal`.

**Permission denied on Docker (VPS)**

Re-login after `setup-vps.sh` adds you to the `docker` group, or run `newgrp docker`.

**Port already in use**

Override ports when starting:

```bash
DRUPAL_HTTP_PORT=9080 FRESHRSS_HTTP_PORT=9081 npm run stack:up
```

---

## License

This is a sandbox / learning project. Check individual service licenses (Drupal, FreshRSS, etc.) for production use.
