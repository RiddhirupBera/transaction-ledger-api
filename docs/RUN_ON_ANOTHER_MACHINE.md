# Run LedgerFlow on another machine

## Recommended setup using Docker only

Prerequisites:

- Docker Desktop with Docker Compose v2 on Windows/macOS, or Docker Engine with Compose v2 on Linux. Start Docker before running the command.
- The complete LedgerFlow source folder, including `package-lock.json`, both Dockerfiles, `compose.full.yml`, and `docker/`.
- Internet access for the first image build and dependency download. No separate Node.js, npm, MongoDB, or Nginx installation is required.

Copy or clone the project to the other machine. Open a terminal **inside the LedgerFlow folder**, then run this single command (the same syntax works in macOS/Linux shells and Windows PowerShell):

```sh
docker compose -f compose.full.yml up --build -d --wait
```

Open **http://localhost:8080**. The API is available through the same address at **http://localhost:8080/api**. Readiness can be checked at **http://localhost:8080/api/health**; it returns `{"data":{"status":"ok"}}` when the API can reach MongoDB.

No `.env` file is required for this mode. Compose supplies the internal database URI and API port. `WEB_PORT` may be set in an optional root `.env` if 8080 is occupied. For example, put `WEB_PORT=8081` in `.env`, rerun the command, and open http://localhost:8081. Existing root `.env` backend values do not override the explicit container settings.

First launch starts with an empty database on the new machine. Code distribution does not automatically copy data from the original machine.

## What the command starts

| Service | Purpose | Readiness |
|---|---|---|
| mongo | MongoDB 8.0 with a persistent named volume and single-node replica set rs0 | Idempotent health check initializes the set and waits for a writable primary |
| server | Express API built with Node 22 and backend production dependencies from the lockfile | Waits for MongoDB health; verifies indexes before listening; checks `/api/health` |
| web | Built React assets served by Nginx | Waits for API health; serves the app and forwards `/api` to the server |

Only the web port is published on host loopback. MongoDB and the API use Docker's internal network. The browser uses relative `/api` URLs, so no frontend rebuild with a machine-specific API address is necessary. Docker supplies service-name DNS (`mongo` and `server`). The client build is a multi-stage image; Vite's development server is not used to serve the packaged application. Backend code runs as the non-root Node user.

The base images are available for common x86-64 and ARM64 machines. No CPU architecture is hardcoded in Compose; Docker selects the appropriate image. MongoDB still requires a CPU supported by its image. Very old CPUs or uncommon architectures may need a separately supported MongoDB environment.

## Operations and logs

Use the **same Compose file** for subsequent operations:

```sh
docker compose -f compose.full.yml ps
docker compose -f compose.full.yml logs --tail=100 server
docker compose -f compose.full.yml logs --tail=100 mongo
docker compose -f compose.full.yml logs --tail=100 web
docker compose -f compose.full.yml stop
docker compose -f compose.full.yml start --wait
```

After source changes, rebuild using the original `up --build -d --wait` command. To remove containers and the Compose network while retaining database data:

```sh
docker compose -f compose.full.yml down
```

The `ledgerflow_mongo-data` named volume retains the database. Do not add `-v` unless you intentionally want to delete that stored data. Moving data to a different computer requires a deliberate MongoDB backup/restore workflow; copying only source code does not do it.

## Keep the two run modes separate

- `compose.full.yml` runs **frontend + backend + MongoDB**. Use it to run the complete app on another machine.
- The original `docker-compose.yml` runs **MongoDB only**, with host port 27019, for developers running `npm run dev:server` and `npm run dev:client` themselves.

Both configurations use project name `ledgerflow` and the same named database volume. Do not operate both Compose configurations simultaneously. Stop/remove the old containers with the relevant `down` command before switching modes; keep the volume to retain data. The full-stack mode does not publish API port 3000 or MongoDB port 27019.

## Alternative development setup

If you want hot reload and editable source on the other machine, install Node.js 22.12+ and Docker/Compose, then run:

```sh
npm ci
```

Copy `.env.example` to `.env` using your file manager, or use the appropriate terminal command:

```sh
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Start the database and API:

```sh
docker compose up -d --wait
npm run dev:server
```

In a second terminal inside the project:

```sh
npm run dev:client
```

Open http://localhost:5173. In this mode the API is on port 3000, the database is on host port 27019, and Vite proxies `/api` to the API. Source paths are resolved relative to the project, so no original-machine absolute path is required.

## Troubleshooting

- **Cannot connect to Docker daemon:** launch Docker Desktop or start Docker Engine, then wait until it is ready. `docker info` should succeed.
- **Port 8080 occupied:** set `WEB_PORT=8081` in root `.env`, rerun full-stack Compose, and use port 8081.
- **An unhealthy service:** use `ps` and its service logs above. `--wait` returning an error means startup is not confirmed; inspect logs before using the app.
- **Standalone MongoDB error in development mode:** confirm `.env` points to the LedgerFlow replica set on 27019. The full-stack file supplies its own `mongo:27017` URI internally.
- **Build cannot download packages/images:** check internet access and Docker's proxy settings. The lockfile is included; do not copy `node_modules` from another operating system.
- **Old settings after editing `.env`:** rerun `up --build -d --wait` for containers, or restart the Node watch process in development mode.

## Deployment scope

This provides a reproducible local setup on another machine. It does not configure public hosting, HTTPS, authentication, or a production MongoDB cluster. The single-node replica set enables atomic ledger operations locally; it does not provide high availability.

Reference: [Docker Compose startup order and health checks](https://docs.docker.com/compose/how-tos/startup-order/) and [Nginx reverse proxy behavior](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/).
