# DataPulse architecture and design decisions

This document explains how DataPulse is built and, more importantly, why. Each decision lists the alternative that was considered and the trade-off accepted.

## System overview

```text
Browser (React SPA) ──HTTPS + Bearer JWT──▶ Express API ──SQL──▶ PostgreSQL
        ▲                                     │
        └──── Server-Sent Events (/api/events)┘
Apache NiFi ──Bearer machine credential──▶ POST /api/vehicles
```

- **Frontend:** a single-page React app. `App.tsx` owns only the session; `Dashboard` is remounted per session, so no data survives a sign-out. Each section is its own component; data loading lives in hooks.
- **API:** Express 5 with one router per area (`server/src/routes`) and shared rules in `server/src/lib`.
- **Database:** PostgreSQL 16; schema in numbered, idempotent SQL migrations applied by `npm run db:migrate` on every deploy.

## Key decisions

### 1. Vehicle status is derived from history, not edited freely
**Decision.** A vehicle is *sold* if it has a sale record, *in service* if it has an open service job, otherwise *active*. Sales and service workflows set the status; direct edits that contradict history are rejected with 409.
**Why.** An earlier version let users set "sold" by hand, which produced a sold car with no sale and revenue figures that disagreed with the KPIs.
**Trade-off.** Correcting data means recording the missing sale or service job rather than flipping a field. A data-quality check (`sold_without_sale`, `in_service_without_open_job`) surfaces legacy records that predate the rule.

### 2. Row locks inside transactions for every workflow
**Decision.** Recording a sale runs `SELECT … FOR UPDATE` on the vehicle, checks for an existing sale or open service job, inserts the sale and updates the status in one transaction (`withTransaction`).
**Why.** Two people pressing "Record sale" for the same car at the same moment must not both succeed. The lock serialises them; the second sees the first sale and gets 409.
**Alternative.** A unique index on `sales_events(vehicle_id)` would also block duplicates, but the transaction keeps the status update, the audit entry and the duplicate check atomic together.

### 3. The audit log is written in the same transaction as the change
**Decision.** `audit()` takes the transaction's client.
**Why.** If the change rolls back, so does its audit entry. The log never claims something that did not happen, and a committed change is never missing from it.

### 4. Live updates over Server-Sent Events, published after commit
**Decision.** Changes are queued on the request during the transaction and broadcast by middleware only when the response succeeds.
**Why SSE rather than WebSockets.** Updates flow one way (server → browser). SSE runs over plain HTTP, reconnects automatically and needs no extra library or protocol upgrade on the hosting platform.
**Why after commit.** Broadcasting inside the transaction could announce a change that is then rolled back.
**Trade-off.** Fan-out is in memory, so it works for one API instance. Running several instances would move the channel to PostgreSQL `LISTEN/NOTIFY` (no new infrastructure) or Redis pub/sub.
**Security note.** Browsers' `EventSource` cannot send headers, so the token is passed as a query parameter on this one endpoint; query strings are never logged.

### 5. Authentication and authorization
- Passwords: bcrypt (cost 12). Sign-up always creates a **viewer**; any role sent by the client is ignored.
- Sessions: HS256 JWT, 8 hours. **Every request re-reads the user** from the database, so deactivation or a role change takes effect immediately instead of when the token expires. The cost is one indexed lookup per request.
- Roles are checked by the API on every route; the UI only hides controls.
- Machine credentials (NiFi) are random 256-bit tokens stored as SHA-256 hashes, shown once, and limited to adding vehicles.
- Failed sign-ins are rate limited per account and address (10 per 15 minutes), counting only failures so legitimate users are not locked out by their own successful logins.
- Admins cannot change their own account, and the last active admin cannot be removed, so the system cannot be locked out.
- **Trade-off:** the JWT is stored in `localStorage`. An httpOnly cookie would resist XSS better but needs CSRF protection; for a single-origin dashboard with no third-party scripts this was accepted.

### 6. Errors and observability
- Every response carries an `X-Request-Id`; 500 responses include it and the UI shows a short reference, so a reported error maps to one log line.
- One structured JSON log line per request (method, path, status, duration, user ID). Bodies, tokens and query strings are never logged.
- All errors are JSON; stack traces never reach the client.

### 7. Tests cannot damage real data
- API tests (Vitest + Supertest, 115 tests) and browser tests (Playwright) refuse any database whose name does not end in `_test`.
- `npm run test:isolated` and `npm run test:e2e:isolated` create a throwaway PostgreSQL cluster in a temporary directory, run the suite and delete it, so tests need no setup and never touch a developer's database.
- Tests sign tokens with their own random secret and delete every row they create.

### 8. Deployment
- One web service serves both the API and the built dashboard (`SERVE_FRONTEND=true`), so there is a single URL with no CORS configuration in production.
- `render.yaml` provisions the database and service; migrations run on every start. The same image runs locally with `docker compose up`.

## What would change at larger scale
| Concern | Today | At scale |
| --- | --- | --- |
| Live updates | In-memory fan-out, one instance | PostgreSQL LISTEN/NOTIFY or Redis |
| Rate limiting | In-memory per instance | Shared store (Redis) |
| Analytics | Computed on request | Materialised views or a reporting replica |
| Lists | Latest 100 sales/service jobs | Cursor pagination on the API |
| Sessions | JWT in localStorage | httpOnly cookie with CSRF token |
