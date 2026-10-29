# Transaction Ledger API

A transaction ledger built with React, Vite, Express, MongoDB, Mongoose, Zod, and Jest/Supertest. The project uses JavaScript and plain CSS.

## Features

- Create and select accounts with zero initial balance.
- Post credits and debits with exact two-decimal amounts.
- Reject insufficient funds and duplicate references.
- View balances and filtered, paginated transaction history.
- Transfer money between accounts atomically.
- Keep posted transactions immutable through the API.

## Run with Docker

Install and start Docker with Compose v2. From the project root:

```sh
docker compose -f compose.full.yml up --build -d --wait
```

Open http://localhost:8080. The frontend, backend, and MongoDB replica set run together. No local Node.js, MongoDB installation, or .env file is needed for this mode. The first build needs internet access. Data is stored in a Docker volume.

```sh
docker compose -f compose.full.yml ps
docker compose -f compose.full.yml logs --tail=100
docker compose -f compose.full.yml down
```

Stopping the stack retains database data. See [setup and troubleshooting](docs/RUN_ON_ANOTHER_MACHINE.md) for more options.

## Development

Requires Node.js 22.12+ and Docker with Compose v2.

```sh
cp .env.example .env
npm ci
docker compose up -d --wait
npm run dev:server
```

In another terminal:

```sh
npm run dev:client
```

Frontend: http://localhost:5173. Backend: http://localhost:3000/api. The development MongoDB port defaults to 27019. The backend reads the root .env; restart it after changing configuration. MongoDB must run as a replica set for transactions.

## Tests and build

```sh
npm test
npm run test:integration
npm run build
```

The integration suite uses TEST_MONGODB_URI when configured; its database name must end in `_test`. Otherwise it starts a temporary replica set with mongodb-memory-server. The first run downloads MongoDB. To ignore a configured test URI on macOS/Linux:

```sh
TEST_MONGODB_URI= npm run test:integration
```

## Structure

```text
client/              React dashboard, CSS, Vite configuration and Dockerfile
server/src/config/   Environment and MongoDB setup
server/src/http/     Routes, serializers and error handling
server/src/models/   Account and Transaction schemas
server/src/services/ Posting, transfers and transaction retries
server/src/validation/ Zod schemas and money conversion
server/tests/        Unit, request and integration tests
docker/              Replica-set initialization and Nginx configuration
docs/                API documentation, assumptions and setup guide
compose.full.yml     Complete Docker stack
docker-compose.yml   MongoDB-only development stack
```

## Dashboard

Create accounts in the sidebar and select one to see its balance and history. New transaction and Money Transfer appear side by side on desktop and stack on smaller screens. Enter amounts such as `12.34`. Reference fields start with `transaction` or `transfer`; append a unique value such as `transaction-001`. References reset after success and stay unchanged after failure. Transfers require a reference unused in both accounts.

Successful submissions refresh balances and history. Switching accounts resets the selected account's form, filter, and pagination. Use Refresh to fetch updates made elsewhere.

## Data integrity

Money is stored in integer minor units. BigInt calculations check for insufficient funds and overflow before values are stored as safe integers. API money values are fixed two-decimal strings.

A unique compound index on accountId and referenceId prevents duplicate postings. Startup verifies the index. Balance updates and ledger inserts share one MongoDB transaction. Transfers update both accounts and insert both entries in that transaction. Transient conflicts have bounded retries; duplicate-key errors are not retried. An uncertain commit retries only the commit and returns an explicit error if its outcome remains unknown.

There are no public balance-edit or transaction edit/delete endpoints. The local setup has no authentication or real payment integration.

## Documentation

- [API documentation and curl examples](docs/API.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Run on another machine](docs/RUN_ON_ANOTHER_MACHINE.md)

- [Reviewer notes](REVIEWER_NOTES.md)
