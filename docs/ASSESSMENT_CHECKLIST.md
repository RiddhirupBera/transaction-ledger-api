# Assessment coverage review

Reviewed against all five pages of **Full Stack Developer Assessment.pdf**, supplied on 29 October 2026. PDF section numbers are preserved below; the original skips section 6. This document records the implementation and checks, rather than claiming an external submission has been sent.

## Requirement coverage

| Assessment section | Requirement | Implementation and verification | Result |
|---|---|---|---|
| 1 Create Account | Unique ID, required name, zero initial balance, system timestamp, no client starting balance | `models/Account.js`, strict creation schema and POST handler. Account and protected-field request tests. `created_at` is exposed with the original `createdAt` alias. | Covered |
| 2 Add Transaction | Unique transaction ID, account ID, type, positive amount, description, reference, timestamp | `models/Transaction.js`, posting schema, shared response serializers. Snake-case field-contract test and legacy request compatibility tests. | Covered |
| 2 Credit and debit | Credits increase, debits decrease, insufficient funds reject without changing balance | `services/ledger.js`. Exact arithmetic, insufficient-funds, boundary/overflow, and concurrent debit tests. | Covered |
| 2 Duplicate Transactions | Reference unique within account, duplicates do not create entry or alter balance, references reusable across accounts | Compound unique index plus transaction-scoped preliminary lookup. Duplicate, cross-account reference, actual unique-index rollback, and concurrent duplicate tests. | Covered |
| 3 Get Account Balance | Account ID and current balance; nonexistent accounts return errors | Balance route returns `account_id`, alias `accountId`, and fixed-scale `balance`; malformed/missing ID tests. | Covered |
| 4 History Filtering | Credit/debit filter; both types when omitted | Filtered count/query in history route; filtering and mixed-history integration checks. | Covered |
| 4 History Pagination | Page/limit, current page, page size, total records, total pages | Validated query, skip/limit, total count, and pagination object. Invalid/duplicate query, empty/out-of-range page tests. | Covered |
| 4 History Sorting | Latest first by creation timestamp | `createdAt DESC, _id DESC`, supporting indexes; distinct timestamps and equal-timestamp tie tests. | Covered |
| 5 Transaction Immutability | No API edits/deletes; all original fields stay unchanged | No mutation routes plus immutable model fields/hooks. Tests attempt PUT/PATCH/DELETE against a saved entry and compare every persisted field before/after. | Covered |
| 5 Balance Consistency | Balance equals valid credits less valid debits; failed postings have no effect | Shared account write and ledger insertion in one transaction. Assessment example 100 + 50 - 30 - 20 = 100, sum-of-ledger assertions, rollback and concurrency tests. | Covered |
| Atomicity on page 4 | Ledger insert and balance update are indivisible | Same Mongoose session with snapshot read concern and majority write concern; real unique-index failure after account write proves rollback. | Covered |
| 7 Validations | All listed required names/IDs/types/amounts/references/funds/body rules | Zod strict boundary schemas, model validation, in-transaction account/funds checks. Unit/request and database-backed negative cases. | Covered |
| 8 Error Handling | Meaningful HTTP statuses and consistent errors | Shared error middleware; 400/404/409/422 with codes/messages and validation details. Malformed JSON, pagination, duplicates, missing accounts, funds failures tested. | Covered |
| 9 Bonus Money Transfer | Both accounts exist, source funds suffice, atomic debit and credit, all-or-nothing rollback | New `POST /api/transfers`, `services/transfer.js`. Assessment example A 100/B 50/transfer 30 gives 70/80. Missing accounts, self-transfer, funds, overflow, duplicates, actual second-entry failure, second-account write failure, concurrent/opposite transfers, and transfer/debit races tested. | Covered |
| 10 Technical Requirements | Chosen framework/database, maintainable structure, constraints, validation, errors, runnable README | Express/Mongoose/MongoDB, layered services/HTTP/config/models, real index verification, Docker Compose replica-set definition, example environment and startup commands. | Covered |
| 11 Submission | Source, README, API documentation, assumptions | `client/`, `server/`, root `README.md`, `docs/API.md`, and new `docs/ASSUMPTIONS.md`. | Present locally |

## Current recheck against the original PDF

Rechecked every instruction across all five source pages against the current models, routes, schemas, services, error middleware, tests, startup files and submission archive. No missing mandatory backend functionality was found; the optional Money Transfer requirement is also implemented. The PDF skips section 6, so no section 6 has been invented. The stated 3–4 hour duration is assessment context, not a runtime feature or an independently verified timing claim.

The current single-page dashboard also includes Money Transfer, editable `transaction` / `transfer` reference defaults, two side-by-side forms on desktop with vertically stacked fields, and sky-blue accents. These are additional user-requested UI features. Reference defaults do not bypass uniqueness validation.

Fresh verification: 62 unit/request tests passed; 34 database integration tests passed against an isolated replica set; client production build passed. `docker compose -f compose.full.yml config --quiet` passed and MongoDB, API, and web services were healthy. The submission ZIP contains the current source and required documentation; no local .env, dependencies, compiled output or database data is included.

Documented boundary choices remain: decimal money is sent as fixed two-decimal strings, description is optional and defaults to an empty string, names need not be unique, and authentication is outside the assessment scope. API responses include all assessment field names.

## Changes made during the original implementation review

1. Implemented the bonus transfer API with two balance writes and two ledger entries in one transaction. Both account writes follow a stable order and reuse bounded retry logic.
2. Added assessment-compatible snake_case response fields and request aliases while retaining existing camelCase dashboard compatibility. Ambiguous aliases are rejected.
3. Extracted shared serializers and balance calculation logic, keeping ordinary posting and transfer behavior consistent.
4. Added explicit assumptions, transfer API examples, and extra tests for the assessment's exact arithmetic and immutability rules.
5. Updated the application walkthrough so it no longer describes transfers as unimplemented.

## Verification performed

- `npm test`: **62 passed** across validation, request, model, retry, and index suites.
- `TEST_MONGODB_URI= npm run test:integration`: **34 passed** against an isolated real MongoDB replica set, including the new transfer cases.
- `npm run build`: frontend production build passed; existing dashboard contract remains supported.
- `docker compose config --quiet`: Compose configuration validated.
- Database regression tests used the temporary replica-set mode. A later portability verification built and launched the complete MongoDB/API/Nginx stack, checked all three services healthy, exercised requests through the proxy, and verified data persistence across container recreation. See [run on another machine](RUN_ON_ANOTHER_MACHINE.md).

No mandatory API behavior from the supplied assessment remains unimplemented. The optional transfer API is also included. Assumptions and operational boundaries are listed separately in [ASSUMPTIONS.md](ASSUMPTIONS.md).
