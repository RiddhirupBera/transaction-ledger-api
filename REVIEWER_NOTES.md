# Notes for the reviewer

Run from the repository root with Docker Desktop running (Docker Engine with Compose v2 on Linux):

```sh
docker compose -f compose.full.yml up --build -d --wait
```

Open http://localhost:8080. This starts the React frontend, Express API, and a local MongoDB replica set. No MongoDB Atlas account, host Node.js installation, credentials, or .env file is required for Docker mode. Internet access is required for the first build. The database starts empty and persists in a local Docker volume.

Implemented account creation, credits/debits, duplicate-reference protection, balances, filtered/paginated history, immutable transactions, and the bonus Money Transfer feature. Balance changes and ledger entries commit atomically; failed operations roll back. Monetary amounts use fixed two-decimal strings, such as "30.00". Reference IDs must be unique per account; transfer references must be unused in both participating accounts.

For a quick test, create two accounts, credit them with 100.00 and 50.00, then transfer 30.00 from the first to the second using a new reference. Expected balances: 70.00 and 80.00.

README.md contains setup and test instructions. API documentation is in docs/API.md, and assumptions are in docs/ASSUMPTIONS.md. Backend verification: 62 unit/request tests and 34 integration tests passed; the frontend production build passed. Integration tests exercise concurrent requests and rollback failures.
