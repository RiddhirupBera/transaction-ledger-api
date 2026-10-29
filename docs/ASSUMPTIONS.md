# Transaction Ledger API — Assumptions

Implementation choices for money handling, validation, references, and local deployment.

## Money and account rules

- Money has a fixed scale of two decimal places with no currency field or conversion. Requests and responses use decimal strings, such as `"12.34"`, rather than JSON numbers. This prevents rounding at the API boundary.
- Stored `amountMinor` and `balanceMinor` are safe integer Number values. Calculations and overflow checks use BigInt before conversion back to Number. Supported amounts are `"0.01"` through `"90071992547409.91"`; balances also permit `"0.00"`.
- Accounts always start at zero through the API. The client cannot set IDs, timestamps, or starting balances. Account names are trimmed and nonblank, but need not be unique.
- Credits add funds, debits remove funds, and overdrafts are disallowed. No fees, interest, holds, or exchange rates are modeled.
- Description is optional input and becomes an empty string when omitted. Every transaction response still includes `description`.

## API naming and validation

- Assessment field names `created_at`, `account_id`, and `reference_id` are present in applicable JSON responses. CamelCase aliases (`createdAt`, `accountId`, `referenceId`) are also available. Internal Mongoose fields stay camelCase.
- Posting accepts either `reference_id` or `referenceId`. Transfer requests accept snake_case or camelCase source/destination/reference fields. Supplying both spellings of one field is rejected with 400, even if their values match. Other undeclared body properties are rejected.
- The account for an ordinary posting is supplied in the URL; a second account ID in its body is invalid. ObjectIds accept hexadecimal case variations and are normalized before business logic.
- Missing accounts return 404, malformed requests return 400, duplicate references/conflicts return 409, and valid requests that violate balance or self-transfer rules return 422. Unexpected server errors return a generic 500.

## References and retries

- The UI prefills editable reference values `transaction` and `transfer`. These are convenience defaults, not generated unique references. Users supply a unique suffix or replacement; the database still rejects duplicates. Successful submissions reset defaults; failed submissions retain inputs.
- A trimmed reference is case sensitive and unique per account. The same reference may be used in unrelated accounts. Duplicate requests return 409 and do not replay an earlier success response.
- The reference must identify one business operation. Clients must retain it across timeouts and retries. Unknown commit outcomes require inspecting history; using a new reference risks a second legitimate-looking operation.
- Whole transactions retry only transient-labeled failures, at most five attempts with backoff/jitter. Duplicate key code 11000 and business errors are not retried. Unknown commit results retry only the same commit, at most three commit attempts. These counts do not constitute a strict total network time limit.

## Bonus transfer API

- `POST /api/transfers` accepts a source account, destination account, amount, optional description, and required reference. Source and destination must exist and differ, and source funds must suffice. The destination balance must remain within the safe range.
- One database transaction writes both balances and creates two immutable ledger entries: a source debit and destination credit. Both use the same reference, amount, description, and server timestamp. No separate Transfer collection is needed for this assessment.
- The reference must be unused in both participating accounts, including ordinary postings. A duplicate in either account rejects the entire transfer. The same reference can still be used by a transfer between completely different accounts.
- Account writes occur in stable ObjectId order, with sequential session operations. Transfers share the conflict/retry policy with ordinary postings. Any definitive write or insert failure rolls back the entire transfer. An uncertain commit means the whole transfer outcome is unknown, never that a partial transfer was accepted.
- Transfers are available in the dashboard’s Money Transfer panel with From/To dropdowns, exact decimal amounts, a reference ID, and optional description. A successful transfer refreshes both sidebar balances and the selected account’s balance/history. The existing atomic transfer API performs all balance and ledger writes together. No additional UI page is introduced.

## Persistence and operational scope

- Integrity guarantees apply to this public API and normal application writes. Raw database administration can bypass Mongoose guards; database credentials and access controls must restrict that in a production deployment.
- Account balances are stored running totals maintained atomically with the ledger. No direct balance-edit, account-delete, transaction-edit, or transaction-delete API exists.
- History defaults to page 1 and 10 records, supports limits up to 100, and sorts by creation time then ID descending. Offset pagination can shift when new records are added; rows and total counts are separate reads. Account listing is currently unpaginated.
- The app uses no authentication by the agreed scope. A single-node replica set enables local database transactions, but provides no multi-machine redundancy. MongoDB is exposed only on loopback by the supplied Compose file, without authentication.
- In developer mode, host MongoDB port defaults to 27019 and client/server run on the host. The separate `compose.full.yml` runs all three services in Docker and exposes only the web service on loopback port 8080. No root `.env` is required for full-stack mode; Compose supplies its internal connection settings. Production hosting, cloud deployment, payment processing, and generalized double-entry accounting are outside this local implementation.
